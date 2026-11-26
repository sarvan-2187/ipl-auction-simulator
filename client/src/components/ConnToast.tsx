// Connection status as a small floating toast (instead of a full-width banner).
// Waits a moment before showing so quick blips and the first connect stay silent,
// then confirms briefly when the connection is back.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function ConnToast({ connected }: { connected: boolean }) {
  const [show, setShow] = useState<'off' | 'lost' | 'back'>('off');
  const everConnected = useRef(false);
  useEffect(() => {
    if (connected) {
      const wasLost = show === 'lost';
      everConnected.current = true;
      if (!wasLost) { setShow('off'); return; }
      setShow('back');
      const t = setTimeout(() => setShow('off'), 1800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShow('lost'), everConnected.current ? 1200 : 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return (
    <div className="conn-toast-wrap" aria-live="polite">
      <AnimatePresence mode="wait">
        {show !== 'off' && (
          <motion.div
            key={show}
            className={`conn-toast ${show}`}
            role="status"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            {show === 'lost' ? <span className="ct-spin" aria-hidden="true" /> : (
              <svg className="ct-ok" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            )}
            <div>
              <b>{show === 'lost' ? (everConnected.current ? 'Reconnecting…' : 'Connecting…') : 'Back online'}</b>
              {show === 'lost' && <small>{everConnected.current ? 'Your seat and squad are kept' : 'Waking up the auction server'}</small>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
