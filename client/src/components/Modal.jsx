import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Stack of open modals so that Escape only closes the top one
const stack = [];

export default function Modal({ title, onClose, wide, children }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const me = Symbol('modal');
    stack.push(me);
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && stack[stack.length - 1] === me) closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (!stack.length) document.body.style.overflow = '';
    };
  }, []);

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}