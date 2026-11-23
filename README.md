# Bizora AI

Promote Smarter. Manage Easier. Grow Faster.

One website where a small business owner manages products, orders, customers and payments, creates marketing content with AI, and checks sales analytics.

- Frontend: React (Vite), plain CSS with all colors in one file
- Backend: Python (standard library only) with SQLite

## Option 1: just run it (only Python needed)

The React app is already built inside `client/dist`.

```bash
python3 server.py
```

Open http://localhost:8000, create an account, then click **Load sample data** to see a demo bakery (Sweet Crumbs).

## Option 2: develop the React app (one command)

Needs Node.js. Both the backend and the React dev server start together:

```bash
python dev.py
```

Open http://localhost:5173. The first run installs the React packages by itself. Edits to files in `client/src` show up instantly. Press Ctrl+C once to stop both servers.

(If you prefer two terminals: `python server.py` in one, and `cd client && npm install && npm run dev` in the other.)

When you are done editing, build for production and the Python server will serve it:

```bash
cd client
npm run build
```

## Where things are

```
dev.py                       Starts backend + React together (development)
server.py                    Backend: API, login, SQLite database, AI endpoints
client/src/styles/colors.css ALL colors (change these to re-theme the whole site)
client/src/styles/style.css  Layout and animations (uses only the color variables)
client/src/App.jsx           Routing (login guard, public pages, app pages)
client/src/context.jsx       Logged-in user, theme, toasts, confirm dialogs
client/src/api.js            Talks to the backend
client/src/hooks.js          Router and data-loading hooks
client/src/components/       Shell (sidebar), Modal, charts, order modals
client/src/pages/            Home, Auth, Dashboard, Products, Orders, Customers,
                             Payments, Marketing, Assistant, Analytics, Settings
```

## Optional settings (environment variables for server.py)

| Variable | What it does |
| --- | --- |
| `PORT` | Port to run on (default 8000) |
| `ANTHROPIC_API_KEY` | Turns on real LLM writing for AI Marketing and the AI summary. Without it the app uses built-in templates, so the demo always works. |
| `BIZORA_MODEL` | Model name for the API (default `claude-sonnet-5-5`) |
| `BIZORA_DB` | Path of the SQLite database file |

## Notes

- Order totals, balances, stock and payment status are plain application logic, not AI, so the numbers stay exact.
- Order flow: New Order, Confirmed, Preparing, Dispatched, Delivered (or Cancelled, which returns stock).
- Plans (Free, Starter, Pro) enforce limits on products, orders and AI generations. Switching plans in Settings is instant and takes no payment, since this is a demo.
- Data is stored in `bizora.db` next to `server.py`. Delete that file to start fresh.
- Product photos can be uploaded from a phone or computer. They are resized to 720px in the browser and saved in the database, so no separate image folder is needed. A photo link also works.
- Charts are small hand-written SVG components, so there is no chart library to install. Recharts can be swapped in later if you prefer.
