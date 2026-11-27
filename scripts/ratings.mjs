import { rescale } from './ratings-scale.mjs';
// Rating engine shared by fetch-data.mjs (online refresh) and rerate.mjs (offline, cached data only).
// Input: players [{ id, gid, name, role, country, cc, overseas, seasons: ['2026', ...], imgs }],
//        statsOf Map(id -> iplt20 stats JSON), retained Map(norm(name) -> retention record).
// Output: rated players sorted best first, with base price and marquee flag.

// Recent form counts most: the last two seasons carry most of the weight
export const SEASON_WEIGHT = { 2026: 1, 2025: 0.8, 2024: 0.45, 2023: 0.25, 2022: 0.12, 2021: 0.08, 2020: 0.05, 2019: 0.03 };
const ELITE = 62; // the best 62 players are spread evenly over 90-99

// Hand-picked marquee names (matched case-insensitively). Drives base price and bot valuations.
const MARQUEE = `Virat Kohli,Rohit Sharma,Jasprit Bumrah,Shubman Gill,Rishabh Pant,Shreyas Iyer,KL Rahul,Hardik Pandya,
Suryakumar Yadav,Yashasvi Jaiswal,Sanju Samson,Ruturaj Gaikwad,Rashid Khan,Pat Cummins,Heinrich Klaasen,Travis Head,
Abhishek Sharma,Nicholas Pooran,Jos Buttler,Mitchell Starc,Trent Boult,Arshdeep Singh,Mohammed Siraj,Kuldeep Yadav,
Ravindra Jadeja,Axar Patel,Varun Chakaravarthy,Sunil Narine,Andre Russell,Rinku Singh,Yuzvendra Chahal,Sai Sudharsan,
Phil Salt,Tilak Varma,Ishan Kishan,Mohammed Shami,Bhuvneshwar Kumar,Josh Hazlewood,Kagiso Rabada,Glenn Maxwell,
Liam Livingstone,Marcus Stoinis,Mitchell Marsh,Aiden Markram,David Miller,Shivam Dube,Prasidh Krishna,Riyan Parag,
Ravi Bishnoi,Harshal Patel,Tristan Stubbs,Cameron Green,Rachin Ravindra,Jake Fraser-McGurk,Noor Ahmad,Matheesha Pathirana,
Will Jacks,Dewald Brevis,Nitish Kumar Reddy,Priyansh Arya,Prabhsimran Singh,Shashank Singh,Mitchell Santner,Jofra Archer,
Marco Jansen,Lockie Ferguson,Kane Williamson,Faf du Plessis,Quinton de Kock,Venkatesh Iyer,Washington Sundar,Sai Kishore,
Mahendra Singh Dhoni,Kieron Pollard,David Warner,Ben Stokes,Shikhar Dhawan,Sam Curran,Wanindu Hasaranga`
  .split(',').map((s) => s.trim().toLowerCase());

// Indian players with international caps (names as written on iplt20.com). Everyone overseas
// counts as capped. Indians not listed here (and not marked capped in the retention feed) are uncapped.
const INDIA_CAPPED = new Set(`Virat Kohli,Rohit Sharma,Jasprit Bumrah,Shubman Gill,Rishabh Pant,Shreyas Iyer,KL Rahul,Hardik Pandya,
Suryakumar Yadav,Yashasvi Jaiswal,Sanju Samson,Ruturaj Gaikwad,Arshdeep Singh,Mohammed Siraj,Kuldeep Yadav,Ravindra Jadeja,
Axar Patel,Varun Chakaravarthy,Rinku Singh,Yuzvendra Chahal,Sai Sudharsan,Tilak Varma,Ishan Kishan,Mohammed Shami,
Bhuvneshwar Kumar,Shivam Dube,Prasidh Krishna,Riyan Parag,Ravi Bishnoi,Harshal Patel,Nitish Kumar Reddy,Washington Sundar,
Abhishek Sharma,Mahendra Singh Dhoni,Shikhar Dhawan,Dinesh Karthik,Ravichandran Ashwin,Ajinkya Rahane,Deepak Chahar,
Shardul Thakur,Umesh Yadav,Ishant Sharma,Mukesh Kumar,Avesh Khan,Umran Malik,Navdeep Saini,Khaleel Ahmed,Jaydev Unadkat,
Mohit Sharma,Sandeep Sharma,T Natarajan,Washington Sundar,Venkatesh Iyer,Deepak Hooda,Krunal Pandya,Rahul Tripathi,
Prithvi Shaw,Mayank Agarwal,Manish Pandey,Kedar Jadhav,Ambati Rayudu,Wriddhiman Saha,Dhruv Jurel,Jitesh Sharma,
Rajat Patidar,Harshit Rana,Akash Deep,Mukesh Choudhary,Vijay Shankar,Shahbaz Ahmed,Kuldeep Sen,Chetan Sakariya,
Siddharth Kaul,Varun Aaron,Shivam Mavi,Amit Mishra,Piyush Chawla,Karn Sharma,Rahul Chahar,Jayant Yadav,Kartik Tyagi,
Mandeep Singh,Manan Vohra,Ruturaj Gaikwad,Shreyas Gopal,KS Bharat,Srikar Bharat,Sarfaraz Khan,Devdutt Padikkal,
Yash Dayal,Ramandeep Singh,Rasikh Dar,Abhimanyu Easwaran,Rahul Tewatia,Sai Kishore,Dhruv Shorey,Saurabh Kumar,
Nitish Rana,Tushar Deshpande,Robin Uthappa,Karun Nair,Suresh Raina,Krishnappa Gowtham,Harbhajan Singh,Rishi Dhawan,
Shahbaz Nadeem,Dhawal Kulkarni,Saurabh Tiwary,Gurkeerat Singh,Pawan Negi,Cheteshwar Pujara,Hanuma Vihari,Parthiv Patel,
Kuldeep Yadav,Barinder Sran,Stuart Binny,Yusuf Pathan,Irfan Pathan,Ashok Dinda,Mohammed Shami,Ravi Bishnoi,Arshdeep Singh`
  .split(',').map((x) => x.trim().toLowerCase()));
// Feed corrections
const CAPPED_OVERRIDE = { 'ravindra jadeja': true };
// Manual rating overrides (name -> rating), applied after the stats-based rating
const RATING_OVERRIDE = { 'hardik pandya': 96, 'andre russell': 95 };

export const ROLE_MAP = { batsman: 'BAT', bowler: 'BOWL', allrounder: 'AR', wicketkeeper: 'WK' };
export const RET_ROLE = { Batter: 'BAT', Bowler: 'BOWL', 'All-Rounder': 'AR', Allrounder: 'AR', 'All Rounder': 'AR', Wicketkeeper: 'WK' };

export const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

export function rateAll(players, statsOf, retained, log = console.log) {
  const num = (x) => (Number.isFinite(+x) ? +x : 0);
  const scored = [];
  for (const p of players.values()) {
    const st = statsOf.get(p.id);
    const bat = st?.careerTables?.batting?.rows || [];
    const bowl = st?.careerTables?.bowling?.rows || [];
    const car = st?.careerTables?.batting?.career || {};
    const bcar = st?.careerTables?.bowling?.career || {};

    // Batting score: runs weighted by recency, scaled by strike rate and (softly) average
    let batScore = 0;
    for (const r of bat) {
      const w = SEASON_WEIGHT[r.season] ?? 0.05;
      const sr = num(r.strikeRate) || 100;
      const avg = num(r.average) || 15;
      batScore += w * num(r.runs) * Math.pow(Math.min(sr, 230) / 135, 1.3) * Math.pow(Math.min(avg, 60) / 28, 0.35);
    }
    batScore += num(car.runs) * 0.025 * Math.pow((num(car.strikeRate) || 100) / 135, 1.2); // career pedigree

    // Bowling score: wickets weighted by recency, scaled by economy and strike rate
    let bowlScore = 0;
    for (const r of bowl) {
      const w = SEASON_WEIGHT[r.season] ?? 0.05;
      const econ = num(r.economy) || 9.5;
      const bsr = num(r.strikeRate) || 24;
      bowlScore += w * num(r.wickets) * 26 * Math.pow(8.8 / Math.max(econ, 5.5), 1.4) * Math.pow(20 / Math.max(bsr, 10), 0.3);
    }
    bowlScore += num(bcar.wickets) * 0.9 * Math.pow(8.6 / Math.max(num(bcar.economy) || 9.5, 5.5), 1.2);

    const keeping = num(car.catches) * 0.04 + num(car.stumpings) * 0.35; // only counted for keepers
    const matches = num(car.matches) || num(bcar.matches);
    const totals = {
      m: matches,
      runs: num(car.runs),
      sr: num(car.strikeRate),
      wkts: num(bcar.wickets),
      econ: num(bcar.wickets) ? num(bcar.economy) : 0,
    };
    scored.push({ p, batScore, bowlScore, keeping, totals });
  }
  // Each skill score -> rating by percentile against the specialists for that skill
  // (batting vs batters/keepers/all-rounders, bowling vs bowlers/all-rounders).
  const mainRole = (x) => { const r = retained.get(norm(x.p.name)); return r ? RET_ROLE[r.role] || x.p.role : x.p.role; };
  const pctOf = (key, refRoles) => {
    const ref = scored.filter((x) => refRoles.includes(mainRole(x))).map((x) => x[key]).sort((a, b) => a - b);
    for (const x of scored) {
      if (x[key] <= 0) { x[key + 'P'] = -1; continue; }
      let lo = 0, hi = ref.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ref[mid] < x[key]) lo = mid + 1; else hi = mid; }
      x[key + 'P'] = Math.min(1, lo / ref.length);
    }
  };
  pctOf('batScore', ['BAT', 'WK', 'AR']);
  pctOf('bowlScore', ['BOWL', 'AR']);

  // Build every rating for a given curve steepness; lower `k` = more generous top end
  const build = (k) => {
    const curve = (pct) => (pct < 0 ? 35 : 38 + 61 * Math.pow(pct, k)); // unrounded, can exceed 99 with boosts
    const res = [];
    for (const x of scored) {
      const { p, totals } = x;
      const r = retained.get(norm(p.name));
      const lname = p.name.toLowerCase();
      const marquee = MARQUEE.includes(lname);
      const role = mainRole(x);
      const bat = curve(x.batScoreP);
      const bowl = curve(x.bowlScoreP);
      // Fix 3: all-rounders, rewarded properly when they're good at both
      const both = Math.min(bat, bowl);
      const ar = 0.4 * bat + 0.4 * bowl + 0.2 * Math.max(bat, bowl) + (both >= 70 ? 7 : both >= 60 ? 4 : 0);
      const wk = role === 'WK' ? bat + Math.min(3, x.keeping) : null;
      const ratings = { BAT: bat, BOWL: bowl, AR: ar, WK: wk };

      // Fix 1: no flat floor. Marquee and retention give a small boost on top of the stats instead.
      const base = ratings[role] ?? bat;
      let boost = 0;
      if (marquee) boost += 3;
      if (r) boost += Math.min(4, Math.round(r.winningBid / 5));
      if (p.seasons[0] === '2021' && !marquee) boost -= 4; // not seen since 2021
      const raw = base + boost; // final rating is assigned after ranking everyone
      const roles = [role];
      if (role !== 'BAT' && ratings.BAT >= 60) roles.push('BAT');
      if (role !== 'BOWL' && (role === 'AR' || ratings.BOWL >= 62)) roles.push('BOWL');
      if (role !== 'AR' && ratings.BAT >= 62 && ratings.BOWL >= 62) roles.push('AR');
      const fixed = lname in RATING_OVERRIDE ? RATING_OVERRIDE[lname] : null;

      let capped = p.overseas || INDIA_CAPPED.has(lname);
      if (r && !p.overseas) capped = r.capped || capped;
      if (lname in CAPPED_OVERRIDE) capped = CAPPED_OVERRIDE[lname];
      res.push({
        id: p.id, gid: p.gid, name: p.name, role, roles, ratings, country: p.country, cc: p.cc, overseas: p.overseas, capped,
        age: r?.age ?? null, seasons: p.seasons.length, ...totals, _raw: raw, _base: base, _fixed: fixed, _imgs: p.imgs,
      });
    }
    return res;
  };
  // Rank everyone by underlying score; spread the best ELITE evenly over 99..90, cap the rest at 89
  const out = build(1.5).sort((a, b) => (b._fixed ?? b._raw) - (a._fixed ?? a._raw));
  out.forEach((x, i) => {
    let rating = i < ELITE ? 99 - Math.round((9 * i) / (ELITE - 1)) : Math.round(Math.max(35, Math.min(89, x._raw)));
    if (x._fixed != null) rating = x._fixed;
    x.rating = rating;
    // the main-role skill rating is the headline; shift linked skills by the same amount
    const lift = rating - x._base;
    x.ratings[x.role] = rating;
    if (x.role === 'WK') x.ratings.BAT += lift;
    if (x.role === 'AR') { x.ratings.BAT += lift / 2; x.ratings.BOWL += lift / 2; }
    for (const k of ['BAT', 'BOWL', 'AR', 'WK']) {
      if (x.ratings[k] == null) continue;
      // secondary skills never outrank the headline for the main role
      const cap = k === x.role ? 99 : Math.min(99, rating);
      x.ratings[k] = Math.round(Math.max(35, Math.min(cap, x.ratings[k])));
    }
    delete x._raw; delete x._base; delete x._fixed;
  });
  log(`ratings: ${out.filter((x) => x.rating >= 90).length} players at 90+, ${out.filter((x) => x.rating >= 80 && x.rating < 90).length} at 80-89`);
  out.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  // Base price by rank (lakhs), like the real auction's price bands
  const BANDS = [[30, 200], [60, 150], [120, 100], [200, 75], [320, 50]];
  out.forEach((p, i) => {
    const band = BANDS.find(([upto]) => i < upto);
    p.base = band ? band[1] : 30;
    if (!p.capped) p.base = Math.min(p.base, i < 100 ? 50 : 30);
    p.marquee = i < 30 && p.capped;
  });

  return rescale(out);
}
