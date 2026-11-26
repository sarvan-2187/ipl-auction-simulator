import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type Ask = { title: string; body?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void };
let push: ((a: Ask) => void) | null = null;

// Promise-based replacement for window.confirm
export function confirmDialog(o: { title: string; body?: string; ok?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(o.title));
    push({ title: o.title, body: o.body, ok: o.ok || 'Confirm', danger: o.danger, resolve });
  });
}

export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => { push = setAsk; return () => { push = null; }; }, []);
  const done = (v: boolean) => { ask?.resolve(v); setAsk(null); };
  useEffect(() => {
    if (!ask) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ask]);
  return (
    <AnimatePresence>
      {ask && (
        <motion.div className="confirm-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(false)}>
          <motion.div className="confirm-box" role="alertdialog" aria-modal="true" aria-label={ask.title} onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <h3>{ask.title}</h3>
            {ask.body && <p>{ask.body}</p>}
            <div className="confirm-actions">
              <button className="btn" onClick={() => done(false)}>Cancel</button>
              <button className={`btn ${ask.danger ? 'btn-danger' : 'btn-gold'}`} autoFocus onClick={() => done(true)}>{ask.ok}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
