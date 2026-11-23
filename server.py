#!/usr/bin/env python3
"""
Bizora AI backend.

Pure Python standard library: http.server + sqlite3. No pip install needed.
Run:  python3 server.py      then open  http://localhost:8000

Optional: set ANTHROPIC_API_KEY to get real LLM output for the AI features.
Without it, the AI features use built-in smart templates, so the demo always works.
"""
import base64
import hashlib
import hmac
import json
import mimetypes
import math
import os
import random
import re
import secrets
import sqlite3
import sys
import time
import traceback
import urllib.request
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(BASE, "client", "dist")
DB_PATH = os.environ.get("BIZORA_DB", os.path.join(BASE, "bizora.db"))
PORT = int(os.environ.get("PORT", "8000"))
HOST = os.environ.get("HOST", "0.0.0.0")

STATUSES = ["New Order", "Confirmed", "Preparing", "Dispatched", "Delivered", "Cancelled"]
ACTIVE = ["New Order", "Confirmed", "Preparing", "Dispatched"]
BIG = 10 ** 9
PLANS = {
    "free": {"products": 15, "orders": 50, "ai": 20},
    "starter": {"products": 100, "orders": 500, "ai": 200},
    "pro": {"products": BIG, "orders": BIG, "ai": BIG},
}

# --------------------------------------------------------------------------- #
# Secret key (for login tokens)
# --------------------------------------------------------------------------- #
def load_secret():
    env = os.environ.get("BIZORA_SECRET")
    if env:
        return env.encode()
    path = os.path.join(BASE, ".secret")
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read().strip()
    key = secrets.token_hex(32).encode()
    with open(path, "wb") as f:
        f.write(key)
    return key


SECRET = load_secret()

# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT 'Other',
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  track_stock INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New Order',
  discount REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'Cash',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pay_order ON payments(order_id);
"""


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = connect()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def need(d, key, label=None, maxlen=200):
    v = str(d.get(key, "") or "").strip()
    if not v:
        raise ApiError(400, f"{label or key.replace('_', ' ').capitalize()} is required")
    return v[:maxlen]


def opt(d, key, maxlen=500):
    return str(d.get(key, "") or "").strip()[:maxlen]

def number(d, key, default=0.0, minv=0.0):
    raw = d.get(key)

    if raw in (None, ""):
        return float(default)

    try:
        v = float(raw)
    except (TypeError, ValueError):
        raise ApiError(400, f"{key.replace('_', ' ').capitalize()} must be a number")

    if not math.isfinite(v):
        raise ApiError(400, f"{key.replace('_', ' ').capitalize()} must be a valid number")

    if v < minv:
        raise ApiError(400, f"{key.replace('_', ' ').capitalize()} cannot be less than {minv:g}")

    return v


def whole(d, key, default=0, minv=0):
    v = number(d, key, default, minv)

    if not v.is_integer():
        raise ApiError(400, f"{key.replace('_', ' ').capitalize()} must be a whole number")

    return int(v)


def rows(cur):
    return [dict(r) for r in cur.fetchall()]


def money(n):
    n = float(n or 0)
    return "Rs. {:,.0f}".format(n) if abs(n - round(n)) < 0.005 else "Rs. {:,.2f}".format(n)


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_pw(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000).hex()


def make_token(uid):
    payload = b64(json.dumps({"uid": uid, "exp": int(time.time()) + 7 * 86400}).encode())
    sig = b64(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    return payload + "." + sig


def read_token(token):
    try:
        payload, sig = token.split(".", 1)
        good = b64(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        data = json.loads(unb64(payload))
        if data["exp"] < time.time():
            return None
        return int(data["uid"])
    except Exception:
        return None


def user_dict(r):
    return {k: r[k] for k in ("id", "name", "email", "business_name", "business_type", "phone", "city", "plan", "created_at")}


class Ctx:
    def __init__(self, db, uid, body, query):
        self.db = db
        self.uid = uid
        self.body = body
        self.query = query


ROUTES = []


def route(method, pattern, auth=True):
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), fn, auth))
        return fn
    return deco


def get_user(c):
    r = c.db.execute("SELECT * FROM users WHERE id=?", (c.uid,)).fetchone()
    if not r:
        raise ApiError(401, "Please log in again")
    return r


def usage(c):
    u = get_user(c)
    month = datetime.now().strftime("%Y-%m")
    lim = PLANS.get(u["plan"], PLANS["free"])
    used = {
        "products": c.db.execute("SELECT COUNT(*) FROM products WHERE user_id=?", (c.uid,)).fetchone()[0],
        "orders": c.db.execute("SELECT COUNT(*) FROM orders WHERE user_id=?", (c.uid,)).fetchone()[0],
        "ai": c.db.execute("SELECT COUNT(*) FROM ai_log WHERE user_id=? AND substr(created_at,1,7)=?", (c.uid, month)).fetchone()[0],
    }
    return {"plan": u["plan"], "limits": {k: (None if v >= BIG else v) for k, v in lim.items()}, "used": used}


def check_limit(c, what):
    info = usage(c)
    lim = info["limits"][what]
    if lim is not None and info["used"][what] >= lim:
        label = {"products": "products", "orders": "orders", "ai": "AI generations this month"}[what]
        raise ApiError(402, f"Your {info['plan'].title()} plan allows {lim} {label}. Upgrade in Settings to continue.")


# --------------------------------------------------------------------------- #
# Auth + profile
# --------------------------------------------------------------------------- #
EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@route("POST", "/api/auth/register", auth=False)
def register(c):
    d = c.body
    name = need(d, "name", "Your name", 80)
    email = need(d, "email", "Email", 120).lower()
    password = str(d.get("password") or "")
    if not EMAIL_RX.match(email):
        raise ApiError(400, "Enter a valid email address")
    if len(password) < 6:
        raise ApiError(400, "Password must be at least 6 characters")
    biz = need(d, "business_name", "Business name", 100)
    if c.db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        raise ApiError(409, "An account with this email already exists")
    salt = secrets.token_hex(16)
    cur = c.db.execute(
        "INSERT INTO users(name,email,pw_hash,salt,business_name,business_type,phone,city,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        (name, email, hash_pw(password, salt), salt, biz, opt(d, "business_type", 60) or "Other",
         opt(d, "phone", 40), opt(d, "city", 60), now_str()),
    )
    c.uid = cur.lastrowid
    return {"token": make_token(c.uid), "user": user_dict(get_user(c))}


@route("POST", "/api/auth/login", auth=False)
def login(c):
    email = opt(c.body, "email", 120).lower()
    password = str(c.body.get("password") or "")
    r = c.db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not r or not hmac.compare_digest(hash_pw(password, r["salt"]), r["pw_hash"]):
        raise ApiError(401, "Incorrect email or password")
    return {"token": make_token(r["id"]), "user": user_dict(r)}


@route("GET", "/api/me")
def me(c):
    return {"user": user_dict(get_user(c)), "usage": usage(c)}


@route("PUT", "/api/me")
def update_me(c):
    d = c.body
    u = get_user(c)
    plan = opt(d, "plan", 20) or u["plan"]
    if plan not in PLANS:
        raise ApiError(400, "Unknown plan")
    c.db.execute(
        "UPDATE users SET name=?, business_name=?, business_type=?, phone=?, city=?, plan=? WHERE id=?",
        (need(d, "name", "Your name", 80) if "name" in d else u["name"],
         need(d, "business_name", "Business name", 100) if "business_name" in d else u["business_name"],
         opt(d, "business_type", 60) if "business_type" in d else u["business_type"],
         opt(d, "phone", 40) if "phone" in d else u["phone"],
         opt(d, "city", 60) if "city" in d else u["city"],
         plan, c.uid),
    )
    return {"user": user_dict(get_user(c)), "usage": usage(c)}


# --------------------------------------------------------------------------- #
# Products
# --------------------------------------------------------------------------- #
PRODUCT_SQL = """
SELECT p.*, COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id
                      WHERE oi.product_id=p.id AND o.status!='Cancelled'),0) AS sold
FROM products p WHERE p.user_id=?
"""


def clean_image(d):
    """Accepts a web link (http/https) or an uploaded photo sent as a data URL."""
    v = str(d.get("image_url") or "").strip()
    if not v:
        return ""
    if v.startswith("data:image/"):
        if len(v) > 900_000:
            raise ApiError(400, "That photo is too large. Try a smaller one.")
        return v
    if v.startswith(("http://", "https://")) and len(v) <= 500:
        return v
    raise ApiError(400, "Image must be an uploaded photo or a link starting with http:// or https://")


def product_fields(d):
    return (
        need(d, "name", "Product name", 120),
        opt(d, "category", 60),
        opt(d, "description", 1200),
        clean_image(d),
        number(d, "price"),
        number(d, "cost"),
        whole(d, "stock"),
        1 if d.get("track_stock", True) not in (False, 0, "0", "false") else 0,
    )


@route("GET", "/api/products")
def list_products(c):
    return rows(c.db.execute(PRODUCT_SQL + " ORDER BY p.name COLLATE NOCASE", (c.uid,)))


@route("POST", "/api/products")
def create_product(c):
    check_limit(c, "products")
    f = product_fields(c.body)
    cur = c.db.execute(
        "INSERT INTO products(user_id,name,category,description,image_url,price,cost,stock,track_stock,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (c.uid,) + f + (now_str(),),
    )
    return dict(c.db.execute(PRODUCT_SQL + " AND p.id=?", (c.uid, cur.lastrowid)).fetchone())


@route("PUT", r"/api/products/(\d+)")
def update_product(c, pid):
    if not c.db.execute("SELECT 1 FROM products WHERE id=? AND user_id=?", (pid, c.uid)).fetchone():
        raise ApiError(404, "Product not found")
    f = product_fields(c.body)
    c.db.execute(
        "UPDATE products SET name=?,category=?,description=?,image_url=?,price=?,cost=?,stock=?,track_stock=? WHERE id=? AND user_id=?",
        f + (pid, c.uid),
    )
    return dict(c.db.execute(PRODUCT_SQL + " AND p.id=?", (c.uid, pid)).fetchone())


@route("DELETE", r"/api/products/(\d+)")
def delete_product(c, pid):
    cur = c.db.execute("DELETE FROM products WHERE id=? AND user_id=?", (pid, c.uid))
    if not cur.rowcount:
        raise ApiError(404, "Product not found")
    c.db.execute("UPDATE order_items SET product_id=NULL WHERE product_id=?", (pid,))
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Customers
# --------------------------------------------------------------------------- #
CUSTOMER_SQL = """
SELECT c.*,
  (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.status!='Cancelled') AS orders_count,
  COALESCE((SELECT SUM(oi.qty*oi.price) FROM order_items oi JOIN orders o ON o.id=oi.order_id
            WHERE o.customer_id=c.id AND o.status!='Cancelled'),0)
  - COALESCE((SELECT SUM(o.discount) FROM orders o WHERE o.customer_id=c.id AND o.status!='Cancelled'),0) AS total_spent
FROM customers c WHERE c.user_id=?
"""


@route("GET", "/api/customers")
def list_customers(c):
    return rows(c.db.execute(CUSTOMER_SQL + " ORDER BY c.name COLLATE NOCASE", (c.uid,)))


@route("POST", "/api/customers")
def create_customer(c):
    d = c.body
    cur = c.db.execute(
        "INSERT INTO customers(user_id,name,phone,address,notes,created_at) VALUES(?,?,?,?,?,?)",
        (c.uid, need(d, "name", "Customer name", 100), opt(d, "phone", 40), opt(d, "address", 300), opt(d, "notes", 500), now_str()),
    )
    return dict(c.db.execute(CUSTOMER_SQL + " AND c.id=?", (c.uid, cur.lastrowid)).fetchone())


@route("PUT", r"/api/customers/(\d+)")
def update_customer(c, cid):
    d = c.body
    if not c.db.execute("SELECT 1 FROM customers WHERE id=? AND user_id=?", (cid, c.uid)).fetchone():
        raise ApiError(404, "Customer not found")
    name = need(d, "name", "Customer name", 100)
    c.db.execute("UPDATE customers SET name=?,phone=?,address=?,notes=? WHERE id=? AND user_id=?",
                 (name, opt(d, "phone", 40), opt(d, "address", 300), opt(d, "notes", 500), cid, c.uid))
    c.db.execute("UPDATE orders SET customer_name=? WHERE customer_id=? AND user_id=?", (name, cid, c.uid))
    return dict(c.db.execute(CUSTOMER_SQL + " AND c.id=?", (c.uid, cid)).fetchone())


@route("DELETE", r"/api/customers/(\d+)")
def delete_customer(c, cid):
    cur = c.db.execute("DELETE FROM customers WHERE id=? AND user_id=?", (cid, c.uid))
    if not cur.rowcount:
        raise ApiError(404, "Customer not found")
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Orders + payments (plain application logic, no AI)
# --------------------------------------------------------------------------- #
ORDER_SQL = """
SELECT o.*,
  COALESCE((SELECT SUM(qty*price) FROM order_items WHERE order_id=o.id),0) - o.discount AS total,
  COALESCE((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0) AS paid,
  (SELECT GROUP_CONCAT(name || ' x' || qty, ', ') FROM order_items WHERE order_id=o.id) AS items_summary,
  COALESCE((SELECT phone FROM customers WHERE id=o.customer_id),'') AS customer_phone
FROM orders o WHERE o.user_id=?
"""


def finish_order(o):
    o["total"] = round(o["total"], 2)
    o["paid"] = round(o["paid"], 2)
    o["balance"] = round(max(o["total"] - o["paid"], 0), 2)
    if o["paid"] <= 0:
        o["payment_status"] = "Unpaid"
    elif o["balance"] <= 0.005:
        o["payment_status"] = "Paid"
    else:
        o["payment_status"] = "Partial"
    return o


def list_orders_data(db, uid):
    return [finish_order(r) for r in rows(db.execute(ORDER_SQL + " ORDER BY o.created_at DESC, o.id DESC", (uid,)))]


def order_detail(c, oid):
    r = c.db.execute(ORDER_SQL + " AND o.id=?", (c.uid, oid)).fetchone()
    if not r:
        raise ApiError(404, "Order not found")
    o = finish_order(dict(r))
    o["items"] = rows(c.db.execute("SELECT * FROM order_items WHERE order_id=? ORDER BY id", (oid,)))
    o["payments"] = rows(c.db.execute("SELECT * FROM payments WHERE order_id=? ORDER BY created_at, id", (oid,)))
    return o


@route("GET", "/api/orders")
def list_orders(c):
    return list_orders_data(c.db, c.uid)


@route("GET", r"/api/orders/(\d+)")
def get_order(c, oid):
    return order_detail(c, int(oid))


@route("POST", "/api/orders")
def create_order(c):
    d = c.body
    items = d.get("items") or []
    if not isinstance(items, list) or not items:
        raise ApiError(400, "Add at least one item to the order")
    check_limit(c, "orders")

    cust_id, cust_name = None, ""
    if d.get("customer_id"):
        r = c.db.execute("SELECT * FROM customers WHERE id=? AND user_id=?", (int(d["customer_id"]), c.uid)).fetchone()
        if not r:
            raise ApiError(404, "Customer not found")
        cust_id, cust_name = r["id"], r["name"]
    elif isinstance(d.get("customer"), dict) and str(d["customer"].get("name", "")).strip():
        cd = d["customer"]
        cust_name = need(cd, "name", "Customer name", 100)
        cust_id = c.db.execute(
            "INSERT INTO customers(user_id,name,phone,address,notes,created_at) VALUES(?,?,?,?,?,?)",
            (c.uid, cust_name, opt(cd, "phone", 40), opt(cd, "address", 300), "", now_str()),
        ).lastrowid
    else:
        raise ApiError(400, "Select a customer or add a new one")

    oid = c.db.execute(
        "INSERT INTO orders(user_id,customer_id,customer_name,status,notes,due_date,created_at) VALUES(?,?,?,?,?,?,?)",
        (c.uid, cust_id, cust_name, "New Order", opt(d, "notes", 500), opt(d, "due_date", 20), now_str()),
    ).lastrowid

    subtotal = 0.0
    for it in items:
        qty = whole(it, "qty", 1, 1)
        if it.get("product_id"):
            p = c.db.execute("SELECT * FROM products WHERE id=? AND user_id=?", (int(it["product_id"]), c.uid)).fetchone()
            if not p:
                raise ApiError(404, "A selected product no longer exists")
            price = number(it, "price", p["price"])
            name, cost, pid = p["name"], p["cost"], p["id"]
            if p["track_stock"]:
                if qty > p["stock"]:
                    raise ApiError(400, f"Only {p['stock']} of {p['name']} in stock")
                c.db.execute("UPDATE products SET stock=stock-? WHERE id=?", (qty, pid))
        else:
            name, price, cost, pid = need(it, "name", "Item name", 120), number(it, "price"), 0, None
        c.db.execute("INSERT INTO order_items(order_id,product_id,name,qty,price,cost) VALUES(?,?,?,?,?,?)",
                     (oid, pid, name, qty, price, cost))
        subtotal += qty * price

    discount = number(d, "discount")
    if discount > subtotal:
        raise ApiError(400, "Discount cannot be more than the order amount")
    total = subtotal - discount
    advance = number(d, "advance_paid")
    if advance > total + 0.005:
        raise ApiError(400, "Advance payment cannot be more than the total")
    c.db.execute("UPDATE orders SET discount=? WHERE id=?", (discount, oid))
    if advance > 0:
        c.db.execute("INSERT INTO payments(order_id,user_id,amount,method,note,created_at) VALUES(?,?,?,?,?,?)",
                     (oid, c.uid, advance, opt(d, "payment_method", 30) or "Cash", "Advance payment", now_str()))
    return order_detail(c, oid)


def restock(c, oid, sign):
    """sign=+1 puts stock back (cancel/delete), sign=-1 takes it out again."""
    for it in c.db.execute("SELECT oi.product_id, oi.qty, oi.name, p.track_stock, p.stock FROM order_items oi "
                           "LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?", (oid,)).fetchall():
        if it["product_id"] and it["track_stock"]:
            if sign < 0 and it["stock"] < it["qty"]:
                raise ApiError(400, f"Not enough stock of {it['name']} to reopen this order")
            c.db.execute("UPDATE products SET stock=stock+? WHERE id=?", (sign * it["qty"], it["product_id"]))


@route("PUT", r"/api/orders/(\d+)/status")
def set_status(c, oid):
    oid = int(oid)
    status = opt(c.body, "status", 30)
    if status not in STATUSES:
        raise ApiError(400, "Unknown order status")
    r = c.db.execute("SELECT status FROM orders WHERE id=? AND user_id=?", (oid, c.uid)).fetchone()
    if not r:
        raise ApiError(404, "Order not found")
    old = r["status"]
    if old != status:
        if status == "Cancelled":
            restock(c, oid, +1)
        elif old == "Cancelled":
            restock(c, oid, -1)
        c.db.execute("UPDATE orders SET status=? WHERE id=?", (status, oid))
    return order_detail(c, oid)


@route("PUT", r"/api/orders/(\d+)")
def edit_order(c, oid):
    oid = int(oid)
    if not c.db.execute("SELECT 1 FROM orders WHERE id=? AND user_id=?", (oid, c.uid)).fetchone():
        raise ApiError(404, "Order not found")
    c.db.execute("UPDATE orders SET notes=?, due_date=? WHERE id=?",
                 (opt(c.body, "notes", 500), opt(c.body, "due_date", 20), oid))
    return order_detail(c, oid)


@route("DELETE", r"/api/orders/(\d+)")
def delete_order(c, oid):
    oid = int(oid)
    r = c.db.execute("SELECT status FROM orders WHERE id=? AND user_id=?", (oid, c.uid)).fetchone()
    if not r:
        raise ApiError(404, "Order not found")
    if r["status"] != "Cancelled":
        restock(c, oid, +1)
    c.db.execute("DELETE FROM orders WHERE id=?", (oid,))
    return {"ok": True}


@route("POST", r"/api/orders/(\d+)/payments")
def add_payment(c, oid):
    oid = int(oid)
    o = order_detail(c, oid)
    if o["status"] == "Cancelled":
        raise ApiError(400, "This order is cancelled")
    amount = number(c.body, "amount")
    if amount <= 0:
        raise ApiError(400, "Enter an amount greater than 0")
    if amount > o["balance"] + 0.005:
        raise ApiError(400, f"Amount is more than the remaining balance ({money(o['balance'])})")
    c.db.execute("INSERT INTO payments(order_id,user_id,amount,method,note,created_at) VALUES(?,?,?,?,?,?)",
                 (oid, c.uid, amount, opt(c.body, "method", 30) or "Cash", opt(c.body, "note", 200), now_str()))
    return order_detail(c, oid)


@route("DELETE", r"/api/payments/(\d+)")
def delete_payment(c, pid):
    cur = c.db.execute("DELETE FROM payments WHERE id=? AND user_id=?", (pid, c.uid))
    if not cur.rowcount:
        raise ApiError(404, "Payment not found")
    return {"ok": True}


@route("GET", "/api/payments")
def list_payments(c):
    return rows(c.db.execute(
        "SELECT p.*, o.customer_name FROM payments p JOIN orders o ON o.id=p.order_id "
        "WHERE p.user_id=? ORDER BY p.created_at DESC, p.id DESC", (c.uid,)))


# --------------------------------------------------------------------------- #
# Analytics
# --------------------------------------------------------------------------- #
def month_keys(n=6):
    d = datetime.now().replace(day=1)
    keys = []
    for _ in range(n):
        keys.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    return list(reversed(keys))


def analytics_data(db, uid):
    orders = [o for o in list_orders_data(db, uid) if o["status"] != "Cancelled"]
    total_sales = sum(o["total"] for o in orders)
    collected = sum(o["paid"] for o in orders)
    outstanding = sum(o["balance"] for o in orders)
    pending = sum(1 for o in orders if o["status"] in ACTIVE)

    monthly = {k: {"sales": 0.0, "orders": 0} for k in month_keys(6)}
    for o in orders:
        k = o["created_at"][:7]
        if k in monthly:
            monthly[k]["sales"] += o["total"]
            monthly[k]["orders"] += 1
    monthly_list = [{"month": k, "label": datetime.strptime(k, "%Y-%m").strftime("%b"),
                     "sales": round(v["sales"], 2), "orders": v["orders"]} for k, v in monthly.items()]
    cur_m, prev_m = monthly_list[-1]["sales"], monthly_list[-2]["sales"]
    growth = round((cur_m - prev_m) / prev_m * 100, 1) if prev_m > 0 else None

    status_counts = {s: 0 for s in STATUSES}
    for r in db.execute("SELECT status, COUNT(*) n FROM orders WHERE user_id=? GROUP BY status", (uid,)):
        status_counts[r["status"]] = r["n"]

    best = rows(db.execute(
        "SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id "
        "WHERE o.user_id=? AND o.status!='Cancelled' GROUP BY oi.name ORDER BY qty DESC, revenue DESC LIMIT 5", (uid,)))

    cat = rows(db.execute(
        "SELECT COALESCE(NULLIF(p.category,''),'Other') AS category, SUM(oi.qty*oi.price) AS revenue FROM order_items oi "
        "JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id "
        "WHERE o.user_id=? AND o.status!='Cancelled' GROUP BY 1 ORDER BY revenue DESC LIMIT 6", (uid,)))

    gross = db.execute(
        "SELECT COALESCE(SUM(oi.qty*(oi.price-oi.cost)),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id "
        "WHERE o.user_id=? AND o.status!='Cancelled'", (uid,)).fetchone()[0]
    discounts = sum(o["discount"] for o in orders)
    profit = gross - discounts

    spend = {}
    for o in orders:
        s = spend.setdefault(o["customer_name"] or "Unknown", {"name": o["customer_name"] or "Unknown", "orders": 0, "spent": 0.0})
        s["orders"] += 1
        s["spent"] += o["total"]
    top_customers = sorted(spend.values(), key=lambda x: -x["spent"])[:5]

    low_stock = db.execute("SELECT COUNT(*) FROM products WHERE user_id=? AND track_stock=1 AND stock<=3", (uid,)).fetchone()[0]
    return {
        "kpis": {
            "total_sales": round(total_sales, 2), "total_orders": len(orders), "pending_orders": pending,
            "collected": round(collected, 2), "outstanding": round(outstanding, 2), "profit": round(profit, 2),
            "avg_order": round(total_sales / len(orders), 2) if orders else 0,
            "customers": db.execute("SELECT COUNT(*) FROM customers WHERE user_id=?", (uid,)).fetchone()[0],
            "products": db.execute("SELECT COUNT(*) FROM products WHERE user_id=?", (uid,)).fetchone()[0],
            "low_stock": low_stock, "growth": growth,
        },
        "monthly": monthly_list,
        "status_counts": status_counts,
        "best_sellers": best,
        "categories": [{"category": x["category"], "revenue": round(x["revenue"], 2)} for x in cat],
        "top_customers": [{**x, "spent": round(x["spent"], 2)} for x in top_customers],
    }


@route("GET", "/api/analytics")
def analytics(c):
    return analytics_data(c.db, c.uid)


# --------------------------------------------------------------------------- #
# AI layer: real LLM if ANTHROPIC_API_KEY is set, smart templates otherwise
# --------------------------------------------------------------------------- #
def llm(prompt, system="", max_tokens=900):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        body = {"model": os.environ.get("BIZORA_MODEL", "claude-sonnet-5-5"), "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}]}
        if system:
            body["system"] = system
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.load(r)
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        return text or None
    except Exception as e:
        print("LLM call failed, using templates:", e, file=sys.stderr)
        return None


CATS = [
    ("bakery", ["cake", "cupcake", "cookie", "brownie", "bake", "cheesecake", "pastry", "dessert", "bread", "muffin", "donut", "sweet"]),
    ("clothing", ["dress", "shirt", "kurta", "suit", "cloth", "abaya", "hijab", "scarf", "boutique", "fashion", "lawn", "shawl", "frock"]),
    ("jewellery", ["ring", "necklace", "earring", "bracelet", "jewel", "bangle", "pendant", "jhumka"]),
    ("gifts", ["gift", "hamper", "custom", "personal", "mug", "frame", "card"]),
    ("cosmetics", ["lipstick", "makeup", "cosmetic", "skin", "serum", "cream", "perfume", "beauty", "lip"]),
    ("handmade", ["handmade", "craft", "candle", "crochet", "knit", "embroider", "resin", "woven", "art"]),
]
EMOJI = {"bakery": "🍰", "clothing": "👗", "jewellery": "💍", "gifts": "🎁", "cosmetics": "💄", "handmade": "🧵", "general": "✨"}
TAGS = {
    "bakery": ["homebaker", "freshlybaked", "dessertlover", "cakesofinstagram", "sweettooth"],
    "clothing": ["ootd", "fashionstyle", "boutiquefashion", "newarrivals", "stylegoals"],
    "jewellery": ["jewellerylover", "handcraftedjewellery", "accessories", "statementpiece", "giftideas"],
    "gifts": ["giftideas", "customgifts", "personalisedgifts", "giftsforher", "surprise"],
    "cosmetics": ["beautyessentials", "makeuplover", "skincareroutine", "glowup", "selfcare"],
    "handmade": ["handmadewithlove", "madebyhand", "artisan", "supportsmallmakers", "craftsofinstagram"],
    "general": ["newarrival", "musthave", "quality", "customerlove", "trending"],
}
GENERIC_TAGS = ["smallbusiness", "shoplocal", "supportsmallbusiness", "madewithlove"]
BIZ_CAT = {"bakery": "bakery", "clothing": "clothing", "jewellery": "jewellery", "gifts": "gifts", "cosmetics": "cosmetics", "handmade": "handmade"}


def detect_cat(*texts):
    blob = " ".join(t.lower() for t in texts if t)
    for key, words in CATS:
        if any(w in blob for w in words):
            return key
    return "general"


def slug(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def make_hashtags(name, cat, biz, n):
    tags = []
    words = [slug(w) for w in re.split(r"\s+", name) if len(slug(w)) > 3]
    if name and slug(name):
        tags.append(slug(name))
    tags += words
    if biz and slug(biz):
        tags.append(slug(biz))
    tags += TAGS.get(cat, TAGS["general"]) + GENERIC_TAGS
    seen, out = set(), []
    for t in tags:
        if t and t not in seen:
            seen.add(t)
            out.append("#" + t)
    return out[:n]


OPENERS = {
    "friendly": ["Treat yourself today", "Your day just got better", "Made with love, just for you"],
    "luxury": ["Elegance, made personal", "Crafted for those who notice the details", "A little luxury, every single day"],
    "fun": ["Plot twist: you need this", "Warning: extremely hard to resist", "Obsessed doesn't even cover it"],
    "professional": ["Now available", "Introducing", "New in our collection"],
}


def cta_for(platform, biz):
    if platform == "WhatsApp":
        return "Message us here on WhatsApp to place your order."
    if platform == "Facebook":
        return "Comment or send us a message to order."
    return "DM us to order 💌"


def gen_templates(kind, info):
    name, price, details = info["name"], info["price"], info["details"]
    biz, tone, platform = info["biz"], info["tone"], info["platform"]
    cat = detect_cat(name, info["category"], info["btype"])
    e = EMOJI[cat]
    r = random.Random(hash((name, kind, tone, time.time() // 30)))
    openers = OPENERS.get(tone, OPENERS["friendly"])
    price_line = f" Only {money(price)}." if price else ""
    det = f" {details.rstrip('.')}." if details else ""
    cta = cta_for(platform, biz)
    n_tags = {"Instagram": 8, "Facebook": 4, "WhatsApp": 0}.get(platform, 6)
    tags = " ".join(make_hashtags(name, cat, biz, n_tags))
    tail = f"\n\n{tags}" if tags else ""

    if kind == "caption":
        op = r.sample(openers, 2)
        return [
            {"title": "Short and punchy", "text": f"{op[0]} {e}\n\n{name}.{det}{price_line}\n\n{cta}{tail}"},
            {"title": "Story style", "text": f"Behind every {name} is a lot of care. {details.rstrip('.') + '.' if details else 'Each order is prepared with attention to detail, just the way you like it.'} {e}\n\nFrom our kitchen to your door, we make sure it feels special.{price_line}\n\n{cta}{tail}"},
            {"title": "Limited-slot offer", "text": f"{e} Booking open this week! {name}{(' at ' + money(price)) if price else ''}.\nSlots fill up fast, so reserve yours early.\n\n{op[1]}. {cta}{tail}"},
        ]
    if kind == "description":
        body = details.rstrip(".") + "." if details else f"Made with quality ingredients and finished with care, so every piece feels worth the wait."
        return [
            {"title": "Short description", "text": f"{name} from {biz}. {body}{price_line}"},
            {"title": "Detailed description", "text": f"{name}\n\n{body} Whether it is for yourself or someone special, {name.lower()} is a choice you will be happy with.\n\nWhy customers love it:\n• Prepared fresh and handled with care\n• Great for gifting and special occasions\n• Easy ordering on WhatsApp, Instagram or Facebook{price_line and chr(10) + 'Price:' + price_line[5:]}"},
        ]
    if kind == "hashtags":
        big = " ".join(make_hashtags(name, cat, biz, 15))
        return [
            {"title": "Best for Instagram (15)", "text": big},
            {"title": "Short set (5)", "text": " ".join(make_hashtags(name, cat, biz, 5))},
        ]
    # campaign
    p = money(price) if price else "your best seller"
    return [
        {"title": "Advance booking bonus", "text": f"Offer 10% off {name} when customers pay a 50% advance within 24 hours. This secures orders early and improves your cash flow.\nPost idea: a countdown story with a 'Book now' button.\nSuggested length: 5 days."},
        {"title": "Weekend bundle", "text": f"Pair {name} with a small add-on at a combined price. Customers feel they are getting more, and you move slower items.\nPost idea: a photo of the bundle with the price tag.\nSuggested length: Friday to Sunday."},
        {"title": "Refer a friend", "text": f"Give a small discount to anyone who brings a friend who orders {name}. Both of them get the same reward.\nPost idea: 'Share this post with a friend who deserves a treat {e}'.\nSuggested length: 2 weeks."},
        {"title": "24-hour flash deal", "text": f"Run a one-day special price on {name} ({p} normally). Announce it in the morning, remind at noon, close at night.\nPost idea: three stories with a countdown sticker.\nSuggested length: 1 day."},
    ]


LLM_PROMPTS = {
    "caption": "Write 3 different social media captions (each with a short title line like 'Title: ...').",
    "description": "Write 2 product descriptions: one short, one detailed (each with a title line).",
    "hashtags": "Write 2 hashtag sets: one with 15 tags, one with 5 tags (each with a title line).",
    "campaign": "Suggest 4 practical promotion or discount campaign ideas for this product (each with a title line, a short explanation, a post idea, and a duration).",
}


def gen_llm(kind, info):
    prompt = (
        f"Business: {info['biz']} ({info['btype']}).\nProduct: {info['name']}. Category: {info['category'] or 'n/a'}. "
        f"Price: {money(info['price']) if info['price'] else 'n/a'}. Details: {info['details'] or 'n/a'}.\n"
        f"Platform: {info['platform']}. Tone: {info['tone']}.\n\n{LLM_PROMPTS[kind]}\n"
        "Separate each item with a line containing only ---. Format each item as: first line = title, then the content. "
        "Write like a real small business owner, no corporate wording, no em dashes. Do not add any intro or outro."
    )
    text = llm(prompt, system="You write marketing content for small home-based businesses.")
    if not text:
        return None
    out = []
    for chunk in re.split(r"\n\s*---+\s*\n", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        lines = chunk.split("\n", 1)
        title = re.sub(r"^(title:|\*+|#+)\s*", "", lines[0].strip(), flags=re.I).strip("* ")
        out.append({"title": title[:60] or "Option", "text": (lines[1] if len(lines) > 1 else lines[0]).strip()})
    return out or None


@route("POST", "/api/ai/marketing")
def ai_marketing(c):
    d = c.body
    kind = opt(d, "kind", 20) or "caption"
    if kind not in LLM_PROMPTS:
        raise ApiError(400, "Unknown content type")
    check_limit(c, "ai")
    u = get_user(c)
    name, category, price, details = opt(d, "name", 120), opt(d, "category", 60), number(d, "price"), opt(d, "details", 600)
    if d.get("product_id"):
        p = c.db.execute("SELECT * FROM products WHERE id=? AND user_id=?", (int(d["product_id"]), c.uid)).fetchone()
        if p:
            name = name or p["name"]
            category = category or p["category"]
            price = price or p["price"]
            details = details or p["description"]
    if not name:
        raise ApiError(400, "Choose a product or type a product name")
    info = {"name": name, "category": category, "price": price, "details": details, "biz": u["business_name"],
            "btype": u["business_type"], "tone": opt(d, "tone", 20) or "friendly", "platform": opt(d, "platform", 20) or "Instagram"}
    options = gen_llm(kind, info)
    source = "ai"
    if not options:
        options, source = gen_templates(kind, info), "template"
    c.db.execute("INSERT INTO ai_log(user_id,kind,created_at) VALUES(?,?,?)", (c.uid, kind, now_str()))
    return {"kind": kind, "options": options, "source": source}


def build_insights(c, focus="general"):
    db, uid = c.db, c.uid
    orders = list_orders_data(db, uid)
    live = [o for o in orders if o["status"] != "Cancelled"]
    products = rows(db.execute("SELECT * FROM products WHERE user_id=?", (uid,)))
    today = datetime.now()
    out = []

    def add(topic, pri, title, text, page):
        out.append({"topic": topic, "priority": pri, "title": title, "text": text, "page": page})

    if not products:
        add("sales", "high", "Add your first products", "Your catalogue is empty. Add a few products with prices and photos so orders and AI captions have something to work with.", "products")
    if products and not orders:
        add("sales", "high", "Record your first order", "You have products but no orders yet. Record one order to see your dashboard and payment tracking come alive.", "orders")

    active = [o for o in live if o["status"] in ACTIVE]
    due_soon = []
    for o in active:
        if o["due_date"]:
            try:
                dd = datetime.strptime(o["due_date"], "%Y-%m-%d")
                if dd <= today + timedelta(days=2):
                    due_soon.append((dd, o))
            except ValueError:
                pass
    if due_soon:
        due_soon.sort(key=lambda x: x[0])
        names = ", ".join(f"{o['customer_name']} ({dd.strftime('%d %b')})" for dd, o in due_soon[:3])
        add("orders", "high", f"{len(due_soon)} order(s) due within 2 days", f"Check these first: {names}. Confirm details with the customer today.", "orders")
    stale = [o for o in active if o["status"] == "New Order" and (today - datetime.strptime(o["created_at"], "%Y-%m-%d %H:%M:%S")).days >= 2]
    if stale:
        add("orders", "medium", f"{len(stale)} order(s) still marked New Order", "These have been waiting for 2+ days. Confirm them with the customer so nothing slips through the cracks.", "orders")
    elif active:
        add("orders", "low", f"{len(active)} active order(s) in progress", "Keep statuses up to date so customers always know where their order is. A quick WhatsApp update goes a long way.", "orders")

    owing = sorted([o for o in live if o["balance"] > 0], key=lambda o: -o["balance"])
    if owing:
        total_owed = sum(o["balance"] for o in owing)
        delivered_owing = [o for o in owing if o["status"] == "Delivered"]
        top = ", ".join(f"{o['customer_name']} ({money(o['balance'])})" for o in owing[:3])
        if delivered_owing:
            add("payments", "high", f"{money(sum(o['balance'] for o in delivered_owing))} unpaid on delivered orders", f"These customers already received their order: {', '.join(o['customer_name'] for o in delivered_owing[:3])}. Send a polite payment reminder today.", "payments")
        add("payments", "medium", f"{money(total_owed)} still to collect", f"Biggest balances: {top}. Ask for the remaining amount before dispatch to protect your cash flow.", "payments")

    low = [p for p in products if p["track_stock"] and p["stock"] <= 3]
    if low:
        out_of = [p["name"] for p in low if p["stock"] <= 0]
        txt = ", ".join(f"{p['name']} ({p['stock']} left)" for p in low[:4])
        add("stock", "high" if out_of else "medium", f"{len(low)} product(s) running low", f"{txt}. Restock soon or pause promoting these until you do.", "products")

    d90 = (today - timedelta(days=90)).strftime("%Y-%m-%d")
    best = rows(db.execute(
        "SELECT oi.name, SUM(oi.qty) q FROM order_items oi JOIN orders o ON o.id=oi.order_id "
        "WHERE o.user_id=? AND o.status!='Cancelled' AND o.created_at>=? GROUP BY oi.name ORDER BY q DESC LIMIT 1", (uid, d90)))
    if best:
        add("marketing", "medium", f"{best[0]['name']} is your best seller", f"{best[0]['q']} sold in the last 90 days. Feature it in this week's posts and try a bundle with a slower product.", "marketing")

    d30 = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    sold30 = {r["product_id"] for r in db.execute(
        "SELECT DISTINCT oi.product_id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=? AND o.status!='Cancelled' AND o.created_at>=?", (uid, d30))}
    slow = [p for p in products if p["id"] not in sold30 and p["stock"] > 0 and p["created_at"][:10] <= (today - timedelta(days=14)).strftime("%Y-%m-%d")]
    if slow and orders:
        add("marketing", "low", f"{len(slow)} product(s) with no sales in 30 days", f"Give a push to: {', '.join(p['name'] for p in slow[:4])}. A small discount or a fresh photo caption can wake them up.", "marketing")

    a = analytics_data(db, uid)
    g = a["kpis"]["growth"]
    if g is not None:
        if g < 0:
            add("sales", "medium", f"Sales are down {abs(g)}% vs last month", "Run a short campaign this week, like an advance-booking discount, and remind past customers.", "marketing")
        else:
            add("sales", "low", f"Sales are up {g}% vs last month", "Good momentum. Keep posting consistently and ask happy customers for reviews.", "analytics")

    by_cust = {}
    for o in live:
        by_cust.setdefault(o["customer_name"], []).append(o["created_at"])
    gone = [n for n, ds in by_cust.items() if len(ds) == 1 and (today - datetime.strptime(ds[0], "%Y-%m-%d %H:%M:%S")).days > 30]
    if gone:
        add("customers", "medium", f"{len(gone)} one-time customer(s) haven't returned", f"Message {', '.join(gone[:3])} with a friendly hello and a small offer. Win-back messages are the cheapest sales you can get.", "customers")
    loyal = [n for n, ds in by_cust.items() if len(ds) >= 3]
    if loyal:
        add("customers", "low", f"{len(loyal)} repeat customer(s)", f"{', '.join(loyal[:3])} keep coming back. Thank them personally or offer an early-access treat.", "customers")

    order_rank = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda x: order_rank[x["priority"]])
    wanted = {"promote": ["marketing", "sales"], "followup": ["orders", "payments", "customers"], "stock": ["stock", "marketing"]}.get(focus)
    if wanted:
        picked = [i for i in out if i["topic"] in wanted]
        out = picked or out

    k = a["kpis"]
    if not live:
        summary = "No order data yet. Once you record a few orders, I can point out what to promote and who to follow up with."
    else:
        summary = (f"You have {k['pending_orders']} active order{'' if k['pending_orders'] == 1 else 's'} and {money(k['outstanding'])} still to collect. "
                   f"Total sales so far: {money(k['total_sales'])} from {k['total_orders']} order{'' if k['total_orders'] == 1 else 's'}.")
        if best:
            summary += f" {best[0]['name']} is leading your sales."
    return summary, out


@route("POST", "/api/ai/insights")
def ai_insights(c):
    check_limit(c, "ai")
    focus = opt(c.body, "focus", 20) or "general"
    summary, items = build_insights(c, focus)
    source = "template"
    text = llm(
        "Here is a snapshot of a small business:\n" + summary + "\nInsights found:\n" +
        "\n".join(f"- {i['title']}: {i['text']}" for i in items[:8]) +
        "\n\nWrite a friendly 2-3 sentence summary for the owner of what matters most this week. No em dashes, no jargon.",
        system="You are a practical business advisor for small home-based sellers.", max_tokens=250)
    if text:
        summary, source = text, "ai"
    c.db.execute("INSERT INTO ai_log(user_id,kind,created_at) VALUES(?,?,?)", (c.uid, "insights", now_str()))
    return {"summary": summary, "insights": items, "source": source}


@route("GET", "/api/ai/quick-insights")
def quick_insights(c):
    """Dashboard teaser: no AI quota used, rule-based only."""
    summary, items = build_insights(c)
    return {"summary": summary, "insights": items[:3]}


# --------------------------------------------------------------------------- #
# Sample data (Sweet Crumbs, a home bakery) so demos look great instantly
# --------------------------------------------------------------------------- #
@route("POST", "/api/demo/seed")
def seed(c):
    if c.db.execute("SELECT 1 FROM products WHERE user_id=?", (c.uid,)).fetchone() or \
       c.db.execute("SELECT 1 FROM orders WHERE user_id=?", (c.uid,)).fetchone():
        raise ApiError(400, "Sample data can only be loaded into an empty account")
    r = random.Random(7)
    now = datetime.now()
    prods = [
        ("Chocolate Cake", "Cakes", 2500, 1400, 12, "Rich chocolate sponge with ganache. 2 lb, serves 8 to 10."),
        ("Red Velvet Cupcakes (box of 6)", "Cupcakes", 1800, 900, 20, "Soft red velvet with cream cheese frosting."),
        ("Vanilla Birthday Cake", "Cakes", 3200, 1800, 8, "Classic vanilla layers with buttercream. Custom message on top."),
        ("Brownie Box (12 pcs)", "Brownies", 1500, 700, 15, "Fudgy walnut brownies, packed in a gift box."),
        ("Cookie Jar", "Cookies", 1100, 500, 18, "Chunky chocolate chip cookies in a reusable jar."),
        ("Cheesecake Slice", "Desserts", 650, 280, 2, "Baked New York style cheesecake with berry sauce."),
        ("Custom Theme Cake", "Cakes", 5500, 3000, 5, "Fully customised cake made to your theme. Order 3 days ahead."),
    ]
    pid = []
    for n, cat, price, cost, stock, desc in prods:
        pid.append(c.db.execute(
            "INSERT INTO products(user_id,name,category,description,price,cost,stock,track_stock,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (c.uid, n, cat, desc, price, cost, stock, 1, (now - timedelta(days=170)).strftime("%Y-%m-%d %H:%M:%S"))).lastrowid)
    custs = [("Ayesha Khan", "0300-1234567", "Satellite Town"), ("Hamza Ali", "0321-7654321", "Model Colony"),
             ("Sana Malik", "0333-2468101", "DHA Phase 2"), ("Bilal Ahmed", "0345-1357911", "Bahria Town"),
             ("Maryam Siddiqui", "0301-9988776", "Gulshan"), ("Usman Tariq", "0312-4455667", "Johar Town"),
             ("Hira Noor", "0302-8899001", "Askari 10"), ("Zainab Raza", "0334-1122334", "Clifton")]
    cid = [c.db.execute("INSERT INTO customers(user_id,name,phone,address,created_at) VALUES(?,?,?,?,?)",
                        (c.uid, n, ph, ad, (now - timedelta(days=170)).strftime("%Y-%m-%d %H:%M:%S"))).lastrowid for n, ph, ad in custs]
    methods = ["Cash", "Bank Transfer", "EasyPaisa", "JazzCash"]
    days_list = sorted([int(r.random() * 172) for _ in range(32)] + [0, 1, 3, 5], reverse=True)
    for days in days_list:
        when = (now - timedelta(days=days)).replace(hour=r.randint(9, 20), minute=r.randint(0, 59), second=0, microsecond=0)
        ci = r.randrange(len(cid))
        if days > 5:
            status = "Delivered"
        elif days > 2:
            status = r.choice(["Preparing", "Dispatched", "Confirmed"])
        else:
            status = r.choice(["New Order", "Confirmed", "Preparing"])
        due = (now + timedelta(days=r.randint(0, 6))).strftime("%Y-%m-%d") if status in ACTIVE else ""
        oid = c.db.execute("INSERT INTO orders(user_id,customer_id,customer_name,status,due_date,created_at) VALUES(?,?,?,?,?,?)",
                           (c.uid, cid[ci], custs[ci][0], status, due, when.strftime("%Y-%m-%d %H:%M:%S"))).lastrowid
        total = 0
        for pi in r.sample(range(len(prods)), r.choice([1, 1, 2, 2, 3])):
            qty = 1 if prods[pi][1] == "Cakes" else r.randint(1, 3)
            c.db.execute("INSERT INTO order_items(order_id,product_id,name,qty,price,cost) VALUES(?,?,?,?,?,?)",
                         (oid, pid[pi], prods[pi][0], qty, prods[pi][2], prods[pi][3]))
            total += qty * prods[pi][2]
        ts = when.strftime("%Y-%m-%d %H:%M:%S")
        if status == "Delivered":
            if r.random() < 0.9:
                c.db.execute("INSERT INTO payments(order_id,user_id,amount,method,note,created_at) VALUES(?,?,?,?,?,?)",
                             (oid, c.uid, total, r.choice(methods), "Full payment", ts))
            else:
                part = round(total * 0.6 / 50) * 50
                c.db.execute("INSERT INTO payments(order_id,user_id,amount,method,note,created_at) VALUES(?,?,?,?,?,?)",
                             (oid, c.uid, part, r.choice(methods), "Partial payment", ts))
        else:
            adv = min(total, round(total * r.choice([0.3, 0.4, 0.5]) / 50) * 50)
            if adv > 0:
                c.db.execute("INSERT INTO payments(order_id,user_id,amount,method,note,created_at) VALUES(?,?,?,?,?,?)",
                             (oid, c.uid, adv, r.choice(methods), "Advance payment", ts))
    return {"ok": True}


@route("POST", "/api/demo/reset")
def reset_data(c):
    for t in ("orders", "products", "customers", "ai_log"):
        c.db.execute(f"DELETE FROM {t} WHERE user_id=?", (c.uid,))
    return {"ok": True}


@route("GET", "/api/health", auth=False)
def health(c):
    return {"ok": True, "ai": "llm" if os.environ.get("ANTHROPIC_API_KEY") else "templates"}


# --------------------------------------------------------------------------- #
# HTTP server
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    server_version = "BizoraAI/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("BIZORA_QUIET") != "1":
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def send_json(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def serve_static(self, path):
        if not os.path.isfile(os.path.join(FRONT, "index.html")):
            msg = (b"<h2>Bizora AI backend is running</h2><p>The React app is not built yet. "
                   b"Run <code>npm install</code> and <code>npm run build</code> inside the <code>client</code> folder, "
                   b"or use <code>npm run dev</code> and open http://localhost:5173</p>")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        full = os.path.realpath(os.path.join(FRONT, rel))
        if not full.startswith(os.path.realpath(FRONT) + os.sep) or not os.path.isfile(full):
            self.send_json(404, {"error": "Not found"})
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def handle_any(self):
        url = urlparse(self.path)
        path = url.path
        if not path.startswith("/api/"):
            if self.command in ("GET", "HEAD"):
                return self.serve_static(path)
            return self.send_json(405, {"error": "Method not allowed"})

        conn = connect()
        try:
            body = {}
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                if length > 2_000_000:
                    raise ApiError(413, "Request too large")
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except ValueError:
                    raise ApiError(400, "Invalid JSON")
                if not isinstance(body, dict):
                    raise ApiError(400, "Invalid request body")
            query = {k: v[0] for k, v in parse_qs(url.query).items()}
            matched = False
            for method, rx, fn, auth in ROUTES:
                m = rx.match(path)
                if not m:
                    continue
                matched = True
                if method != self.command:
                    continue
                uid = None
                if auth:
                    h = self.headers.get("Authorization", "")
                    uid = read_token(h[7:]) if h.startswith("Bearer ") else None
                    if not uid:
                        raise ApiError(401, "Please log in")
                ctx = Ctx(conn, uid, body, query)
                result = fn(ctx, *m.groups())
                conn.commit()
                status = 201 if self.command == "POST" and isinstance(result, dict) and "id" in result else 200
                return self.send_json(status, result)
            raise ApiError(405 if matched else 404, "Method not allowed" if matched else "Not found")
        except ApiError as e:
            conn.rollback()
            self.send_json(e.status, {"error": e.message})
        except Exception:
            conn.rollback()
            traceback.print_exc()
            self.send_json(500, {"error": "Something went wrong on the server"})
        finally:
            conn.close()

    do_GET = do_POST = do_PUT = do_DELETE = do_HEAD = handle_any


def main():
    init_db()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    mode = "LLM (ANTHROPIC_API_KEY found)" if os.environ.get("ANTHROPIC_API_KEY") else "built-in templates"
    print(f"\n  Bizora AI is running  ->  http://localhost:{PORT}\n  AI mode: {mode}\n  Press Ctrl+C to stop\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
