// Text reactions (no emoji): spectators send them, everyone sees them float over the stage.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, useSocketEvent } from '../lib/socket';
import { useToast } from './ui';
import { sfx } from '../lib/sound';

export const REACTIONS: { key: string; label: string; tone: string }[] = [
  { key: 'wow', label: 'Wow', tone: '#f5c04a' },
  { key: 'steal', label: 'Steal!', tone: '#35d07f' },
  { key: 'overpaid', label: 'Overpaid', tone: '#ff5468' },
  { key: 'bid', label: 'Bid!', tone: '#5b8cff' },
  { key: 'unlucky', label: 'Unlucky', tone: '#a3a3a3' },
  { key: 'bravo', label: 'Bravo', tone: '#c084fc' },
];
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
          <button key={r.key} onClick={() => send(r.key)} disabled={cooling} style={{ ['--rx' as any]: r.tone }}>
            {r.label}
          </button>
        ))}
      </div>
      {cooling && <motion.i className="rx-cool" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: COOLDOWN / 1000, ease: 'linear' }} />}
    </div>
  );
}

export function ReactionLayer() {
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
            <motion.div key={it.id} className="rx-float" style={{ left: `${it.x}%`, bottom: `${it.y}%`, ['--rx' as any]: r.tone }}
              initial={{ opacity: 0, y: 30, scale: 0.7 }} animate={{ opacity: [0, 1, 1, 0], y: -260, scale: 1 }} transition={{ duration: 2.6, ease: 'easeOut', times: [0, 0.12, 0.75, 1] }}>
              <b>{r.label}</b><span>{it.name}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
