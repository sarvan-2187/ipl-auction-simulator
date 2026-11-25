import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getPlayer, getTeam, money, teamStrength } from '../lib/data';
import { leaveRoom, memberId } from '../lib/socket';
import type { RoomState } from '../lib/types';
import { Face, TeamLogo, teamVars, useToast } from '../components/ui';
import SquadDrawer from '../components/SquadDrawer';

export default function Results({ room }: { room: RoomState }) {
  const toast = useToast();
  const [drawer, setDrawer] = useState<string | null>(null);
  const ranked = useMemo(() => Object.values(room.teams)
    .map((t) => ({ t, ...teamStrength(t.squad.map((s) => s.id)), spent: room.settings.purse - t.purse }))
    .sort((a, b) => b.score - a.score || a.spent - b.spent), [room]);

  const allBuys = Object.values(room.teams).flatMap((t) => t.squad.map((s) => ({ ...s, team: t.code, p: getPlayer(s.id) })));
  const priciest = allBuys.slice().sort((a, b) => b.price - a.price)[0];
  const steal = allBuys.filter((b) => b.p.rating >= 70).sort((a, b) => a.price / a.p.rating - b.price / b.p.rating)[0];
  const overpay = allBuys.slice().sort((a, b) => b.price / b.p.base - a.price / a.p.base)[0];
  const winner = ranked[0];

  useEffect(() => {
    const t = getTeam(winner?.t.code);
    confetti({ particleCount: 200, spread: 120, origin: { y: 0.3 }, colors: [t?.primary || '#f5c04a', t?.secondary || '#fff', '#f5c04a'], disableForReducedMotion: true });
  }, []);

  function summary() {
    const lines = [`🏏 IPL Auction Room ${room.code} — Final squads`, ''];
    ranked.forEach((r, i) => {
      const owner = room.members.find((m) => m.team === r.t.code)?.name;
      lines.push(`${i + 1}. ${r.t.code} (${owner}) · strength ${r.score} · spent ${money(r.spent)}`);
      lines.push('   ' + r.t.squad.slice().sort((a, b) => b.price - a.price).map((s) => `${getPlayer(s.id).name} ${money(s.price, { short: true })}`).join(', '));
    });
    return lines.join('\n');
  }

  async function copy() {
    try { await navigator.clipboard.writeText(summary()); toast('Squads copied, paste in your group chat'); } catch { toast('Copy failed', true); }
  }

  const Award = ({ title, b, note }: { title: string; b?: typeof priciest; note: string }) => b ? (
    <div className="panel award" style={teamVars(b.team)}>
      <Face p={b.p} />
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow gold">{title}</div>
        <div className="display ellipsis" style={{ fontSize: 26 }}>{b.p.name}</div>
        <div className="muted" style={{ fontSize: 13 }}><b>{b.team}</b> · {money(b.price)} · {note}</div>
      </div>
    </div>
  ) : null;

  return (
    <div className="shell">
      <div className="results-hero">
        <div className="eyebrow">Room {room.code} · Auction complete</div>
        {winner && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} className="col" style={{ alignItems: 'center', marginTop: 14 }}>
            <TeamLogo code={winner.t.code} size={110} />
            <div className="display" style={{ fontSize: 'clamp(44px, 7vw, 80px)' }}>{getTeam(winner.t.code)?.name}</div>
            <div className="muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18 }}>
              Strongest squad on paper · Best-XI rating <span className="gold">{winner.score}</span>
            </div>
          </motion.div>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn btn-gold" onClick={copy}>Copy squads for WhatsApp</button>
          <button className="btn" onClick={() => { leaveRoom(); history.replaceState(null, '', '/'); }}>New auction</button>
        </div>
      </div>

      <div className="awards">
        <Award title="Most expensive" b={priciest} note="record buy" />
        <Award title="Steal of the auction" b={steal} note={`RTG ${steal?.p.rating}`} />
        <Award title="Bidding war" b={overpay} note={overpay ? `${(overpay.price / overpay.p.base).toFixed(1)}× base` : ''} />
      </div>

      <div className="results-grid">
        {ranked.map((r, i) => {
          const owner = room.members.find((m) => m.team === r.t.code);
          return (
            <motion.div key={r.t.code} className="panel rcard" style={teamVars(r.t.code)} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
              <div className="rcard-head">
                <TeamLogo code={r.t.code} size={62} />
                <div className="grow">
                  <div className="display" style={{ fontSize: 30 }}>{r.t.code}{owner?.id === memberId ? ' · You' : ''}</div>
                  <div className="muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700 }}>{owner?.name}{owner?.bot ? ' · computer' : ''}</div>
                </div>
                <div className="rank">#{i + 1}</div>
              </div>
              <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="fact"><span>Strength</span><b className="gold">{r.score}</b></div>
                <div className="fact"><span>Spent</span><b>{money(r.spent)}</b></div>
                <div className="fact"><span>Squad</span><b>{r.t.squad.length}</b></div>
              </div>
              <div style={{ padding: '8px 16px 16px' }}>
                <div className="eyebrow" style={{ margin: '6px 0' }}>Best XI</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                  {r.xi.map((p) => (
                    <div key={p.id} className="row" style={{ gap: 8 }}>
                      <Face p={p} className="mini-face" />
                      <span className="ellipsis" style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={() => setDrawer(r.t.code)}>Full squad</button>
              </div>
            </motion.div>
          );
        })}
      </div>
      {drawer && <SquadDrawer room={room} code={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
