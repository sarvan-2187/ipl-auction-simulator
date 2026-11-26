import { useEffect, useMemo, useState } from 'react';
import Chat from '../components/Chat';
import HostTransfer from '../components/HostTransfer';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getPlayer, getTeam, money, teamStrength } from '../lib/data';
import { call, leaveRoom, memberId } from '../lib/socket';
import type { RoomState } from '../lib/types';
import { Face, TeamLogo, teamVars, useToast } from '../components/ui';
import SquadDrawer from '../components/SquadDrawer';
import { RoleRules, rulesMet } from '../components/RoleRules';
import XIBuilder from '../components/XIBuilder';
import { Page, PageTabs, usePhone } from '../components/Pager';
import { AnimatePresence } from 'framer-motion';
import TradeCenter, { TradeButton, useTradeAlerts } from '../components/TradeCenter';
import { autoXI, roleIn, xiInfo } from '../lib/xi';
import { ratingAs } from '../lib/data';

export default function Results({ room }: { room: RoomState }) {
  const toast = useToast();
  const [drawer, setDrawer] = useState<string | null>(null);
  const [viewXI, setViewXI] = useState<string | null>(null);
  const [trading, setTrading] = useState(false);
  const phone = usePhone();
  const [page, setPage] = useState<'table' | 'awards' | 'squads' | 'room'>('table');
  const [squadIdx, setSquadIdx] = useState(0);
  const myTeam = Object.values(room.teams).find((t) => t.ownerId === memberId);
  useTradeAlerts(room, myTeam);
  // say so when the computers settled the last lots in one go
  useEffect(() => {
    const ff = room.log.find((l) => /^Fast-forward/.test(l.text) && Date.now() - l.t < 15000);
    if (ff) toast(ff.text.replace('Fast-forward: ', 'Fast-forward · '));
  }, []);
  const trades = trading && myTeam ? <TradeCenter room={room} team={myTeam} onClose={() => setTrading(false)} /> : null;
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
    const lines = [`The Dugout · Room ${room.code} · Final squads`, ''];
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
      <div className={`shell ${phone ? 'paged xi-paged' : ''}`}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="eyebrow">Room {room.code} · Auction complete</div>
            <div className="display" style={{ fontSize: 30 }}>Build your Playing XI</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <TradeButton room={room} team={myTeam} onOpen={() => setTrading(true)} className="btn btn-sm" />
            <button className="btn btn-sm" onClick={() => setMode('results')}>See results →</button>
          </div>
        </div>
        <XIBuilder room={room} team={myTeam} onDone={() => setMode('results')} />
        {trades}
        <Chat room={room} />
      </div>
    );
  }

  if (phone) {
    const r = ranked[Math.min(squadIdx, ranked.length - 1)];
    const owner = r && room.members.find((m) => m.team === r.t.code);
    return (
      <div className="shell paged results-paged">
        <div className="rp-head">
          {winner && <TeamLogo code={winner.t.code} size={44} />}
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="eyebrow">Room {room.code} · {allLocked ? 'Champions' : 'Leading'}</div>
            <div className="display ellipsis" style={{ fontSize: 22 }}>{winner ? getTeam(winner.t.code)?.name : 'Auction complete'}</div>
          </div>
          {winner && <div className="rp-score"><b>{winner.score.toFixed(1)}</b><span>XI</span></div>}
        </div>
        <PageTabs id="results" page={page} setPage={setPage} tabs={[
          { key: 'table', label: 'Table' },
          { key: 'awards', label: 'Awards' },
          { key: 'squads', label: 'Squads' },
          { key: 'room', label: 'Room' },
        ]} />
        <div className="pages">
          <AnimatePresence mode="wait" initial={false}>
            {page === 'table' && (
              <Page k="table">
                {!allLocked && <div className="dim" style={{ fontSize: 12 }}>Provisional until every team locks its XI</div>}
                <div className="rp-table">
                  {ranked.map((x, i) => {
                    const o = room.members.find((m) => m.team === x.t.code);
                    return (
                      <button key={x.t.code} className={`rp-row ${o?.id === memberId ? 'me' : ''}`} style={teamVars(x.t.code)} onClick={() => { setSquadIdx(i); setPage('squads'); }}>
                        <span className="rp-rank">{i + 1}</span>
                        <TeamLogo code={x.t.code} size={28} />
                        <span className="rp-name"><b>{x.t.code}</b><small className="ellipsis">{o?.name}{o?.bot ? ' · CPU' : ''}</small></span>
                        <span className={`rp-lock ${x.locked ? 'on' : ''}`}>{x.locked ? 'Locked' : x.picked ? 'Picking' : '—'}</span>
                        <b className="rp-xi">{x.score.toFixed(1)}</b>
                      </button>
                    );
                  })}
                </div>
              </Page>
            )}
            {page === 'awards' && (
              <Page k="awards" className="rp-awards">
                <Award title="Most expensive" b={priciest} note="record buy" />
                <Award title="Steal of the auction" b={steal} note={`RTG ${steal?.p.rating}`} />
                <Award title="Bidding war" b={overpay} note={overpay ? `${(overpay.price / overpay.p.base).toFixed(1)}× base` : ''} />
              </Page>
            )}
            {page === 'squads' && r && (
              <Page k={`squads-${r.t.code}`} className="rp-squad">
                <div className="rp-pager">
                  <button className="icon-btn" onClick={() => setSquadIdx((squadIdx - 1 + ranked.length) % ranked.length)} aria-label="Previous team">‹</button>
                  <div className="rp-dots">{ranked.map((x, i) => <i key={x.t.code} className={i === squadIdx ? 'on' : ''} onClick={() => setSquadIdx(i)} />)}</div>
                  <button className="icon-btn" onClick={() => setSquadIdx((squadIdx + 1) % ranked.length)} aria-label="Next team">›</button>
                </div>
                <div className="panel rcard rp-card" style={teamVars(r.t.code)}>
                  <div className="rcard-head">
                    <TeamLogo code={r.t.code} size={46} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="display" style={{ fontSize: 24 }}>#{ranked.indexOf(r) + 1} {r.t.code}</div>
                      <div className="muted ellipsis" style={{ fontWeight: 700, fontSize: 13 }}>{owner?.name}{owner?.bot ? ' · computer' : ''} · spent {money(r.spent)}</div>
                    </div>
                    <div className="rp-score"><b>{r.score.toFixed(1)}</b><span>XI</span></div>
                  </div>
                  <div className="rp-xi-list">
                    {r.xi.map((x) => (
                      <div key={x.p.id} className="rp-player">
                        <Face p={x.p} className="mini-face" />
                        <span className="ellipsis pn">{x.p.name}</span>
                        <small>{x.role} {x.r}</small>
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ gap: 8, padding: '0 10px 10px' }}>
                    <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setViewXI(r.t.code)}>On ground</button>
                    <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setDrawer(r.t.code)}>Squad · {r.t.squad.length}</button>
                  </div>
                </div>
              </Page>
            )}
            {page === 'room' && (
              <Page k="room" className="rp-room">
                <div className="panel" style={{ padding: 14, display: 'grid', gap: 10 }}>
                  <button className="btn" onClick={copy}>Copy squads for WhatsApp</button>
                  {isHost ? <button className="btn" onClick={rematch}>Play again · same room</button> : <div className="dim" style={{ fontSize: 13, textAlign: 'center' }}>Host can start another round in this room</div>}
                  <HostTransfer room={room} />
                  <button className="btn btn-ghost" onClick={leaveRoom}>Leave room</button>
                </div>
              </Page>
            )}
          </AnimatePresence>
        </div>
        {myTeam && (
          <div className="page-foot rp-foot">
            <button className="btn btn-gold" onClick={() => setMode('xi')}>{myTeam.xiLocked ? 'My XI' : 'Pick my XI'}</button>
            <TradeButton room={room} team={myTeam} onOpen={() => setTrading(true)} />
          </div>
        )}
        {trades}
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
          <TradeButton room={room} team={myTeam} onOpen={() => setTrading(true)} />
          <button className="btn" onClick={copy}>Copy squads for WhatsApp</button>
          {isHost ? (
            <button className="btn" onClick={rematch}>Play again · same room</button>
          ) : (
            <span className="dim" style={{ alignSelf: 'center', fontSize: 13 }}>Host can start another round in this room</span>
          )}
          <HostTransfer room={room} />
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
      {trades}
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
