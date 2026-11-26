// Text reactions (no emoji): spectators send them, everyone sees them float over the stage.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useSocketEvent } from '../lib/socket';
import { useToast } from './ui';
import { sfx } from '../lib/sound';

// Self-hosted 3D emoji (Microsoft Fluent Emoji, MIT) so they look the same on every device
export const REACTIONS: { key: string; label: string }[] = [
  { key: 'fire', label: 'Fire' },
  { key: 'clap', label: 'Clap' },
  { key: 'scream', label: 'Shocked' },
  { key: 'joy', label: 'LOL' },
  { key: 'money', label: 'Money gone' },
  { key: 'mindblown', label: 'Mind blown' },
  { key: 'skull', label: 'Dead' },
  { key: 'pray', label: 'Please no' },
];
const Emo = ({ k, size }: { k: string; size: number }) => <img src={`/emoji/${k}.webp`} width={size} height={size} alt="" className="emoji" draggable={false} />;
const COOLDOWN = 1600;

export function ReactionBar() {
  const toast = useToast();
  const [cool, setCool] = useState(0);
  const timer = useRef<number>();
  const send = async (key: string) => {
    if (Date.now() < cool) return;
    const until = Date.now() + COOLDOWN; setCool(until);
    window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCool(0), COOLDOWN);
    const r = await call('react', { key });
    if (!r.ok) toast(r.error || 'Reaction not sent', true);
  };
  const cooling = cool > Date.now();
  return (
    <div className="rx-bar" role="group" aria-label="Send a reaction">
      <span className="rx-label">Spectating · react</span>
      <div className="rx-buttons">
        {REACTIONS.map((r) => (
          <button key={r.key} onClick={() => send(r.key)} disabled={cooling} aria-label={r.label} title={r.label}>
            <Emo k={r.key} size={30} />
          </button>
        ))}
      </div>
      {cooling && <motion.i className="rx-cool" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: COOLDOWN / 1000, ease: 'linear' }} />}
    </div>
  );
}

export function ReactionLayer() {
  useEffect(() => { REACTIONS.forEach((r) => { const i = new Image(); i.src = `/emoji/${r.key}.webp`; }); }, []);
  const [items, setItems] = useState<{ id: string; key: string; name: string; x: number; y: number }[]>([]);
  const lane = useRef(0);
  useSocketEvent<{ id: string; key: string; name: string }>('reaction', useCallback((r) => {
    sfx.bid();
    // spread reactions across 6 lanes and 3 heights so a burst stays readable
    const i = lane.current++ % 6;
    const x = 6 + i * 14 + Math.random() * 4;
    const y = 16 + ((i * 7) % 3) * 9 + Math.random() * 4;
    setItems((l) => [...l.slice(-10), { ...r, x, y }]);
    window.setTimeout(() => setItems((l) => l.filter((x) => x.id !== r.id)), 2800);
  }, []));
  useEffect(() => () => setItems([]), []);
  return (
    <div className="rx-layer" aria-live="polite">
      <AnimatePresence>
        {items.map((it) => {
          const r = REACTIONS.find((x) => x.key === it.key);
          if (!r) return null;
          return (
            <motion.div key={it.id} className="rx-float" style={{ left: `${it.x}%`, bottom: `${it.y}%` }}
              initial={{ opacity: 0, y: 30, scale: 0.7 }} animate={{ opacity: [0, 1, 1, 0], y: -260, scale: 1 }} transition={{ duration: 2.6, ease: 'easeOut', times: [0, 0.12, 0.75, 1] }}>
              <Emo k={r.key} size={54} /><span>{it.name}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
