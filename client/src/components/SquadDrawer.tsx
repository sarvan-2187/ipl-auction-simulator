import { motion } from 'framer-motion';
import { getPlayer, getTeam, money, ROLE_LABEL, teamStrength } from '../lib/data';
import type { Role, RoomState } from '../lib/types';
import { Face, TeamLogo, teamVars } from './ui';
import { useEffect } from 'react';

const ORDER: Role[] = ['BAT', 'WK', 'AR', 'BOWL'];

export default function SquadDrawer({ room, code, onClose }: { room: RoomState; code: string; onClose: () => void }) {
  const t = room.teams[code];
  const info = getTeam(code)!;
  const owner = room.members.find((m) => m.team === code);
  const spent = room.settings.purse - t.purse;
  const os = t.squad.filter((s) => getPlayer(s.id).overseas).length;
  const { score } = teamStrength(t.squad.map((s) => s.id));

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
        <div className="squad-list">
          {t.squad.length === 0 && <div className="dim" style={{ padding: 20, textAlign: 'center' }}>No players bought yet.</div>}
          {t.squad.length > 0 && <div className="eyebrow" style={{ marginTop: 10 }}>Best-XI strength <span className="gold">{score}</span></div>}
          {ORDER.map((role) => {
            const list = t.squad.filter((s) => getPlayer(s.id).role === role).sort((a, b) => b.price - a.price);
            if (!list.length) return null;
            return (
              <div className="role-group" key={role}>
                <div className="eyebrow">{ROLE_LABEL[role]}s · {list.length}</div>
                {list.map((s) => {
                  const p = getPlayer(s.id);
                  return (
                    <div className="squad-row" key={s.id} style={teamVars(code)}>
                      <Face p={p} />
                      <div style={{ minWidth: 0 }}>
                        <div className="ellipsis" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 17 }}>{p.name} {p.overseas && <span title="Overseas">✈</span>}</div>
                        <div className="dim" style={{ fontSize: 12 }}>{p.country} · RTG {p.rating}</div>
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
