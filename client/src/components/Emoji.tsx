// Consistent, self-hosted emoji + flags so every phone/PC shows the same art.
// Emoji: Microsoft Fluent Emoji 3D (MIT). Flags: flag-icons (MIT) + a custom West Indies flag.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../lib/socket';
import { REACTIONS, type ReactionKey } from '../lib/reactions';

export function Emoji({ name, size = 24, className = '', alt = '' }: { name: string; size?: number; className?: string; alt?: string }) {
  return <img src={`/emoji/${name}.webp`} width={size} height={size} alt={alt} className={`emoji ${className}`} draggable={false} decoding="async" />;
}

export function Flag({ cc, title }: { cc: string; title?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok || !cc) return null;
  return <img src={`/flags/${cc}.svg`} alt="" title={title} className="flag" onError={() => setOk(false)} draggable={false} />;
}

export function PlaneIcon({ size = 12 }: { size?: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" aria-label="Overseas" role="img">
      <path fill="currentColor" d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z" />
    </svg>
  );
}

export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19.5 5.5a9 9 0 0 1 0 13" /></>}
    </svg>
  );
}

// Throttled sender shared by the bar and the tray
let lastSent = 0;
export function sendReaction(key: ReactionKey) {
  const now = Date.now();
  if (now - lastSent < 350) return;
  lastSent = now;
  call('react', { emoji: key });
}

export function ReactionBar({ className = '' }: { className?: string }) {
  return (
    <div className={`react-bar ${className}`} role="group" aria-label="Send a reaction">
      {REACTIONS.map((r) => (
        <button key={r.key} onClick={() => sendReaction(r.key)} aria-label={r.label} title={r.label}>
          <Emoji name={r.key} size={22} />
        </button>
      ))}
    </div>
  );
}

// Phones: one button that pops open a tray, so reactions don't eat a whole row
export function ReactionTray() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const t = setTimeout(() => setOpen(false), 4000);
    window.addEventListener('pointerdown', close);
    return () => { window.removeEventListener('pointerdown', close); clearTimeout(t); };
  }, [open]);
  return (
    <div className="react-tray" ref={ref}>
      <AnimatePresence>
        {open && (
          <motion.div className="tray-panel" initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.7, y: 8 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
            {REACTIONS.map((r, i) => (
              <motion.button key={r.key} onClick={() => sendReaction(r.key)} aria-label={r.label} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.025, type: 'spring', stiffness: 600, damping: 20 }} whileTap={{ scale: 1.35 }}>
                <Emoji name={r.key} size={30} />
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button className="tray-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Reactions">
        <Emoji name={open ? 'clap' : 'fire'} size={26} />
      </button>
    </div>
  );
}

// Preload the art so the first reaction doesn't pop in blank
export function usePreloadEmoji(names: string[]) {
  useEffect(() => {
    names.forEach((n) => { const i = new Image(); i.src = `/emoji/${n}.webp`; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
