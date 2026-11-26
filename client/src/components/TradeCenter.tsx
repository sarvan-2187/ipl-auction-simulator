import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getPlayer, money, ratingAs, roleOf } from '../lib/data';
import { call } from '../lib/socket';
import type { RoomState, TeamState, Trade } from '../lib/types';
import { Face, TeamLogo, teamVars, useToast } from './ui';

const STEP = 25; // cash moves in ₹25 L steps
const MAX_PICK = 6;

export const tradingOn = (room: RoomState) => room.phase === 'results' && room.settings.trading !== false;
const incoming = (room: RoomState, code?: string) => (room.trades || []).filter((t) => t.status === 'open' && t.to === code);

// Toasts for offers that arrive for you and answers to offers you sent
export function useTradeAlerts(room: RoomState, team?: TeamState) {
  const toast = useToast();
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const trades = room.trades || [];
    if (!seen.current) { seen.current = new Map(trades.map((t) => [t.id, t.status])); return; }
    for (const t of trades) {
      const was = seen.current.get(t.id);
      seen.current.set(t.id, t.status);
      if (!team || was === t.status) continue;
      if (!was && t.status === 'open' && t.to === team.code) toast(`${t.from} sent you a trade offer`);
      else if (t.from === team.code && t.status === 'accepted') toast(`${t.to} accepted your trade`);
      else if (t.from === team.code && t.status === 'rejected' && was) toast(`${t.to} turned down your trade`, true);
    }
  }, [room.trades, team?.code]);
}

export function TradeButton({ room, team, onOpen, className = 'btn' }: { room: RoomState; team?: TeamState; onOpen: () => void; className?: string }) {
  if (!tradingOn(room) || !team) return null;
  const n = incoming(room, team.code).length;
  return (
    <button className={`${className} trade-btn`} onClick={onOpen}>
      Trades{n > 0 && <span className="trade-badge">{n}</span>}
    </button>
  );
}

export default function TradeCenter({ room, team, onClose }: { room: RoomState; team: TeamState; onClose: () => void }) {
  const toast = useToast();
  const others = Object.values(room.teams).filter((t) => t.code !== team.code);
  const waiting = incoming(room, team.code).length;
  const [tab, setTab] = useState<'new' | 'offers'>(waiting ? 'offers' : 'new');
  const [to, setTo] = useState(others[0]?.code || '');
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [cash, setCash] = useState(0); // > 0: you pay, < 0: they pay
  const [busy, setBusy] = useState(false);
  const other = room.teams[to];

  // players can leave either squad through other trades while you're building an offer
  useEffect(() => {
    const mine = new Set(team.squad.map((x) => x.id));
    const theirs = new Set(other?.squad.map((x) => x.id));
    setGive((g) => g.filter((id) => mine.has(id)));
    setGet((g) => g.filter((id) => theirs.has(id)));
  }, [team.squad, other?.squad]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickTeam = (code: string) => { setTo(code); setGet([]); };
  const toggle = (list: number[], set: (v: number[]) => void, id: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_PICK ? list : [...list, id]);

  const payLimit = cash >= 0 ? team.purse : other?.purse ?? 0;
  const bump = (d: number) => setCash((c) => {
    const n = c + d;
    if (n > team.purse) return c;
    if (n < -(other?.purse ?? 0)) return c;
    return n;
  });

  const ready = (give.length || get.length) && (give.length || cash > 0) && (get.length || cash < 0);

  async function send() {
    if (!other || busy) return;
    setBusy(true);
    const r = await call('proposeTrade', { to, give, get, cash });
    setBusy(false);
    if (!r.ok) return toast(r.error || 'Could not send', true);
    const st = (r as any).trade?.status;
    // accepted offers are announced by useTradeAlerts
    if (st === 'rejected') toast(`${to} said no: ${(r as any).trade?.note || 'not enough value'}`, true);
    else if (st === 'open') toast(`Offer sent to ${to}`);
    setGive([]); setGet([]); setCash(0);
    if (st === 'open') setTab('offers');
  }

  const trades = useMemo(() => (room.trades || []).slice().sort((a, b) => {
    const rank = (t: Trade) => (t.status === 'open' && t.to === team.code ? 0 : t.status === 'open' && t.from === team.code ? 1 : 2);
    return rank(a) - rank(b) || b.t - a.t;
  }), [room.trades, team.code]);

  return (
    <>
      <motion.div className="drawer-back" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div className="trade-modal" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} role="dialog" aria-label="Trades">
        <div className="trade-top">
          <div>
            <div className="eyebrow">Trading window · Purse {money(team.purse)}</div>
            <div className="display" style={{ fontSize: 28 }}>Trades</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="seg trade-tabs">
          <button className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>New offer</button>
          <button className={tab === 'offers' ? 'on' : ''} onClick={() => setTab('offers')}>
            Offers{waiting > 0 && <span className="trade-badge">{waiting}</span>}
          </button>
        </div>

        {tab === 'new' ? (
          <>
            <div className="trade-teams">
              {others.map((t) => (
                <button key={t.code} className={`trade-team ${t.code === to ? 'on' : ''}`} style={teamVars(t.code)} onClick={() => pickTeam(t.code)}>
                  <TeamLogo code={t.code} size={30} />
                  <span>{t.code}</span>
                  <small>{room.members.find((m) => m.id === t.ownerId)?.bot ? 'CPU' : room.members.find((m) => m.id === t.ownerId)?.name}</small>
                </button>
              ))}
            </div>
            {other && (
              <div className="trade-cols">
                <SquadPick title={`You give · ${team.code}`} team={team} picked={give} onToggle={(id) => toggle(give, setGive, id)} />
                <SquadPick title={`You get · ${other.code}`} team={other} picked={get} onToggle={(id) => toggle(get, setGet, id)} />
              </div>
            )}
            <div className="trade-cash">
              <div>
                <div className="eyebrow">Cash</div>
                <div className="dim" style={{ fontSize: 12 }}>{cash === 0 ? 'No money changes hands' : cash > 0 ? `You pay ${to} ${money(cash)}` : `${to} pays you ${money(-cash)}`}</div>
              </div>
              <div className="stepper">
                <button onClick={() => bump(-STEP)} aria-label="They pay more">−</button>
                <span className="money">{cash === 0 ? '₹0' : `${cash > 0 ? 'You ' : 'They '}${money(Math.abs(cash), { short: true })}`}</span>
                <button onClick={() => bump(STEP)} aria-label="You pay more">+</button>
              </div>
              <span className="dim" style={{ fontSize: 11 }}>Max {money(payLimit, { short: true })}</span>
            </div>
            <button className="btn btn-gold trade-send" disabled={!ready || busy} onClick={send}>
              {busy ? 'Sending…' : other && room.members.find((m) => m.id === other.ownerId)?.bot ? `Offer to ${to} (answers instantly)` : `Send offer to ${to}`}
            </button>
          </>
        ) : (
          <div className="trade-list">
            {trades.length === 0 && <div className="dim" style={{ padding: 20, textAlign: 'center' }}>No offers yet. Trades between any teams show up here.</div>}
            {trades.map((t) => <TradeCard key={t.id} t={t} me={team.code} />)}
          </div>
        )}
      </motion.div>
    </>
  );
}

function SquadPick({ title, team, picked, onToggle }: { title: string; team: TeamState; picked: number[]; onToggle: (id: number) => void }) {
  const rows = team.squad.slice().sort((a, b) => getPlayer(b.id).rating - getPlayer(a.id).rating);
  return (
    <div className="trade-col" style={teamVars(team.code)}>
      <div className="eyebrow">{title} {picked.length > 0 && <span className="gold">· {picked.length}</span>}</div>
      <div className="trade-rows">
        {rows.map((e) => {
          const p = getPlayer(e.id);
          const role = roleOf(e);
          const on = picked.includes(e.id);
          return (
            <button key={e.id} className={`trade-row ${on ? 'on' : ''}`} onClick={() => onToggle(e.id)} aria-pressed={on}>
              <Face p={p} className="mini-face" />
              <span className="grow ellipsis pn">{p.name}</span>
              {p.overseas && <span className="chip chip-os trade-os">OS</span>}
              <span className="trade-meta">{role} {ratingAs(p, role)}<small>{money(e.price, { short: true })}</small></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STATUS: Record<Trade['status'], string> = { open: 'Waiting', accepted: 'Done', rejected: 'Declined', cancelled: 'Withdrawn', failed: 'Fell through' };

function TradeCard({ t, me }: { t: Trade; me: string }) {
  const toast = useToast();
  const side = (ids: number[], cash: number) => (
    <div className="trade-side">
      {ids.map((id) => { const p = getPlayer(id); return <div key={id} className="row" style={{ gap: 6 }}><Face p={p} className="mini-face" /><span className="ellipsis pn">{p.name}</span><span className="dim" style={{ fontSize: 11, marginLeft: 'auto' }}>{p.rating}</span></div>; })}
      {cash > 0 && <div className="trade-money money">+ {money(cash)}</div>}
      {!ids.length && cash <= 0 && <div className="dim">Nothing</div>}
    </div>
  );
  const act = async (ev: string, payload: object, ok?: string) => {
    const r = await call(ev, payload);
    if (!r.ok) toast(r.error || 'Failed', true); else if (ok) toast(ok);
  };
  const mineIn = t.status === 'open' && t.to === me;
  const mineOut = t.status === 'open' && t.from === me;
  return (
    <div className={`panel trade-card st-${t.status} ${mineIn ? 'incoming' : ''}`}>
      <div className="trade-card-head">
        <TeamLogo code={t.from} size={26} /><b>{t.from}</b><span className="dim">→</span><TeamLogo code={t.to} size={26} /><b>{t.to}</b>
        <span className={`chip ${t.status === 'accepted' ? 'chip-green' : t.status === 'open' ? 'chip-gold' : ''}`} style={{ marginLeft: 'auto', height: 22, fontSize: 11 }}>{STATUS[t.status]}</span>
      </div>
      <div className="trade-card-body">
        <div><div className="eyebrow">{t.from} gives</div>{side(t.give, t.cash)}</div>
        <div><div className="eyebrow">{t.to} gives</div>{side(t.get, -t.cash)}</div>
      </div>
      {t.note && t.status !== 'open' && <div className="dim" style={{ fontSize: 12 }}>{t.note}</div>}
      {mineIn && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => act('respondTrade', { id: t.id, accept: false })}>Decline</button>
          <button className="btn btn-sm btn-gold" style={{ flex: 1 }} onClick={() => act('respondTrade', { id: t.id, accept: true }, 'Trade done. Check your XI')}>Accept</button>
        </div>
      )}
      {mineOut && <button className="btn btn-sm btn-ghost" onClick={() => act('cancelTrade', { id: t.id })}>Withdraw offer</button>}
    </div>
  );
}
