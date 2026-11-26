// Squad-rules tracker: BAT 3/3 · BOWL 2/4 · AR 1/2 · WK 0/2
import { ROLES, roleCounts, ruleMin } from '../lib/data';
import type { Role, RoomState, TeamState } from '../lib/types';

export const ROLE_NAME: Record<Role, string> = { BAT: 'Batters', BOWL: 'Bowlers', AR: 'All-rounders', WK: 'Keepers' };

export function RoleRules({ room, team, compact = false }: { room: RoomState; team: TeamState; compact?: boolean }) {
  if (room.settings.roleRules === false) return null; // squad rules switched off
  const counts = roleCounts(team.squad);
  const min = ruleMin(room.settings);
  return (
    <div className={`role-rules ${compact ? 'compact' : ''}`} aria-label="Squad rules">
      {ROLES.map((r) => {
        const ok = counts[r] >= (min[r] || 0);
        return (
          <div key={r} className={`rr ${ok ? 'ok' : 'short'}`} title={`${ROLE_NAME[r]}: ${counts[r]} of minimum ${min[r] || 0}`}>
            <span>{r}</span>
            <b>{counts[r]}<i>/{min[r] || 0}</i></b>
          </div>
        );
      })}
    </div>
  );
}

export function rulesMet(room: RoomState, team: TeamState) {
  const c = roleCounts(team.squad);
  const min = ruleMin(room.settings);
  return ROLES.every((r) => c[r] >= ((min as Record<string, number>)[r] || 0));
}
