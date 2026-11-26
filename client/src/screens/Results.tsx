import { useEffect, useMemo, useState } from 'react';
import Chat from '../components/Chat';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getPlayer, getTeam, money, teamStrength } from '../lib/data';
import { call, leaveRoom, memberId } from '../lib/socket';
import type { RoomState } from '../lib/types';
import { Face, TeamLogo, teamVars, useToast } from '../components/ui';
import SquadDrawer from '../components/SquadDrawer';
import { RoleRules, rulesMet } from '../components/RoleRules';
import XIBuilder from '../components/XIBuilder';
import { autoXI, roleIn, xiInfo } from '../lib/xi';
import { ratingAs } from '../lib/data';

export default function Results({ room }: { room: RoomState }) {
  const toast = useToast();
  const [drawer, setDrawer] = useState<string | null>(null);
  const [viewXI, setViewXI] = useState<string | null>(null);
  const myTeam = Object.values(room.teams).find((t) => t.ownerId === memberId);
  // straight to the XI builder after the auction until you've locked your XI
  const [mode, setMode] = useState<'xi' | 'results'>(() => (myTeam && !myTeam.xiLocked && myTeam.squad.length ? 'xi' : 'results'));
  // Standings use each team's Playing XI (locked or in progress); teams with nothing picked show their best possible XI
  const ranked = useMemo(() => Object.values(room.teams)
    .map((t) => {
      const ids = t.xi && t.xi.length ? t.xi : autoXI(t.squad);
      const info = xiInfo(ids, t.squad);
      const xi = ids.map((id) => { const p = getPlayer(id); const role = roleIn(t.squad, id); return { p, role, r: ratingAs(p, role) }; });
      return { t, xi, score: info.rating, locked: !!t.xiLocked, picked: !!(t.xi && t.xi.length), spent: room.settings.purse - t.purse, strength: teamStrength(t.squad).score };
    })
    .sort((a, b) => b.score - a.score || a.spent - b.spent), [room]);
  const allLocked = ranked.every((r) => r.locked);

  const allBuys = Object.values(room.teams).flatMap((t) => t.squad.map((s) => ({ ...s, team: t.code, p: getPlayer(s.id) })));
  const priciest = allBuys.slice().sort((a, b) => b.price - a.price)[0];
  const steal = allBuys.filter((b) => b.p.rating >= 70).sort((a, b) => a.price / a.p.rating - b.price / b.p.rating)[0];
  const overpay = allBuys.slice().sort((a, b) => b.price / b.p.base - a.price / a.p.base)[0];
  const winner = ranked[0];

  useEffect(() => {
    if (mode !== 'results') return;
    const t = getTeam(winner?.t.code);
    confetti({ particleCount: 200, spread: 120, origin: { y: 0.3 }, colors: [t?.primary || '#f5c04a', t?.secondary || '#fff', '#f5c04a'], disableForReducedMotion: true });
  }, [mode]);

  function summary() {
    const lines = [`IPL Auction Room ${room.code} — Final squads`, ''];
    ranked.forEach((r, i) => {
      const owner = room.members.find((m) => m.team === r.t.code)?.name;
      lines.push(`${i + 1}. ${r.t.code} (${owner}) · strength ${r.score} · spent ${money(r.spent)}`);
      lines.push('   ' + r.t.squad.slice().sort((a, b) => b.price - a.price).map((s) => `${getPlayer(s.id).name} ${money(s.price, { short: true })}`).join(', '));
    });
    return lines.join('\n');
  }

  const isHost = room.hostId === memberId;
  async function rematch() {
    const r = await call('rematch');
    if (!r.ok) toast(r.error || 'Could not restart', true);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(summary()); toast('Squads copied, paste in your group chat'); } catch { toast('Copy failed', true); }
  }

  const Award = ({ title, b, note }: { title: string; b?: typeof priciest; note: string }) => b ? (
    <div className="panel award" style={teamVars(b.team)}>
      <Face p={b.p} />
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow gold">{title}</div>
        <div className="display ellipsis pn" style={{ fontSize: 30 }}>{b.p.name}</div>
        <div className="muted" style={{ fontSize: 13 }}><b>{b.team}</b> · {money(b.price)} · {note}</div>
      </div>
    </div>
  ) : null;

  if (mode === 'xi' && myTeam) {
    return (
      <div className="shell">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="eyebrow">Room {room.code} · Auction complete</div>
            <div className="display" style={{ fontSize: 30 }}>Build your Playing XI</div>
          </div>
          <button className="btn btn-sm" onClick={() => setMode('results')}>See results →</button>
        </div>
        <XIBuilder room={room} team={myTeam} onDone={() => setMode('results')} />
        <Chat room={room} />
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="results-hero">
        <div className="eyebrow">Room {room.code} · Auction complete</div>
        {winner && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} className="col" style={{ alignItems: 'center', marginTop: 14 }}>
            <TeamLogo code={winner.t.code} size={110} />
            <div className="display" style={{ fontSize: 'clamp(44px, 7vw, 80px)' }}>{getTeam(winner.t.code)?.name}</div>
            <div className="muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18 }}>
              {allLocked ? 'Champions' : 'Leading'} · Playing XI rating <span className="gold">{winner.score.toFixed(1)}</span>
              {!allLocked && <div className="dim" style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>Provisional: not every team has locked its XI yet</div>}
            </div>
          </motion.div>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          {myTeam && <button className="btn btn-gold" onClick={() => setMode('xi')}>{myTeam.xiLocked ? 'My Playing XI' : 'Pick my Playing XI'}</button>}
          <button className="btn" onClick={copy}>Copy squads for WhatsApp</button>
          {isHost ? (
            <button className="btn" onClick={rematch}>Play again · same room</button>
          ) : (
            <span className="dim" style={{ alignSelf: 'center', fontSize: 13 }}>Host can start another round in this room</span>
          )}
          <button className="btn btn-ghost" onClick={leaveRoom}>Leave room</button>
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
              <div style={{ padding: '12px 16px 0' }}>
                <RoleRules room={room} team={r.t} compact />
                {!rulesMet(room, r.t) && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Squad rules not met</div>}
              </div>
              <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="fact"><span>XI rating</span><b className="gold">{r.score.toFixed(1)}</b></div>
                <div className="fact"><span>Spent</span><b>{money(r.spent)}</b></div>
                <div className="fact"><span>Squad</span><b>{r.t.squad.length}</b></div>
              </div>
              <div style={{ padding: '8px 16px 16px' }}>
                <div className="row" style={{ justifyContent: 'space-between', margin: '6px 0' }}>
                  <div className="eyebrow">Playing XI</div>
                  <span className={`chip ${r.locked ? 'chip-green' : ''}`} style={{ height: 22, fontSize: 11 }}>{r.locked ? 'Locked' : r.picked ? 'Picking…' : 'Not picked'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                  {r.xi.map((x) => (
                    <div key={x.p.id} className="row" style={{ gap: 8 }}>
                      <Face p={x.p} className="mini-face" />
                      <span className="ellipsis pn" style={{ fontSize: 16 }}>{x.p.name}</span>
                      <span className="dim" style={{ fontSize: 11, fontWeight: 600, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{x.role} {x.r}</span>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setViewXI(r.t.code)}>View XI on ground</button>
                  <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setDrawer(r.t.code)}>Full squad</button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      {drawer && <SquadDrawer room={room} code={drawer} onClose={() => setDrawer(null)} />}
      {viewXI && room.teams[viewXI] && (
        <>
          <motion.div className="drawer-back" onClick={() => setViewXI(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
          <motion.div className="xi-modal" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} role="dialog" aria-label="Playing XI">
            <button className="icon-btn xi-close" onClick={() => setViewXI(null)} aria-label="Close">✕</button>
            <XIBuilder room={room} team={{ ...room.teams[viewXI], xi: ranked.find((x) => x.t.code === viewXI)!.xi.map((x) => x.p.id) }} readOnly />
          </motion.div>
        </>
      )}
      <Chat room={room} />
    </div>
  );
}
