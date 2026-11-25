// The hammer moment: gavel slam → match-ticket flies up → rubber stamp lands on it.
import { useEffect, useId, useMemo } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getTeam, money, ROLE_LABEL } from '../lib/data';
import { sfx } from '../lib/sound';
import type { Lot, Player } from '../lib/types';
import { TeamLogo } from './ui';

const T_TICKET = 0.22; // s after hammer
const T_STAMP = 0.95;

export interface CeremonyTags { record: boolean; steal: boolean; war: boolean }

export default function SoldCeremony({ lot, player, mine, roomCode, tags }: { lot: Lot; player: Player; mine: boolean; roomCode: string; tags: CeremonyTags }) {
  const sold = lot.status === 'sold';
  const team = getTeam(lot.leader);
  const c1 = team?.primary || '#3b4270';
  const c2 = team?.secondary || '#f5c04a';
  // red ink normally; navy ink on red/pink/orange franchises so the stamp stays readable
  const ink = !sold ? '#d42a40' : ['RCB', 'PBKS', 'RR', 'SRH'].includes(lot.leader || '') ? '#13296e' : '#c8102e';
  const uid = useId().replace(/:/g, '');
  const serial = useMemo(() => `${roomCode}-${String(lot.n).padStart(3, '0')}-${String(player.id).slice(-4)}`, [roomCode, lot.n, player.id]);

  // price counts up from base to the hammer price
  const price = useMotionValue(lot.base);
  const priceText = useTransform(price, (v) => money(Math.round(v / 5) * 5));
  useEffect(() => {
    if (!sold) return;
    const c = animate(price, lot.bid ?? lot.base, { duration: 0.7, delay: T_TICKET + 0.1, ease: [0.2, 0.8, 0.2, 1] });
    return () => c.stop();
  }, [sold, lot.bid, lot.base, price]);

  // sound + confetti synced to the stamp landing
  useEffect(() => {
    sfx.gavel();
    sfx.whoosh(T_TICKET);
    sfx.stamp(T_STAMP);
    if (sold) {
      sfx.sold();
      sfx.crowd(T_STAMP, mine || tags.record);
    } else { sfx.unsold(); confetti.reset(); }
    const id = setTimeout(() => {
      if (!sold) return;
      const colors = [c1, c2, '#f5c04a', '#ffffff'];
      const n = mine ? 1 : tags.record ? 0.8 : 0.5;
      confetti({ particleCount: Math.round(160 * n), spread: 75, startVelocity: 42, origin: { x: 0.2, y: 0.7 }, angle: 60, colors, disableForReducedMotion: true });
      confetti({ particleCount: Math.round(160 * n), spread: 75, startVelocity: 42, origin: { x: 0.8, y: 0.7 }, angle: 120, colors, disableForReducedMotion: true });
      if (mine) confetti({ particleCount: 120, spread: 160, origin: { y: 0.35 }, colors: ['#f5c04a', '#ffdf8a', '#fff'], shapes: ['star'], scalar: 1.3, disableForReducedMotion: true });
    }, T_STAMP * 1000 + 40);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const splats = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
    const d = 70 + Math.random() * 50;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 4 + Math.random() * 9 };
  }), []);

  const parts = player.name.split(' ');
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const last = parts[parts.length - 1];

  return (
    <motion.div className={`ceremony ${sold ? 'is-sold' : 'is-unsold'}`} style={{ ['--c1' as any]: c1, ['--c2' as any]: c2, ['--ink' as any]: ink }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      {/* rotating light rays in the buyer's colours */}
      {sold && <motion.div className="rays" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, rotate: 40 }} transition={{ opacity: { delay: T_STAMP, duration: 0.3 }, scale: { delay: T_STAMP, duration: 0.5 }, rotate: { duration: 5, ease: 'linear' } }} />}

      {/* gavel slam + shockwave */}
      <motion.svg className="c-gavel" viewBox="0 0 120 120" initial={{ rotate: -75, opacity: 0, x: 30, y: -30 }} animate={{ rotate: [-75, 12, 0], opacity: [0, 1, 1, 0], x: 0, y: 0 }} transition={{ duration: 0.7, times: [0, 0.35, 0.55, 1], ease: 'easeIn' }} aria-hidden="true">
        <g transform="rotate(-35 60 60)">
          <rect x="22" y="22" width="62" height="28" rx="6" fill="url(#gv)" stroke="#5a3a10" strokeWidth="2" />
          <rect x="18" y="26" width="8" height="20" rx="2" fill="#c99a3a" />
          <rect x="80" y="26" width="8" height="20" rx="2" fill="#c99a3a" />
          <rect x="49" y="50" width="9" height="56" rx="4" fill="#8a5a22" />
        </g>
        <defs>
          <linearGradient id="gv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e9b866" /><stop offset="1" stopColor="#8a5a22" /></linearGradient>
        </defs>
      </motion.svg>
      <motion.div className="shock" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ delay: 0.22, duration: 0.6, ease: 'easeOut' }} />

      {/* the ticket */}
      <motion.div
        className="ticket-wrap"
        initial={{ y: 140, rotateX: 55, opacity: 0, scale: 0.85 }}
        animate={{ y: 0, rotateX: 0, opacity: 1, scale: 1, rotate: sold ? -2 : 1.5, x: [0, 0, -7, 6, -3, 0] }}
        transition={{ delay: T_TICKET, type: 'spring', stiffness: 170, damping: 17, x: { delay: T_STAMP, duration: 0.32, times: [0, 0.01, 0.3, 0.55, 0.8, 1] } }}
      >
        <div className="ticket">
          <div className="t-main">
            <div className="t-guilloche" aria-hidden="true" />
            <div className="t-top">
              <span>Official Auction Ticket</span>
              <span>Lot {lot.n}</span>
            </div>
            <div className="t-name">
              {first && <span className="t-first">{first}</span>}
              <span className="t-last">{last}</span>
            </div>
            <div className="t-meta">{ROLE_LABEL[player.role]} · {player.overseas ? 'Overseas' : 'India'} · {player.capped ? 'Capped' : 'Uncapped'}</div>
            <div className="t-foot">
              <div>
                <small>{sold ? 'Hammer price' : 'Base price'}</small>
                <motion.b>{sold ? priceText : money(lot.base)}</motion.b>
              </div>
              <div>
                <small>Bids</small>
                <b>{lot.bidCount ?? lot.history.length}</b>
              </div>
              <div className="t-barcode" aria-hidden="true" />
            </div>
          </div>
          <div className="t-perf" aria-hidden="true" />
          <div className="t-stub">
            <small>{sold ? 'Admit to' : 'No bids'}</small>
            {sold && lot.leader ? <TeamLogo code={lot.leader} size={64} /> : <div className="t-empty">—</div>}
            <b>{sold ? lot.leader : 'UNSOLD'}</b>
            <span className="t-serial">№ {serial}</span>
          </div>
        </div>

        {/* rubber stamp */}
        <motion.div
          className={`rstamp ${sold ? '' : 'rect'}`}
          initial={{ scale: 3.4, opacity: 0, rotate: sold ? -42 : 20 }}
          animate={{ scale: 1, opacity: 0.94, rotate: sold ? -14 : -8 }}
          transition={{ delay: T_STAMP - 0.12, type: 'spring', stiffness: 700, damping: 24, mass: 0.9 }}
        >
          {sold ? (
            <svg viewBox="0 0 220 220" aria-label={`Sold to ${lot.leader} for ${money(lot.bid)}`}>
              <defs>
                <filter id={`ink-${uid}`}>
                  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
                  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.25" result="m" />
                  <feComposite in="SourceGraphic" in2="m" operator="in" />
                </filter>
                <path id={`ring-${uid}`} d="M110,110 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0" />
              </defs>
              <g filter={`url(#ink-${uid})`} fill="currentColor" stroke="currentColor">
                <circle cx="110" cy="110" r="102" fill="none" strokeWidth="7" />
                <circle cx="110" cy="110" r="94" fill="none" strokeWidth="2" />
                <circle cx="110" cy="110" r="64" fill="none" strokeWidth="2.5" />
                <text fontFamily="Bebas Neue, sans-serif" fontSize="19" letterSpacing="3.2" stroke="none">
                  <textPath href={`#ring-${uid}`} startOffset="0">★ {team?.name.toUpperCase()} ★ AUCTION ROOM {roomCode} ★</textPath>
                </text>
                <rect x="14" y="86" width="192" height="50" rx="6" stroke="none" />
                <text x="110" y="128" textAnchor="middle" fontFamily="Bebas Neue, sans-serif" fontSize="50" letterSpacing="6" fill="var(--stamp-knock)" stroke="none">SOLD</text>
                <text x="110" y="78" textAnchor="middle" fontFamily="Bebas Neue, sans-serif" fontSize="26" stroke="none">{lot.leader}</text>
                <text x="110" y="162" textAnchor="middle" fontFamily="Bebas Neue, sans-serif" fontSize="22" stroke="none">{money(lot.bid)}</text>
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 260 110" aria-label="Unsold">
              <defs>
                <filter id={`ink-${uid}`}>
                  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
                  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.25" result="m" />
                  <feComposite in="SourceGraphic" in2="m" operator="in" />
                </filter>
              </defs>
              <g filter={`url(#ink-${uid})`} fill="currentColor" stroke="currentColor">
                <rect x="6" y="6" width="248" height="98" rx="10" fill="none" strokeWidth="7" />
                <rect x="16" y="16" width="228" height="78" rx="6" fill="none" strokeWidth="2" />
                <text x="130" y="76" textAnchor="middle" fontFamily="Bebas Neue, sans-serif" fontSize="62" letterSpacing="8" stroke="none">UNSOLD</text>
              </g>
            </svg>
          )}
          {/* ink splatter on impact */}
          {splats.map((s, i) => (
            <motion.i key={i} className="splat" style={{ width: s.s, height: s.s }} initial={{ x: 0, y: 0, opacity: 0, scale: 0 }} animate={{ x: s.x, y: s.y, opacity: [0, 0.9, 0.75], scale: 1 }} transition={{ delay: T_STAMP, duration: 0.28, ease: 'easeOut' }} />
          ))}
        </motion.div>
      </motion.div>

      {/* badges */}
      {sold && (tags.record || tags.steal || tags.war) && (
        <div className="c-badges">
          {[tags.record && ['🏆', 'Record buy'], tags.steal && ['💎', 'Steal!'], tags.war && ['⚔️', 'Bidding war']].filter(Boolean).map((b, i) => (
            <motion.span key={i} className="c-badge" initial={{ y: 20, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: T_STAMP + 0.35 + i * 0.12, type: 'spring', stiffness: 400, damping: 18 }}>
              {(b as string[])[0]} {(b as string[])[1]}
            </motion.span>
          ))}
        </div>
      )}

      {/* you bought him */}
      {sold && mine && (
        <motion.div className="c-mine" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ delay: T_STAMP + 0.45, duration: 0.35, ease: [0.2, 0.9, 0.2, 1] }}>
          Welcome to {lot.leader}, {last}!
        </motion.div>
      )}
    </motion.div>
  );
}
