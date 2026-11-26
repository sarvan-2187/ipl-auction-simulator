// Dream11-style Playing XI on a cricket ground: heads by role, XI rating on top,
// auto-pick, suggestions, bench, role switching and locking.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { getPlayer, getTeam, playerPhoto, ratingAs, ROLE_LABEL } from '../lib/data';
import { call } from '../lib/socket';
import { autoXI, MAX_OS, roleIn, suggestions, XI_SIZE, xiInfo } from '../lib/xi';
import type { Player, Role, RoomState, TeamState } from '../lib/types';
import { TeamLogo, initials, useToast } from './ui';
import { sfx } from '../lib/sound';
import { renderSquadCard, renderXICard, shareOrDownload, SITE } from '../lib/shareCard';

// y = row height on the ground; half = how far from centre the row may spread (the oval is narrower at the ends)
const ROWS: { role: Role; label: string; y: number; half: number }[] = [
  { role: 'WK', label: 'Wicket-keeper', y: 13, half: 26 },
  { role: 'BAT', label: 'Batters', y: 36, half: 39 },
  { role: 'AR', label: 'All-rounders', y: 60, half: 39 },
  { role: 'BOWL', label: 'Bowlers', y: 83, half: 33 },
];
const short = (p: Player) => {
  const parts = p.name.split(' ');
  return parts.length > 1 ? parts.slice(-1)[0] : p.name;
};

export default function XIBuilder({ room, team, readOnly = false, onDone }: { room: RoomState; team: TeamState; readOnly?: boolean; onDone?: () => void }) {
  const [card, setCard] = useState<{ url: string; blob: Blob; kind: 'xi' | 'squad' } | null>(null);
  const [making, setMaking] = useState<'xi' | 'squad' | null>(null);
  const owner = room.members.find((m) => m.id === team.ownerId)?.name || team.code;
  const makeCard = async (kind: 'xi' | 'squad') => {
    setMaking(kind);
    try {
      const blob = kind === 'xi'
        ? await renderXICard({ ...team, xi: ids }, ids, owner, room.code)
        : await renderSquadCard(team, owner, room.code, room.settings.purse);
      setCard({ url: URL.createObjectURL(blob), blob, kind });
    } catch { toast('Could not create the image', true); }
    setMaking(null);
  };
  const toast = useToast();
  const info0 = getTeam(team.code)!;
  const [ids, setIds] = useState<number[]>(() => team.xi ?? []);
  const [sel, setSel] = useState<number | null>(null);
  const locked = !!team.xiLocked;
  const editable = !readOnly && !locked;
  const squad = team.squad;
  const info = useMemo(() => xiInfo(ids, squad), [ids, squad]);
  const tips = useMemo(() => (editable ? suggestions(ids, squad) : []), [ids, squad, editable]);
  const bench = squad.filter((e) => !ids.includes(e.id)).sort((a, b) => ratingAs(getPlayer(b.id), roleIn(squad, b.id)) - ratingAs(getPlayer(a.id), roleIn(squad, a.id)));

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  // a traded-away player leaves the XI
  useEffect(() => {
    const own = new Set(squad.map((x) => x.id));
    setIds((v) => (v.every((id) => own.has(id)) ? v : v.filter((id) => own.has(id))));
  }, [squad]);

  // follow server updates when viewing someone else's XI / after locking
  useEffect(() => { if (!editable) setIds(team.xi ?? []); }, [team.xi, editable]);

  // save drafts so a refresh keeps your picks
  const saveTimer = useRef<number>();
  const save = (next: number[], lock = false) => {
    window.clearTimeout(saveTimer.current);
    const send = async () => {
      const r = await call('setXI', { ids: next, lock });
      if (!r.ok) toast(r.error || 'Could not save XI', true);
      else if (lock) { sfx.sold(); toast('XI locked in'); onDone?.(); }
    };
    if (lock) send(); else saveTimer.current = window.setTimeout(send, 400);
  };
  const update = (next: number[]) => { setIds(next); setSel(null); save(next); };

  const add = (id: number) => {
    if (!editable) return;
    if (ids.length >= XI_SIZE) return toast(`Your XI is full. Tap a player on the ground to bench him.`, true);
    const p = getPlayer(id);
    if (p.overseas && info.os >= MAX_OS) return toast(`Max ${MAX_OS} overseas in the XI`, true);
    sfx.bid();
    update([...ids, id]);
  };
  const remove = (id: number) => update(ids.filter((x) => x !== id));
  const setRole = async (id: number, role: Role) => {
    const r = await call('setRole', { id, role });
    if (!r.ok) toast(r.error || 'Could not change role', true);
    setSel(null);
  };

  // animated XI rating
  const mv = useMotionValue(info.rating);
  const shown = useTransform(mv, (v) => v.toFixed(1));
  useEffect(() => { const c = animate(mv, info.rating, { duration: 0.6, ease: 'easeOut' }); return () => c.stop(); }, [info.rating, mv]);

  const byRow = ROWS.map((row) => ({ ...row, list: ids.filter((id) => roleIn(squad, id) === row.role) }));
  const ringColor = info0.primary;

  return (
    <div className="xi" style={{ ['--c1' as any]: info0.primary, ['--c2' as any]: info0.secondary }}>
      <div className="xi-top">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <TeamLogo code={team.code} size={44} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{readOnly ? `${info0.name}` : locked ? 'Your XI · locked' : 'Pick your Playing XI'}</div>
            <div className="xi-counts">
              {(['WK', 'BAT', 'AR', 'BOWL'] as Role[]).map((r) => <span key={r}>{r} <b>{info.counts[r]}</b></span>)}
              <span className={info.os > MAX_OS ? 'bad' : ''}>OS <b>{info.os}/{MAX_OS}</b></span>
            </div>
          </div>
        </div>
        <div className="xi-rating" aria-label={`XI rating ${info.rating}`}>
          <span>XI rating</span>
          <motion.b>{shown}</motion.b>
          <i>{ids.length}/{Math.min(XI_SIZE, squad.length)}</i>
        </div>
      </div>

      <div className="xi-main">
        <div className="ground-wrap">
          <div className="ground" onClick={() => setSel(null)}>
            <div className="g-rope" /><div className="g-inner" />
            <div className="g-pitch"><i /><i /></div>
            {ROWS.map((r) => <div key={r.role} className="g-label" style={{ top: `${r.y - 9}%` }}>{r.label}</div>)}
            <LayoutGroup>
              <AnimatePresence>
                {byRow.flatMap((row) => row.list.map((id, i) => {
                  const p = getPlayer(id);
                  const role = row.role;
                  const n = row.list.length;
                  const spread = Math.min(row.half, 9 * (n - 1)); // keep small rows bunched in the middle
                  const x = n === 1 ? 50 : 50 - spread + (2 * spread * i) / (n - 1);
                  const src = playerPhoto(p);
                  return (
                    <div key={id} className={`head-pos ${sel === id ? 'sel' : ''}`} style={{ left: `${x}%`, top: `${row.y}%` }}>
                    <motion.button
                      layoutId={`xi-${id}`}
                      className={`head ${sel === id ? 'sel' : ''}`}
                      style={{ ['--ring' as any]: ringColor }}
                      initial={{ opacity: 0, scale: 0.3, y: 40 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.3, y: 30 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                      onClick={(e) => { e.stopPropagation(); if (editable) setSel(sel === id ? null : id); }}
                      aria-label={`${p.name}, ${ROLE_LABEL[role]} ${ratingAs(p, role)}`}
                    >
                      <span className="h-img">{src ? <img src={src} alt="" draggable={false} /> : <em>{initials(p.name)}</em>}</span>
                      <span className="h-rt">{ratingAs(p, role)}</span>
                      {p.overseas && <span className="h-os">OS</span>}
                      <span className="h-name pn">{short(p)}</span>
                      <AnimatePresence>
                        {sel === id && (
                          <motion.span className="h-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={(e) => e.stopPropagation()}>
                            <em>Play as</em>
                            {(p.roles || [p.role]).map((r) => (
                              <span key={r} role="button" tabIndex={0} className={r === role ? 'on' : ''} onClick={() => r !== role && setRole(id, r)}>{r} {ratingAs(p, r)}</span>
                            ))}
                            <span role="button" tabIndex={0} className="out" onClick={() => remove(id)}>Bench</span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                    </div>
                  );
                }))}
              </AnimatePresence>
            </LayoutGroup>
            {ids.length === 0 && editable && (
              <div className="g-empty">
                <b>Your ground is empty</b>
                <span>Tap players on the bench, or let us pick the strongest XI.</span>
                <button className="btn btn-gold" onClick={(e) => { e.stopPropagation(); sfx.sold(); update(autoXI(squad)); }}>Auto-pick best XI</button>
              </div>
            )}
          </div>
        </div>

        <aside className="xi-side">
          {editable && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => { sfx.newLot(); update(autoXI(squad)); }}>Auto-pick</button>
              <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => update([])} disabled={!ids.length}>Clear</button>
            </div>
          )}
          {editable && ids.length > 0 && <div className="dim" style={{ fontSize: 12 }}>Tap a player on the ground to change his role or bench him.</div>}
          <div className="row" style={{ gap: 8 }}>
            {ids.length > 0 && (
              <button className="btn btn-sm xi-share" onClick={() => makeCard('xi')} disabled={!!making}>{making === 'xi' ? 'Creating…' : 'Share XI'}</button>
            )}
            {squad.length > 0 && (
              <button className="btn btn-sm xi-share" onClick={() => makeCard('squad')} disabled={!!making}>{making === 'squad' ? 'Creating…' : 'Share full squad'}</button>
            )}
          </div>
          {info.issues.length > 0 && (
            <div className="xi-issues">{info.issues.map((t) => <div key={t}>{t}</div>)}</div>
          )}
          {tips.length > 0 && (
            <div className="xi-tips">
              <div className="eyebrow">Suggestions</div>
              {tips.map((t) => (
                <button key={t.text} className="xi-tip" onClick={() => { sfx.bid(); update(t.apply); }}>
                  <span>{t.text}</span><b>+{t.delta.toFixed(1)}</b>
                </button>
              ))}
            </div>
          )}
          {!readOnly && (
            <>
              <div className="eyebrow" style={{ marginTop: 4 }}>Bench · {bench.length}</div>
              <div className="xi-bench">
                {bench.map((e) => {
                  const p = getPlayer(e.id);
                  const role = roleIn(squad, e.id);
                  const src = playerPhoto(p);
                  return (
                    <motion.button layoutId={`xi-${e.id}`} key={e.id} className="bench-card" onClick={() => add(e.id)} disabled={!editable}>
                      <span className="b-img">{src ? <img src={src} alt="" loading="lazy" /> : <em>{initials(p.name)}</em>}</span>
                      <span className="b-txt">
                        <span className="pn ellipsis">{p.name}</span>
                        <span className="b-roles">
                          {(p.roles || [p.role]).map((r) => (
                            <span key={r} role="button" tabIndex={0} className={r === role ? 'on' : ''}
                              onClick={(ev) => { ev.stopPropagation(); if (editable && r !== role) setRole(e.id, r); }}>
                              {r} {ratingAs(p, r)}
                            </span>
                          ))}
                          {p.overseas && <span className="os">OS</span>}
                        </span>
                      </span>
                      {editable && <span className="b-add">+</span>}
                    </motion.button>
                  );
                })}
              </div>
            </>
          )}
          {editable && (
            <button className="btn btn-gold xi-lock" disabled={!info.legal} onClick={() => save(ids, true)}>
              {info.legal ? `Lock XI · ${info.rating.toFixed(1)}` : `Pick ${Math.min(XI_SIZE, squad.length) - ids.length > 0 ? Math.min(XI_SIZE, squad.length) - ids.length + ' more' : 'a legal XI'}`}
            </button>
          )}
          {!readOnly && locked && (
            <>
              <div className="dim" style={{ fontSize: 13 }}>Locked. Your XI rating counts in the final standings.</div>
              <button className="btn btn-sm" onClick={() => save(ids, false)}>Edit XI</button>
            </>
          )}
        </aside>
      </div>

      <AnimatePresence>
        {card && (
          <>
            <motion.div className="drawer-back" style={{ zIndex: 80 }} onClick={() => { URL.revokeObjectURL(card.url); setCard(null); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="share-modal" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Share your XI">
              <img src={card.url} alt={`${info0.name} ${card.kind === 'xi' ? 'Playing XI' : 'full squad'}`} />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={async () => {
                  const r = card.kind === 'xi'
                    ? await shareOrDownload(card.blob, `${team.code}-playing-xi.png`, `My ${info0.name} Playing XI: rated ${info.rating.toFixed(1)}. Build yours at https://${SITE}`)
                    : await shareOrDownload(card.blob, `${team.code}-full-squad.png`, `My ${info0.name} squad from the IPL Auction Room. Build yours at https://${SITE}`);
                  if (r === 'downloaded') toast('Image saved');
                }}>Share</button>
                <button className="btn" onClick={() => { URL.revokeObjectURL(card.url); setCard(null); }}>Close</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
