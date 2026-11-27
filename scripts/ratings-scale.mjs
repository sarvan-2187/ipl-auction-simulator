// Rating scale for the game: everyone sits between 65 and 98, a handful of stars are 99,
// and 100 is kept for legends. The engine in ratings.mjs produces a raw 35-99 score first;
// this maps it onto the visible scale and applies the hand-set names below.
export const FLOOR = 65;
export const CEIL = 98;

// Exact ratings for named players (matched case-insensitively)
export const OVERRIDES = {
  100: ['Virat Kohli', 'Rohit Sharma', 'Mahendra Singh Dhoni'],
  99: ['Jasprit Bumrah', 'Kane Williamson', 'Vaibhav Sooryavanshi'],
};
const FIXED = new Map(Object.entries(OVERRIDES).flatMap(([r, names]) => names.map((n) => [n.toLowerCase(), +r])));

export const boost = (old) => Math.round(FLOOR + ((Math.max(35, Math.min(99, old)) - 35) * (CEIL - FLOOR)) / 64);

// players: array with .rating and .ratings{BAT,BOWL,AR,WK}. Mutates and returns it.
export function rescale(players) {
  for (const p of players) {
    const main = boost(p.rating);
    const fixed = FIXED.get(String(p.name).toLowerCase());
    const target = fixed ?? main;
    const lift = target - main;
    // only skills tied to the headline role move with it (WK batting, AR batting and bowling)
    const link = p.role === 'WK' ? { BAT: lift } : p.role === 'AR' ? { BAT: lift / 2, BOWL: lift / 2 } : {};
    for (const k of Object.keys(p.ratings || {})) {
      if (p.ratings[k] == null) continue;
      p.ratings[k] = k === p.role ? target : Math.min(target, Math.max(FLOOR, Math.round(boost(p.ratings[k]) + (link[k] || 0))));
    }
    p.rating = target;
  }
  return players;
}
