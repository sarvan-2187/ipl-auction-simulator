import { motion } from 'framer-motion';
import { getPlayer, getTeam, money, ratingAs, ROLE_LABEL, roleOf, teamStrength } from '../lib/data';
import { call, memberId } from '../lib/socket';
import { RoleRules, ROLE_NAME } from './RoleRules';
import { useToast } from './ui';
import type { Role, RoomState } from '../lib/types';
import { Face, TeamLogo, teamVars } from './ui';
import { useEffect } from 'react';

const ORDER: Role[] = ['WK', 'BAT', 'AR', 'BOWL'];

export default function SquadDrawer({ room, code, onClose }: { room: RoomState; code: string; onClose: () => void }) {
  const t = room.teams[code];
  const info = getTeam(code)!;
  const owner = room.members.find((m) => m.team === code);
  const spent = room.settings.purse - t.purse;
  const os = t.squad.filter((s) => getPlayer(s.id).overseas).length;
  const { score } = teamStrength(t.squad);
  const mine = t.ownerId === memberId;
  const toast = useToast();
  const setRole = async (id: number, role: Role) => {
    const r = await call('setRole', { id, role });
    if (!r.ok) toast(r.error || 'Could not change role', true);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <>
      <motion.div className="drawer-back" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.aside className="drawer" style={teamVars(code)} initial={{ x: '100%' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} role="dialog" aria-label={`${info.name} squad`}>
        <div className="drawer-head">
          <TeamLogo code={code} size={64} />
          <div className="grow">
            <div className="display" style={{ fontSize: 30 }}>{info.name}</div>
            <div className="muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700 }}>{owner?.name}{owner?.bot ? ' · computer' : ''}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="kpis">
          <div className="fact"><span>Purse left</span><b className="gold">{money(t.purse)}</b></div>
          <div className="fact"><span>Spent</span><b>{money(spent)}</b></div>
          <div className="fact"><span>Squad</span><b>{t.squad.length}/{room.settings.maxSquad}</b></div>
          <div className="fact"><span>Overseas</span><b>{os}/{room.settings.maxOverseas}</b></div>
        </div>
        <div style={{ padding: '4px 16px 0' }}><RoleRules room={room} team={t} /></div>
        <div className="squad-list">
          {t.squad.length === 0 && <div className="dim" style={{ padding: 20, textAlign: 'center' }}>No players bought yet.</div>}
          {t.squad.length > 0 && (
            <div className="eyebrow" style={{ marginTop: 10 }}>
              Best-XI strength <span className="gold">{score}</span>{mine && ' · tap a role to switch'}
            </div>
          )}
          {ORDER.map((role) => {
            const list = t.squad.filter((s) => roleOf(s) === role).sort((a, b) => b.price - a.price);
            if (!list.length) return null;
            return (
              <div className="role-group" key={role}>
                <div className="eyebrow">{ROLE_NAME[role]} · {list.length}</div>
                {list.map((s) => {
                  const p = getPlayer(s.id);
                  const as = roleOf(s);
                  return (
                    <div className="squad-row" key={s.id} style={teamVars(code)}>
                      <Face p={p} />
                      <div style={{ minWidth: 0 }}>
                        <div className="ellipsis pn" style={{ fontSize: 20 }}>{p.name} {p.overseas && <span className="os-tag" title="Overseas">OS</span>}</div>
                        <div className="role-pick" role="group" aria-label={`${p.name} role`}>
                          {(p.roles || [p.role]).map((r) => (
                            <button key={r} className={r === as ? 'on' : ''} disabled={!mine || r === as} onClick={() => setRole(s.id, r)} title={`${ROLE_LABEL[r]}: rating ${ratingAs(p, r)}`}>
                              {r} <b>{ratingAs(p, r)}</b>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="display gold" style={{ fontSize: 24 }}>{money(s.price)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </motion.aside>
    </>
  );
}
