import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SoldCeremony, { type CeremonyTags } from '../components/SoldCeremony';
import { flagEmoji, getPlayer, getTeam, money, playerPhoto, ROLE_LABEL, teamPattern } from '../lib/data';
import { call, memberId, useSocketEvent } from '../lib/socket';
import type { Lot, Player, RoomState, TeamState } from '../lib/types';
import { Face, GavelIcon, Silhouette, TeamLogo, initials, teamVars, useToast } from '../components/ui';
import SquadDrawer from '../components/SquadDrawer';
import { isMuted, setMuted, sfx } from '../lib/sound';

const REACTIONS = ['🔥', '😂', '😱', '👏', '💸', '🤡', '😤', '🙏'];

function useCountdown(room: RoomState) {
  const lot = room.lot;
  const [ms, setMs] = useState(lot?.remaining ?? 0);
  useEffect(() => {
    if (!lot || lot.status !== 'live') { setMs(0); return; }
    if (room.paused) { setMs(lot.remaining); return; }
    let raf = 0;
    const loop = () => {
      setMs(Math.max(0, lot.remaining - (performance.now() - room.receivedAt)));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [lot, room.receivedAt, room.paused]);
  return ms;
}

function blocker(room: RoomState, team: TeamState | undefined, amount: number | null): string | null {
  const lot = room.lot;
  if (!team) return 'Spectating';
  if (!lot || lot.status !== 'live' || amount == null) return 'Waiting';
  if (room.paused) return 'Paused';
  if (lot.leader === team.code) return 'You lead';
  const p = getPlayer(lot.id);
  const s = room.settings;
  if (team.squad.length >= s.maxSquad) return 'Squad full';
  const os = team.squad.filter((x) => getPlayer(x.id).overseas).length;
  if (p.overseas && os >= s.maxOverseas) return 'Overseas cap';
  const slotsAfter = Math.max(0, s.minSquad - team.squad.length - 1);
  if (team.purse - amount < slotsAfter * 30) return 'Low purse';
  return null;
}

export default function Auction({ room }: { room: RoomState }) {
  const toast = useToast();
  const me = room.members.find((m) => m.id === memberId);
  const myTeam = me?.team ? room.teams[me.team] : undefined;
  const isHost = room.hostId === memberId;
  const lot = room.lot;
  const player = lot ? getPlayer(lot.id) : null;
  const ms = useCountdown(room);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [tab, setTab] = useState<'feed' | 'next' | 'squad'>('feed');
  const [muted, setMutedState] = useState(isMuted());
  const [floaters, setFloaters] = useState<{ id: string; emoji: string; from?: string; x: number }[]>([]);
  const busy = useRef(false);

  const next = lot?.next ?? null;
  const block = blocker(room, myTeam, next);
  const iPassed = !!(myTeam && lot?.passed.includes(myTeam.code));

  // ---- sounds & effects on state transitions
  const prev = useRef<{ id?: number; bids?: number; status?: string }>({});
  useEffect(() => {
    const p = prev.current;
    if (lot) {
      if (lot.id !== p.id && lot.status === 'live') sfx.newLot();
      else if (lot.history.length > (p.bids ?? 0) && lot.id === p.id) {
        const last = lot.history[lot.history.length - 1];
        if (last?.team === myTeam?.code) sfx.myBid(); else sfx.bid();
      }
    }
    prev.current = { id: lot?.id, bids: lot?.history.length ?? 0, status: lot?.status };
  }, [lot, myTeam?.code]);

  const secs = Math.ceil(ms / 1000);
  const lastTick = useRef(0);
  useEffect(() => {
    if (!lot || lot.status !== 'live' || room.paused) return;
    if (secs <= 3 && secs > 0 && secs !== lastTick.current) { lastTick.current = secs; sfx.urgent(); }
    if (secs > 3) lastTick.current = 0;
  }, [secs, lot, room.paused]);

  // ---- actions
  const bid = useCallback(async (extra = 0) => {
    if (busy.current || block || next == null || !lot) return;
    busy.current = true;
    sfx.unlock();
    const r = await call('bid', { amount: next + extra, seen: lot.bid });
    busy.current = false;
    if (!r.ok) { toast(r.error || 'Bid failed', true); sfx.error(); }
  }, [block, next, lot, toast]);

  const pass = useCallback(async () => {
    if (!myTeam || !lot || lot.status !== 'live' || lot.leader === myTeam.code) return;
    await call('pass');
  }, [myTeam, lot]);

  const host = async (action: string) => {
    if (action === 'end' && !confirm('End the auction now? Remaining players stay unsold.')) return;
    const r = await call('host', { action });
    if (!r.ok) toast(r.error || 'Failed', true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); bid(); }
      else if (e.key === 'p' || e.key === 'P') pass();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bid, pass]);

  useSocketEvent<{ emoji: string; from?: string; id: string }>('react', useCallback((r) => {
    sfx.pop();
    const f = { ...r, x: 8 + Math.random() * 84 };
    setFloaters((l) => [...l.slice(-14), f]);
    setTimeout(() => setFloaters((l) => l.filter((x) => x.id !== r.id)), 2600);
  }, []));

  const teams = useMemo(() => Object.values(room.teams), [room.teams]);
  const ownerName = (code: string) => room.members.find((m) => m.team === code)?.name || code;
  const total = room.progress.total;

  // The card is neutral until someone bids, then it takes the leading franchise's colours
  const stageVars = player ? { ['--pc1' as any]: getTeam(lot?.leader)?.primary || '#24306a' } : {};
  const leaderTeam = getTeam(lot?.leader);

  return (
    <div className="auction" style={leaderTeam ? ({ ['--team' as any]: myTeam ? getTeam(myTeam.code)!.primary : leaderTeam.primary } as any) : undefined}>
      {/* ---------- top bar ---------- */}
      <div className="a-top">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark"><div className="gavel" style={{ width: 40, height: 40 }}><GavelIcon size={22} /></div></div>
          <div>
            <div className="eyebrow" style={{ fontSize: 11 }}>Room {room.code}<span className="only-mobile"> · Lot {lot?.n ?? 0}/{total}</span>{room.round === 2 ? ' · Accelerated' : ''}</div>
            <div className="display" style={{ fontSize: 24 }}>{lot?.set || 'Auction starting'}</div>
          </div>
        </div>
        <div className="grow" />
        <div className="react-bar only-desktop" aria-label="Reactions">
          {REACTIONS.map((e) => <button key={e} onClick={() => call('react', { emoji: e })} aria-label={`React ${e}`}>{e}</button>)}
        </div>
        <span className="chip">Lot {lot?.n ?? 0}/{total}</span>
        {myTeam && (
          <button className="chip chip-gold" onClick={() => setDrawer(myTeam.code)} style={{ height: 34, cursor: 'pointer' }}>
            <TeamLogo code={myTeam.code} size={20} /> {money(myTeam.purse)} · {myTeam.squad.length} players
          </button>
        )}
        <button className="icon-btn" onClick={() => { setMuted(!muted); setMutedState(!muted); }} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
        {isHost && (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={() => host(room.paused ? 'resume' : 'pause')}>{room.paused ? 'Resume' : 'Pause'}</button>
            <button className="btn btn-sm only-desktop" onClick={() => host('hammer')} disabled={lot?.status !== 'live'} title="Close this lot now">Hammer</button>
            <button className="btn btn-sm btn-danger" onClick={() => host('end')}>End</button>
          </div>
        )}
      </div>

      <div className="a-grid">
        {/* ---------- left: teams ---------- */}
        <aside className="panel side left">
          <div className="side-head"><div className="eyebrow">Franchises</div><div className="eyebrow dim">Purse</div></div>
          <div className="side-body">
            {teams.map((t) => (
              <TeamRow key={t.code} t={t} room={room} owner={ownerName(t.code)} onOpen={() => setDrawer(t.code)} />
            ))}
          </div>
        </aside>

        {/* ---------- center: stage ---------- */}
        <main className="center">
          <div className="team-strip">
            {teams.map((t) => <TeamRow key={t.code} t={t} room={room} owner={ownerName(t.code)} onOpen={() => setDrawer(t.code)} />)}
          </div>

          {!lot || !player ? (
            <div className="panel waiting" style={{ flex: 1 }}>
              <motion.div animate={{ rotate: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}><GavelIcon size={64} /></motion.div>
              <div className="display" style={{ fontSize: 44 }}>The auctioneer takes the stage</div>
              <div className="muted">First lot in a moment…</div>
            </div>
          ) : (
            <div className={`stage ${lot.status !== 'live' ? 'hammered' : ''}`} style={stageVars}>
              <AnimatePresence mode="popLayout">
                <motion.div key={lot.id} className="pcard" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }}>
                  <PlayerArt p={player} leader={lot.leader} />
                </motion.div>
              </AnimatePresence>
              <div className="panel pinfo">
                <PlayerFacts p={player} lot={lot} />
                <RaceStrip room={room} />
                <BidBox lot={lot} ms={ms} paused={room.paused} owner={lot.leader ? ownerName(lot.leader) : ''} bidTime={room.settings.bidTime} />
              </div>
              <AnimatePresence>
                {lot.status !== 'live' && (
                  <SoldCeremony key={`c-${lot.id}`} lot={lot} player={player} mine={!!myTeam && lot.leader === myTeam.code} roomCode={room.code} tags={ceremonyTags(room, lot, player)} />
                )}
              </AnimatePresence>
            </div>
          )}

          {/* controls */}
          {myTeam ? (
            <div className="panel controls">
              <button className="btn pass-btn" onClick={pass} disabled={!lot || lot.status !== 'live' || lot.leader === myTeam.code || iPassed} title="Not interested (P)">
                {iPassed ? 'Passed' : 'Pass'}
              </button>
              <button className="bid-btn" onClick={() => bid()} disabled={!!block} aria-label={block ? `Bid unavailable: ${block}` : `Bid ${money(next)}`}>
                {block === 'Waiting' ? 'Next player…' : block ? block : `Bid ${money(next)}`}
                <small>{block ? (lot?.leader === myTeam.code && lot.status === 'live' ? 'Highest bidder · hold your nerve' : ' ') : 'Space / Enter'}</small>
              </button>
              <div className="jump">
                <JumpBtn label="+50L" extra={50} next={next} room={room} team={myTeam} onBid={bid} disabled={!!block} />
                <JumpBtn label="+1 Cr" extra={100} next={next} room={room} team={myTeam} onBid={bid} disabled={!!block} />
              </div>
            </div>
          ) : (
            <div className="panel controls" style={{ gridTemplateColumns: '1fr', textAlign: 'center' }}>
              <div className="muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, padding: 10 }}>You're spectating this auction</div>
            </div>
          )}
          <div className="react-bar only-mobile" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            {REACTIONS.map((e) => <button key={e} onClick={() => call('react', { emoji: e })} aria-label={`React ${e}`}>{e}</button>)}
          </div>
          <div className="panel only-mobile" style={{ minHeight: 280 }}>
            <SidePanel room={room} tab={tab} setTab={setTab} myTeam={myTeam} />
          </div>
        </main>

        {/* ---------- right: feed ---------- */}
        <aside className="panel side right">
          <SidePanel room={room} tab={tab} setTab={setTab} myTeam={myTeam} />
        </aside>
      </div>

      <div className="floaters" aria-hidden="true">
        <AnimatePresence>
          {floaters.map((f) => (
            <motion.div key={f.id} className="floater" style={{ left: `${f.x}%` }} initial={{ y: 0, opacity: 0, scale: 0.5 }} animate={{ y: -420, opacity: [0, 1, 1, 0], scale: 1 }} transition={{ duration: 2.5, ease: 'easeOut' }}>
              <span className="e">{f.emoji}</span>
              {f.from && <span className="n">{f.from}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {drawer && room.teams[drawer] && <SquadDrawer room={room} code={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function ceremonyTags(room: RoomState, lot: Lot, p: Player): CeremonyTags {
  if (lot.status !== 'sold' || lot.bid == null) return { record: false, steal: false, war: false };
  const before = room.log.filter((l) => l.kind === 'sold' && l.id !== lot.id).map((l) => l.amount || 0);
  return {
    record: before.length >= 2 && lot.bid > Math.max(...before),
    steal: p.rating >= 80 && lot.bid <= lot.base * 1.5,
    war: (lot.bidCount ?? lot.history.length) >= 14,
  };
}

function JumpBtn({ label, extra, next, room, team, onBid, disabled }: { label: string; extra: number; next: number | null; room: RoomState; team: TeamState; onBid: (x: number) => void; disabled: boolean }) {
  const ok = !disabled && next != null && !blocker(room, team, next + extra);
  return <button className="btn btn-sm" disabled={!ok} onClick={() => onBid(extra)} title={next != null ? `Jump to ${money(next + extra)}` : ''}>{label}</button>;
}

function TeamRow({ t, room, owner, onOpen }: { t: TeamState; room: RoomState; owner: string; onOpen: () => void }) {
  const os = t.squad.filter((x) => getPlayer(x.id).overseas).length;
  const lot = room.lot;
  const leading = lot?.leader === t.code && lot.status === 'live';
  const passed = lot?.status === 'live' && lot.passed.includes(t.code);
  const pct = (t.purse / room.settings.purse) * 100;
  return (
    <button className={`tcard ${leading ? 'leading' : ''} ${passed ? 'passed' : ''} ${t.ownerId === memberId ? 'me' : ''}`} style={teamVars(t.code)} onClick={onOpen} aria-label={`${t.code} squad`}>
      <TeamLogo code={t.code} size={40} />
      <div style={{ minWidth: 0 }}>
        <div className="owner ellipsis">{owner}</div>
        <div className="meta">{t.squad.length}/{room.settings.maxSquad} · ✈ {os}/{room.settings.maxOverseas}{passed ? ' · ' : ''}{passed && <span className="tag-pass">PASSED</span>}</div>
      </div>
      <div className="purse">{money(t.purse, { short: true })}</div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
    </button>
  );
}

function PlayerArt({ p, leader }: { p: Player; leader: string | null }) {
  const src = playerPhoto(p);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {leader ? <img key={leader} className="pattern" src={teamPattern(leader)} alt="" aria-hidden="true" /> : <div className="pattern neutral" aria-hidden="true" />}
      <div className="glow" />
      {src && !failed ? (
        <img className={`photo ${p.photo === 'wiki' ? 'wiki' : ''}`} src={src} alt={p.name} onError={() => setFailed(true)} />
      ) : (
        <>
          <Silhouette />
          <div className="initials">{initials(p.name)}</div>
        </>
      )}
      {leader && <img className="lastteam logo" src={`/teams/${leader}.svg`} alt={`${leader} leads`} />}
      <div className="rating" title="Auction rating"><div><b>{p.rating}</b><span>RTG</span></div></div>
      {p.marquee && <span className="chip chip-gold marquee-tag">★ Marquee</span>}
      <div className="nameplate only-mobile">
        <div className="display">{p.name}</div>
        <div className="np-sub">{ROLE_LABEL[p.role]} · {flagEmoji(p.cc)} {p.country}</div>
      </div>
    </>
  );
}

function PlayerFacts({ p, lot }: { p: Player; lot: Lot }) {
  const parts = p.name.split(' ');
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const last = parts[parts.length - 1];
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="chip">{ROLE_LABEL[p.role]}</span>
        <span className={`chip ${p.overseas ? 'chip-os' : ''}`}>{flagEmoji(p.cc)} {p.country}</span>
        <span className="chip">{p.capped ? 'Capped' : 'Uncapped'}</span>
      </div>
      <motion.div key={p.id} className="pname display" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {first && <span className="first">{first}</span>}
        {last}
      </motion.div>
      <div className="facts">
        <div className="fact"><span>Base price</span><b className="gold">{money(lot.base)}</b></div>
        <div className="fact"><span>Matches</span><b>{p.m || '—'}</b></div>
        {p.age ? <div className="fact"><span>Age</span><b>{p.age}</b></div> : <div className="fact"><span>Rating</span><b>{p.rating}</b></div>}
        <div className="fact"><span>Runs</span><b>{p.runs || '—'}{p.runs ? <small className="dim"> @ {p.sr.toFixed(0)} SR</small> : null}</b></div>
        <div className="fact" style={{ gridColumn: 'span 2' }}><span>Wickets</span><b>{p.wkts || '—'}{p.wkts ? <small className="dim"> @ {p.econ.toFixed(2)} econ</small> : null}</b></div>
      </div>
    </>
  );
}

// Who can still bid on this lot: leading / in / passed / out (squad full, purse, overseas cap)
function RaceStrip({ room }: { room: RoomState }) {
  const lot = room.lot!;
  if (lot.status !== 'live') return null;
  const teams = Object.values(room.teams);
  return (
    <div className="race only-desktop">
      <div className="eyebrow" style={{ marginBottom: 8 }}>In the race</div>
      <div className="race-row">
        {teams.map((t) => {
          const out = lot.leader !== t.code && blocker(room, t, lot.next) !== null;
          const st = lot.leader === t.code ? 'lead' : lot.passed.includes(t.code) ? 'passed' : out ? 'out' : 'in';
          const label = { lead: 'Leading', passed: 'Passed', out: 'Can\'t bid', in: 'In' }[st];
          return (
            <div key={t.code} className={`race-team ${st}`} title={`${t.code}: ${label}`}>
              <TeamLogo code={t.code} size={34} />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BidBox({ lot, ms, paused, owner, bidTime }: { lot: Lot; ms: number; paused: boolean; owner: string; bidTime: number }) {
  const secs = Math.ceil(ms / 1000);
  const frac = Math.min(1, ms / (bidTime * 1000));
  const crit = secs <= 3;
  const warn = secs <= 6;
  const live = lot.status === 'live';
  return (
    <div className="bidbox">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">{lot.bid == null ? 'Opening at base' : 'Current bid'}</div>
          <AnimatePresence mode="popLayout">
            <motion.div key={lot.bid ?? 'base'} className="amount" initial={{ scale: 1.25, opacity: 0, y: -6 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
              {money(lot.bid ?? lot.base)}
            </motion.div>
          </AnimatePresence>
        </div>
        {live && (
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow">{paused ? 'Paused' : 'Clock'}</div>
            <div className={`timer-num ${crit && !paused ? 'crit' : ''}`}>{paused ? '⏸' : secs}</div>
          </div>
        )}
      </div>
      <div className="leader" style={{ marginTop: 6 }}>
        {lot.leader ? (
          <>
            <TeamLogo code={lot.leader} size={44} />
            <div style={{ minWidth: 0 }}>
              <b>{lot.leader}</b>
              <div className="muted ellipsis" style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, marginTop: -2 }}>{owner} holds the bid</div>
            </div>
            <div className="grow" />
            {live && crit && !paused && <div className="going">{secs <= 1 ? 'GOING TWICE…' : 'GOING ONCE…'}</div>}
          </>
        ) : (
          <div className="muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 600 }}>{live ? 'No bids yet. Who opens?' : ' '}</div>
        )}
      </div>
      {live && (
        <div className={`timer ${crit ? 'crit' : warn ? 'warn' : ''}`}>
          <i style={{ transform: `scaleX(${frac})` }} />
        </div>
      )}
      {lot.history.length > 1 && (
        <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
          {lot.history.slice(-4, -1).reverse().map((h, i) => (
            <span key={i} className="chip" style={{ opacity: 1 - i * 0.18 }}><TeamLogo code={h.team} size={16} /> {money(h.amount)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SidePanel({ room, tab, setTab, myTeam }: { room: RoomState; tab: 'feed' | 'next' | 'squad'; setTab: (t: 'feed' | 'next' | 'squad') => void; myTeam?: TeamState }) {
  const sold = room.log.filter((l) => l.kind !== 'info').slice().reverse();
  return (
    <>
      <div className="sidepanel-tabs" role="tablist">
        <button className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>Results</button>
        <button className={tab === 'next' ? 'on' : ''} onClick={() => setTab('next')}>Up next</button>
        <button className={tab === 'squad' ? 'on' : ''} onClick={() => setTab('squad')} disabled={!myTeam}>My squad</button>
      </div>
      <div className="side-body">
        {tab === 'feed' && (sold.length ? sold.map((l, i) => {
          const p = l.id ? getPlayer(l.id) : null;
          if (!p) return null;
          return (
            <motion.div key={`${l.t}-${i}`} className="feed-item" initial={i === 0 ? { opacity: 0, x: 20 } : false} animate={{ opacity: 1, x: 0 }}>
              <Face p={p} />
              <div style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontSize: 15 }}>{p.name}</div>
                <div className="dim" style={{ fontSize: 12 }}>{l.kind === 'sold' ? `to ${l.team}` : 'Unsold'}</div>
              </div>
              {l.kind === 'sold' ? <div className="row" style={{ gap: 6 }}><span className="amt">{money(l.amount, { short: true })}</span><TeamLogo code={l.team!} size={24} /></div> : <span className="dim">—</span>}
            </motion.div>
          );
        }) : <div className="dim" style={{ padding: 16, textAlign: 'center' }}>Sold players will appear here.</div>)}

        {tab === 'next' && (room.upcoming.length ? room.upcoming.map((id) => {
          const p = getPlayer(id);
          return (
            <div key={id} className="up-item">
              <Face p={p} />
              <div className="grow">
                <div className="ellipsis" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                <div className="dim" style={{ fontSize: 12 }}>{ROLE_LABEL[p.role]} · {flagEmoji(p.cc)} {p.overseas ? 'Overseas' : 'India'}</div>
              </div>
              <span className="chip chip-gold">{money(p.base)}</span>
            </div>
          );
        }) : <div className="dim" style={{ padding: 16, textAlign: 'center' }}>Last few lots of this round.</div>)}

        {tab === 'squad' && myTeam && (myTeam.squad.length ? myTeam.squad.slice().reverse().map((s) => {
          const p = getPlayer(s.id);
          return (
            <div key={s.id} className="feed-item">
              <Face p={p} />
              <div style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontSize: 15 }}>{p.name}</div>
                <div className="dim" style={{ fontSize: 12 }}>{ROLE_LABEL[p.role]}{p.overseas ? ' · ✈' : ''}</div>
              </div>
              <span className="amt">{money(s.price, { short: true })}</span>
            </div>
          );
        }) : <div className="dim" style={{ padding: 16, textAlign: 'center' }}>No players yet. Go get someone!</div>)}
      </div>
    </>
  );
}

