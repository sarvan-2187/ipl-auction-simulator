// Builds the player pool + downloads player photos and team logos from iplt20.com.
// Usage: npm run fetch-data   (re-run any time to refresh squads / photos)
//
// Output:
//   client/public/data/players.json
//   client/public/data/teams.json
//   client/public/players/<id>.webp
//   client/public/teams/<CODE>.svg, <CODE>-bg.svg
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'client', 'public');
const BASE = 'https://www.iplt20.com';
const UA = { 'user-agent': 'Mozilla/5.0 (auction-sim data script)', accept: 'image/webp,application/json,*/*' };
const SEASONS = ['2026', '2025', '2024', '2023', '2022', '2021'];
const SEASON_WEIGHT = { 2026: 1, 2025: 0.85, 2024: 0.7, 2023: 0.5, 2022: 0.35, 2021: 0.25, 2020: 0.15, 2019: 0.1 };
const CACHE = path.join(ROOT, 'scripts', '.cache', 'stats');
const FORCE = process.argv.includes('--force');

export const TEAMS = [
  { code: 'CSK', id: 1622, slug: 'chennai-super-kings', name: 'Chennai Super Kings', city: 'Chennai', primary: '#F9CD05', secondary: '#0A4595', text: '#1a1a1a', titles: 5 },
  { code: 'MI', id: 1854, slug: 'mumbai-indians', name: 'Mumbai Indians', city: 'Mumbai', primary: '#004BA0', secondary: '#D1AB3E', text: '#ffffff', titles: 5 },
  { code: 'RCB', id: 2138, slug: 'royal-challengers-bengaluru', name: 'Royal Challengers Bengaluru', city: 'Bengaluru', primary: '#D11D26', secondary: '#1C1C1C', text: '#ffffff', titles: 1 },
  { code: 'KKR', id: 1873, slug: 'kolkata-knight-riders', name: 'Kolkata Knight Riders', city: 'Kolkata', primary: '#3A225D', secondary: '#B3A123', text: '#ffffff', titles: 3 },
  { code: 'DC', id: 1396, slug: 'delhi-capitals', name: 'Delhi Capitals', city: 'Delhi', primary: '#17479E', secondary: '#EF1B23', text: '#ffffff', titles: 0 },
  { code: 'PBKS', id: 2040, slug: 'punjab-kings', name: 'Punjab Kings', city: 'Mohali', primary: '#DD1F2D', secondary: '#A7A9AC', text: '#ffffff', titles: 0 },
  { code: 'RR', id: 1558, slug: 'rajasthan-royals', name: 'Rajasthan Royals', city: 'Jaipur', primary: '#EA1A85', secondary: '#254AA5', text: '#ffffff', titles: 1 },
  { code: 'SRH', id: 1153, slug: 'sunrisers-hyderabad', name: 'Sunrisers Hyderabad', city: 'Hyderabad', primary: '#F26522', secondary: '#1A1A1A', text: '#ffffff', titles: 1 },
  { code: 'GT', id: 2879, slug: 'gujarat-titans', name: 'Gujarat Titans', city: 'Ahmedabad', primary: '#1B2133', secondary: '#B9975B', text: '#ffffff', titles: 1 },
  { code: 'LSG', id: 2880, slug: 'lucknow-super-giants', name: 'Lucknow Super Giants', city: 'Lucknow', primary: '#0057E2', secondary: '#F28B00', text: '#ffffff', titles: 0 },
];
const CODE_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t.code]));

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
const RATING_OVERRIDE = { 'hardik pandya': 96 };

const ROLE_MAP = { batsman: 'BAT', bowler: 'BOWL', allrounder: 'AR', wicketkeeper: 'WK' };
const RET_ROLE = { Batter: 'BAT', Bowler: 'BOWL', 'All-Rounder': 'AR', Allrounder: 'AR', 'All Rounder': 'AR', Wicketkeeper: 'WK' };

const WIKI_UA = { 'user-agent': 'IPLAuctionSimulator/1.0 (private hobby game; data refresh script)', 'api-user-agent': 'IPLAuctionSimulator/1.0' };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function getJSON(url, headers = UA) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return await r.json();
      throw new Error(`${r.status} ${url}`);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
}
async function download(url, dest, headers = UA) {
  if (!FORCE) {
    try { await fs.access(dest); return 'cached'; } catch {}
  }
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`${r.status}`);
      await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
      return 'ok';
    } catch (e) {
      if (i === 3) return 'fail';
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

async function main() {
  await fs.mkdir(path.join(PUB, 'data'), { recursive: true });
  await fs.mkdir(path.join(PUB, 'players'), { recursive: true });
  await fs.mkdir(path.join(PUB, 'teams'), { recursive: true });

  // 1) Squads per season (newest first → newest photo/team wins)
  const players = new Map();
  for (const season of SEASONS) {
    for (const t of TEAMS) {
      let j;
      try { j = await getJSON(`${BASE}/api/bff/cms/teams/${t.slug}?tab=squad&season=${season}`); } catch { continue; } // team didn't exist yet
      for (const p of j.data.squad.players) {
        const ex = players.get(p.externalId);
        const img = p.imageUrlSet?.small || p.imageUrl;
        if (ex) { ex.seasons.push(season); ex.imgs.push(img); continue; }
        players.set(p.externalId, {
          id: p.externalId,
          gid: p.playerGid,
          name: p.name,
          role: ROLE_MAP[p.role] || 'BAT',
          country: p.country,
          cc: p.countryCode,
          overseas: !!p.isInternational,
          lastTeam: t.code,
          lastSeason: season,
          seasons: [season],
          imgs: [img],
        });
      }
    }
    console.log(`season ${season}: ${players.size} unique players`);
  }

  // 2) IPL 2027 retentions (status + retained fee + capped flag + age)
  const retained = new Map();
  for (const t of TEAMS) {
    const j = await getJSON(`${BASE}/api/bff/auction/2027/squad?team=${t.code}`);
    for (const r of j.data.players) retained.set(norm(r.displayName), { ...r, code: t.code });
  }

  // 3) IPL career stats per player (cached), used for ratings and the stat line on the card
  await fs.mkdir(CACHE, { recursive: true });
  const statsOf = new Map();
  let fetched = 0;
  await pool([...players.values()], 8, async (p) => {
    const f = path.join(CACHE, `${p.gid}.json`);
    let d;
    try { if (!FORCE) d = JSON.parse(await fs.readFile(f, 'utf8')); } catch {}
    if (!d) {
      try { d = (await getJSON(`${BASE}/api/bff/cms/players/${p.gid}/stats`)).data; } catch { d = null; }
      if (d) await fs.writeFile(f, JSON.stringify(d));
      fetched++;
    }
    statsOf.set(p.id, d);
  });
  console.log(`stats: ${statsOf.size} players (${fetched} fetched, rest cached)`);

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
    batScore += num(car.runs) * 0.06 * Math.pow((num(car.strikeRate) || 100) / 135, 1.2); // career pedigree

    // Bowling score: wickets weighted by recency, scaled by economy and strike rate
    let bowlScore = 0;
    for (const r of bowl) {
      const w = SEASON_WEIGHT[r.season] ?? 0.05;
      const econ = num(r.economy) || 9.5;
      const bsr = num(r.strikeRate) || 24;
      bowlScore += w * num(r.wickets) * 26 * Math.pow(8.8 / Math.max(econ, 5.5), 1.4) * Math.pow(20 / Math.max(bsr, 10), 0.3);
    }
    bowlScore += num(bcar.wickets) * 2.2 * Math.pow(8.6 / Math.max(num(bcar.economy) || 9.5, 5.5), 1.2);

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
  // (batting vs batters/keepers/all-rounders, bowling vs bowlers/all-rounders), so 90+ is genuinely elite.
  const mainRole = (x) => { const r = retained.get(norm(x.p.name)); return r ? RET_ROLE[r.role] || x.p.role : x.p.role; };
  const toRating = (key, refRoles) => {
    const ref = scored.filter((x) => refRoles.includes(mainRole(x))).map((x) => x[key]).sort((a, b) => a - b);
    for (const x of scored) {
      if (x[key] <= 0) { x[key + 'R'] = 35; continue; }
      let lo = 0, hi = ref.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ref[mid] < x[key]) lo = mid + 1; else hi = mid; }
      const pct = Math.min(1, lo / ref.length);
      x[key + 'R'] = Math.round(38 + 60 * Math.pow(pct, 1.7));
    }
  };
  toRating('batScore', ['BAT', 'WK', 'AR']);
  toRating('bowlScore', ['BOWL', 'AR']);

  const out = [];
  for (const x of scored) {
    const { p, totals } = x;
    const r = retained.get(norm(p.name));
    const lname = p.name.toLowerCase();
    const marquee = MARQUEE.includes(lname);
    const role = r ? RET_ROLE[r.role] || p.role : p.role;
    const bat = x.batScoreR;
    const bowl = x.bowlScoreR;
    // All-rounder: a blend, rewarded only when genuinely good at both
    const ar = Math.round(Math.min(99, 0.42 * bat + 0.42 * bowl + 0.16 * Math.max(bat, bowl) + (Math.min(bat, bowl) >= 70 ? 4 : 0)));
    const wk = role === 'WK' ? Math.round(Math.min(99, bat + Math.min(3, x.keeping))) : null;
    const ratings = { BAT: bat, BOWL: bowl, AR: ar, WK: wk };

    // Headline rating = rating for the main role, then floors/overrides
    let rating = ratings[role] ?? bat;
    if (r) rating = Math.max(rating, 62 + Math.min(r.winningBid, 21) * 1.5);
    if (marquee) rating = Math.max(rating, 86);
    if (p.seasons[0] === '2021' && !marquee) rating -= 4; // not seen since 2021
    rating = Math.round(Math.min(99, rating));
    if (lname in RATING_OVERRIDE) rating = RATING_OVERRIDE[lname];
    // carry any floor/override lift into the main-role skill rating (and keeper batting)
    const lift = rating - (ratings[role] ?? bat);
    if (lift !== 0) {
      ratings[role] = Math.min(99, Math.max(35, (ratings[role] ?? bat) + lift));
      if (role === 'WK') ratings.BAT = Math.min(99, ratings.BAT + Math.max(0, lift - 2));
      if (role === 'AR') { ratings.BAT = Math.min(99, ratings.BAT + Math.round(lift / 2)); ratings.BOWL = Math.min(99, ratings.BOWL + Math.round(lift / 2)); }
    }
    // Roles a player can be used in
    const roles = [role];
    if (role !== 'BAT' && ratings.BAT >= 60) roles.push('BAT');
    if (role !== 'BOWL' && (role === 'AR' || ratings.BOWL >= 62)) roles.push('BOWL');
    if (role !== 'AR' && ratings.BAT >= 62 && ratings.BOWL >= 62) roles.push('AR');

    let capped = p.overseas || INDIA_CAPPED.has(lname);
    if (r && !p.overseas) capped = r.capped || capped;
    if (lname in CAPPED_OVERRIDE) capped = CAPPED_OVERRIDE[lname];
    out.push({
      id: p.id,
      name: p.name,
      role,
      roles,
      ratings,
      country: p.country,
      cc: p.cc,
      overseas: p.overseas,
      capped,
      age: r?.age ?? null,
      seasons: p.seasons.length,
      ...totals,
      rating,
      _imgs: p.imgs,
    });
  }
  out.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  // Base price by rank (lakhs), like the real auction's price bands
  const BANDS = [[30, 200], [60, 150], [120, 100], [200, 75], [320, 50]];
  out.forEach((p, i) => {
    const band = BANDS.find(([upto]) => i < upto);
    p.base = band ? band[1] : 30;
    if (!p.capped) p.base = Math.min(p.base, i < 100 ? 50 : 30);
    p.marquee = i < 30 && p.capped;
  });

  // 4) Photos
  let ok = 0, fail = 0;
  await pool(out, 12, async (p) => {
    let s = 'fail';
    for (const u of p._imgs) {
      s = await download(u, path.join(PUB, 'players', `${p.id}.webp`));
      if (s !== 'fail') break;
    }
    if (s === 'fail') { fail++; p.photo = null; } else { ok++; p.photo = 'cut'; }
  });
  console.log(`official photos: ${ok} ok, ${fail} missing -> trying Wikipedia`);

  // 4b) Wikipedia fallback for players without an official cut-out.
  // Batched title lookups (50 per request) to stay well inside Wikimedia rate limits.
  let wiki = 0;
  const missing = out.filter((p) => !p.photo);
  for (const p of missing) {
    try { if (!FORCE) { await fs.access(path.join(PUB, 'players', `${p.id}.jpg`)); p.photo = 'wiki'; wiki++; } } catch {}
  }
  for (const variant of [(n) => n, (n) => `${n} (cricketer)`]) {
    const todo = missing.filter((p) => !p.photo);
    for (let i = 0; i < todo.length; i += 50) {
      const batch = todo.slice(i, i + 50);
      const titles = encodeURIComponent(batch.map((p) => variant(p.name)).join('|'));
      let j;
      try {
        j = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&titles=${titles}&redirects=1&prop=pageimages|description&piprop=thumbnail&pithumbsize=480&format=json`, WIKI_UA);
      } catch (e) { console.warn('wikipedia lookup failed:', e.message); continue; }
      const q = j?.query || {};
      const alias = new Map();
      for (const x of [...(q.normalized || []), ...(q.redirects || [])]) alias.set(x.to, alias.get(x.from) || x.from);
      const pages = Object.values(q.pages || {});
      for (const p of batch) {
        const want = variant(p.name);
        const pg = pages.find((pg) => pg.title === want || alias.get(pg.title) === want || alias.get(alias.get(pg.title)) === want);
        if (!pg?.thumbnail || !/cricket/i.test(pg.description || '')) continue;
        await sleep(250);
        if ((await download(pg.thumbnail.source, path.join(PUB, 'players', `${p.id}.jpg`), WIKI_UA)) !== 'fail') { p.photo = 'wiki'; wiki++; }
      }
      await sleep(1500);
    }
  }
  console.log(`wikipedia photos: ${wiki}, still missing: ${out.filter((p) => !p.photo).length}`);
  out.forEach((p) => delete p._imgs);

  // 5) Team logos + backgrounds
  for (const t of TEAMS) {
    await download(`${BASE}/api/team-assets?pathname=static%2Fteams%2F${t.id}%2Ficon-light.svg`, path.join(PUB, 'teams', `${t.code}.svg`));
    await download(`${BASE}/api/team-assets?pathname=static%2Fteams%2F${t.id}%2Fplayer-bg.svg&brand=ipl`, path.join(PUB, 'teams', `${t.code}-bg.svg`));
  }

  await fs.writeFile(path.join(PUB, 'data', 'players.json'), JSON.stringify(out));
  await fs.writeFile(path.join(PUB, 'data', 'teams.json'), JSON.stringify(TEAMS, null, 1));
  await fs.writeFile(path.join(ROOT, 'server', 'players.json'), JSON.stringify(out));
  const by = (k) => out.reduce((m, p) => ((m[p[k]] = (m[p[k]] || 0) + 1), m), {});
  console.log(`wrote ${out.length} players`, by('role'), 'overseas:', out.filter((p) => p.overseas).length, 'base:', by('base'));
}

main().catch((e) => { console.error(e); process.exit(1); });
