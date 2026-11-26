import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import { allPlayers, allTeams, increment, money, playerPhoto, ROLE_LABEL, teamPattern } from '../lib/data';
import { createRoom, joinRoom, getName, setName } from '../lib/socket';
import { GavelIcon, TeamLogo, useToast } from '../components/ui';
import { sfx } from '../lib/sound';
import type { Lot, Player } from '../lib/types';
import SoldCeremony from '../components/SoldCeremony';
import InstallButton from '../components/InstallButton';

export default function Home({ initialCode }: { initialCode: string | null }) {
  const players = allPlayers();
  const elite = useMemo(() => players.filter((p) => p.rating >= 90).length, [players]);
  const formRef = useRef<HTMLFormElement>(null);
  const toTop = () => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); formRef.current?.querySelector('input')?.focus({ preventScroll: true }); };

  return (
    <div className="landing">
      {/* ---------- hero: everything needed to start fits the first screen ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <motion.div className="brand-mark" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <motion.div className="gavel" animate={{ rotate: [0, -24, 0] }} transition={{ duration: 0.5, delay: 0.9, repeat: Infinity, repeatDelay: 5 }}>
              <GavelIcon size={26} />
            </motion.div>
            <div className="eyebrow">Live IPL auctions with your friends · Season 2027</div>
          </motion.div>
          <h1 className="hero-title hero-serif" aria-label="The Dugout">
            <Reveal text="The" delay={0.1} />
            <br />
            <span className="gold-grad"><Reveal text="Dugout" delay={0.3} /></span>
          </h1>
          <motion.p className="hero-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            Pick a franchise, bring your friends and fight over every star in a live auction. Real purses, overseas caps, squad rules and the hammer.
          </motion.p>
          <EntryForm initialCode={initialCode} formRef={formRef} />
        </div>
        <motion.div className="lp-hero-demo" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }}>
          <AuctionDemo />
        </motion.div>
        <motion.button className="lp-scroll" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} aria-label="See how it works">
          <span>How it works</span>
          <motion.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" animate={{ y: [0, 4, 0] }} transition={{ duration: 1.4, repeat: Infinity }}><path d="M6 9l6 6 6-6" /></motion.svg>
        </motion.button>
      </section>

      {/* ---------- franchises ---------- */}
      <section className="lp-band" aria-label="Franchises">
        <Marquee speed={38}>
          {allTeams().map((t) => (
            <div key={t.code} className="lp-team" style={{ ['--c1' as any]: t.primary }}>
              <TeamLogo code={t.code} size={44} />
              <div><b>{t.code}</b><small>{t.city}</small></div>
            </div>
          ))}
        </Marquee>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="lp-sec" id="how">
        <SectionHead eyebrow="How it works" title="From group chat to auction table in a minute" />
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <InView key={s.t} className="lp-step panel" delay={i * 0.08}>
              <div className="lp-step-n">{String(i + 1).padStart(2, '0')}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </InView>
          ))}
        </div>
      </section>

      {/* ---------- on phones the live demo sits here instead of beside the form ---------- */}
      <section className="lp-sec lp-demo-sec">
        <SectionHead eyebrow="Feel the room" title="Every bid resets the clock" />
        <AuctionDemo />
      </section>

      {/* ---------- stats ---------- */}
      <section className="lp-sec">
        <div className="lp-stats">
          <Stat n={players.length} label="Players in the pool" />
          <Stat n={elite} label="Rated 90 and above" />
          <Stat n={10} label="Franchises" />
          <Stat n={7} label="Seconds on the bid clock" suffix="s" />
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section className="lp-sec">
        <SectionHead eyebrow="Everything in the box" title="Built like a real auction, played like a game" />
        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <InView key={f.t} className="lp-feature panel" delay={(i % 4) * 0.06}>
              <div className="lp-icon">{f.icon}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </InView>
          ))}
        </div>
      </section>

      {/* ---------- faces ---------- */}
      <section className="lp-sec lp-faces-sec" aria-label="Some of the players">
        <SectionHead eyebrow={`${players.length} players`} title="Your squad is waiting" />
        <FaceWall players={players} />
      </section>

      {/* ---------- call to action ---------- */}
      <section className="lp-sec">
        <InView className="lp-cta panel">
          <div>
            <h2 className="display">Ready for the hammer?</h2>
            <p>Free, no sign-up, works on any phone or laptop. Make a room and share the code.</p>
          </div>
          <div className="lp-cta-btns"><button className="btn btn-gold" onClick={toTop}>Start an auction</button><InstallButton iconOnly /></div>
        </InView>
      </section>

      <footer className="site-foot">
        <div className="disclaimer">
          {DISCLAIMERS.map((d) => (
            <div key={d.t} className="d-card">
              <span className="d-icon" aria-hidden="true">{d.icon}</span>
              <b>{d.t}</b>
              <p>{d.d}</p>
            </div>
          ))}
        </div>
        <div className="credits">
          Type: <b>Geist</b> by <a href="https://vercel.com/font" target="_blank" rel="noreferrer">Vercel</a> · <b>NType 82</b> serif by <a href="https://nothing.tech" target="_blank" rel="noreferrer">Nothing</a> · Flags by flag-icons · Emoji by Microsoft Fluent
        </div>
      </footer>
    </div>
  );
}

// ---------- create / join ----------
function EntryForm({ initialCode, formRef }: { initialCode: string | null; formRef: React.RefObject<HTMLFormElement> }) {
  const [tab, setTab] = useState<'create' | 'join'>(initialCode || new URLSearchParams(location.search).get('action') === 'join' ? 'join' : 'create');
  const [name, setNameState] = useState(getName());
  const [code, setCode] = useState(initialCode || '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function go(e: React.FormEvent) {
    e.preventDefault();
    sfx.unlock();
    const n = name.trim();
    if (!n) return toast('Enter your name first', true);
    if (tab === 'join' && code.trim().length < 5) return toast('Enter the 5-letter room code', true);
    setName(n);
    setBusy(true);
    const r = tab === 'create' ? await createRoom(n) : await joinRoom(code.trim(), n);
    setBusy(false);
    if (!r.ok) toast(r.error || 'Could not connect', true);
  }

  return (
    <motion.form ref={formRef} className="panel home-card" onSubmit={go} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.45 }}>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Create room</button>
        <button type="button" role="tab" aria-selected={tab === 'join'} className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>Join room</button>
      </div>
      <div className="home-fields">
        <label className="col" style={{ gap: 6 }}>
          <span className="eyebrow">Your name</span>
          <input className="input" value={name} maxLength={18} onChange={(e) => setNameState(e.target.value)} placeholder="e.g. Hardik Pandya" autoComplete="nickname" />
        </label>
        {tab === 'join' && (
          <label className="col" style={{ gap: 6 }}>
            <span className="eyebrow">Room code</span>
            <input className="input code-input" value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="•••••" inputMode="text" autoCapitalize="characters" autoComplete="off" />
          </label>
        )}
      </div>
      <div className="go-row">
        <button className="btn btn-gold home-go" disabled={busy}>
        {busy ? 'Connecting…' : tab === 'create' ? 'Create auction room' : 'Enter auction room'}
      </button>
        <InstallButton iconOnly />
      </div>
      <p className="home-note">
        {tab === 'create' ? 'You become the host and share the code. Everyone picks a franchise, then you start the hammer.' : 'Ask the host for the 5-letter code, or open the invite link they shared.'}
      </p>
    </motion.form>
  );
}

// ---------- looping mini auction ----------
type DemoBid = { team: string; amount: number };
function AuctionDemo() {
  const stars = useMemo(() => allPlayers().filter((p) => p.photo === 'cut' && p.rating >= 92).sort((a, b) => b.rating - a.rating).slice(0, 12), []);
  const teams = useMemo(() => allTeams(), []);
  const [i, setI] = useState(0);
  const [bids, setBids] = useState<DemoBid[]>([]);
  const [phase, setPhase] = useState<'live' | 'sold'>('live');
  const [clock, setClock] = useState(7);
  const p = stars[i % stars.length];
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!p) return;
    let alive = true;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms));
    // three bidders, a final price somewhere between 4x and 9x base
    const pool = [...teams].sort(() => Math.random() - 0.5).slice(0, 3).map((t) => t.code);
    const target = Math.min(2500, p.base * (4 + Math.random() * 5));
    const seq: DemoBid[] = [];
    let amt = p.base;
    // about 6 bids, 1.5 s apart, so you can follow each paddle
    for (let k = 0; amt <= target && k < 6; k++) { seq.push({ team: pool[k % pool.length], amount: amt }); amt += increment(amt) * (k > 2 ? 3 : 2); }
    setBids([]); setPhase('live'); setClock(7);
    const step = 1500;
    seq.forEach((b, k) => { at(500 + k * step, () => { setBids((x) => [...x, b]); setClock(7); }); at(500 + k * step + 1000, () => setClock(6)); });
    const end = 500 + seq.length * step;
    // last bid stands: the clock runs down 5..1, then the hammer
    [5, 4, 3, 2, 1].forEach((c, k) => at(end + k * 450, () => setClock(c)));
    at(end + 5 * 450, () => setPhase('sold'));
    at(end + 5 * 450 + 3400, () => setI((x) => x + 1));
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [i, p, teams, reduce]);

  if (!p) return null;
  const top = bids[bids.length - 1];
  const leader = top ? teams.find((t) => t.code === top.team) : null;
  return (
    <div className="demo" style={{ ['--c1' as any]: leader?.primary || '#1b1b1b' }} aria-label="Sample auction" role="img">
      <div className="demo-top">
        <span className="chip chip-gold">Marquee</span>
        <span className="demo-live"><i />Live</span>
      </div>
      {/* franchise artwork of whoever leads, crossfading as the lead changes (same as the real auction card) */}
      <div className="demo-art" aria-hidden="true">
        <AnimatePresence>
          {leader ? (
            <motion.img key={leader.code} className="demo-pattern" src={teamPattern(leader.code)} alt="" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 0.55, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} />
          ) : (
            <motion.div key="neutral" className="demo-pattern neutral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          )}
        </AnimatePresence>
        <div className="demo-glow" />
        {leader && <motion.img key={`l-${leader.code}`} className="demo-lead-logo" src={`/teams/${leader.code}.svg`} alt="" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }} />}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={p.id} className="demo-player" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ type: 'spring', stiffness: 170, damping: 22 }}>
          <img src={playerPhoto(p)!} alt="" />
          <div className="demo-name">
            <div className="pn">{p.name}</div>
            <small>{ROLE_LABEL[p.role]} · RTG {p.rating}</small>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="demo-bid">
        <div>
          <span className="eyebrow">{top ? 'Current bid' : 'Base price'}</span>
          <AnimatePresence mode="popLayout">
            <motion.b key={top?.amount ?? 'base'} className="money" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.18 }}>
              {money(top?.amount ?? p.base)}
            </motion.b>
          </AnimatePresence>
          <span className="demo-leader">{leader ? <><TeamLogo code={leader.code} size={20} /> {leader.code} leads</> : 'Waiting for the first paddle'}</span>
        </div>
        <div className={`demo-clock ${clock <= 3 ? 'hot' : ''}`}>{clock}</div>
      </div>
      <div className="demo-feed">
        {bids.slice(-3).reverse().map((b, k) => (
          <motion.div key={`${b.team}-${b.amount}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1 - k * 0.3, x: 0 }} className="demo-row">
            <TeamLogo code={b.team} size={18} /><span>{b.team}</span><b className="money">{money(b.amount)}</b>
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {phase === 'sold' && leader && top && (
          <SoldCeremony
            key={`sold-${p.id}-${i}`}
            quiet
            lot={{ id: p.id, set: 'Marquee', base: p.base, bid: top.amount, leader: leader.code, endsAt: 0, history: [], bidCount: bids.length, status: 'sold', passed: [], n: (i % 99) + 1, next: null, remaining: 0 } as Lot}
            player={p}
            mine={false}
            roomCode="DEMO"
            tags={{ record: false, steal: false, war: bids.length >= 8 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- small pieces ----------
function Reveal({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className="reveal" aria-hidden="true">
      {text.split('').map((ch, k) => (
        <motion.span key={k} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: delay + k * 0.045, type: 'spring', stiffness: 260, damping: 22 }}>{ch}</motion.span>
      ))}
    </span>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <InView className="lp-head">
      <div className="eyebrow gold">{eyebrow}</div>
      <h2 className="display">{title}</h2>
    </InView>
  );
}

function InView({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.55, delay, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

function Marquee({ children, speed = 40, reverse = false }: { children: ReactNode; speed?: number; reverse?: boolean }) {
  return (
    <div className="marquee" style={{ ['--speed' as any]: `${speed}s` }}>
      <div className={`marquee-track ${reverse ? 'rev' : ''}`}>
        <div className="marquee-set">{children}</div>
        <div className="marquee-set" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

function Stat({ n, label, suffix = '' }: { n: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-40px' });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const c = animate(0, n, { duration: 1.4, ease: 'easeOut', onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [seen, n]);
  return (
    <div ref={ref} className="lp-stat">
      <b className="display">{v}{suffix}</b>
      <span>{label}</span>
    </div>
  );
}

function FaceWall({ players }: { players: Player[] }) {
  const withPhoto = useMemo(() => players.filter((p) => p.photo === 'cut').sort((a, b) => b.rating - a.rating).slice(0, 48), [players]);
  const rows = [withPhoto.slice(0, 24), withPhoto.slice(24, 48)];
  return (
    <div className="lp-faces">
      {rows.map((row, r) => (
        <Marquee key={r} speed={r ? 70 : 60} reverse={r === 1}>
          {row.map((p) => (
            <div key={p.id} className="lp-face">
              <img src={playerPhoto(p)!} alt="" loading="lazy" />
              <span className="pn">{p.name.split(' ').slice(-1)[0]}</span>
              <b>{p.rating}</b>
            </div>
          ))}
        </Marquee>
      ))}
    </div>
  );
}

// ---------- copy ----------
const STEPS = [
  { t: 'Make a room', d: 'Enter your name and create a room. You are the host.' },
  { t: 'Share the code', d: 'Friends join with the 5-letter code or your invite link. Spectators welcome.' },
  { t: 'Pick franchises', d: 'Everyone takes a team. Fill empty seats with computer players on easy, medium or hard.' },
  { t: 'Bid, build, brag', d: 'Fight for every player, set your Playing XI, trade, and share your squad card.' },
];

const ic = (d: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const FEATURES = [
  { t: 'Live bidding', d: 'A 7-second clock that resets on every bid, jump bids and a SOLD ceremony with gavel and stamp.', icon: <GavelIcon size={22} /> },
  { t: 'Computer rivals', d: 'Fill empty franchises with computers that bid on easy, medium or hard. When you are done, they finish in seconds.', icon: ic('M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2zM9 9h6v6H9z') },
  { t: 'Real squad rules', d: 'Purse, overseas cap and minimum keepers, bowlers and all-rounders, explained before you overbid.', icon: ic('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4') },
  { t: 'Playing XI', d: 'Place your eleven on the ground, choose roles, and get a live XI rating with auto-pick and tips.', icon: ic('M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M3 12h18') },
  { t: 'Trading window', d: 'After the hammer, swap players and cash with friends or computers before locking your XI.', icon: ic('M7 7h11l-3-3M17 17H6l3 3') },
  { t: 'Spectators', d: 'Up to 10 friends can watch and throw emoji reactions, rate-limited so nobody floods the stage.', icon: ic('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z') },
  { t: 'Room chat', d: 'Banter in the room while the bidding is on, with quick replies built in.', icon: ic('M4 5h16v11H8l-4 4V5z') },
  { t: 'Share cards', d: 'Export your XI or full squad as an image for WhatsApp and Instagram.', icon: ic('M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5') },
];

const DISCLAIMERS = [
  { t: 'Fan-made', d: 'Not affiliated with the IPL, the BCCI or any franchise.', icon: ic('M12 21s-7-4.4-9.3-9A5.3 5.3 0 0112 6.2 5.3 5.3 0 0121.3 12C19 16.6 12 21 12 21z') },
  { t: 'Logos & photos', d: 'Belong to their owners. Used only to identify teams and players.', icon: ic('M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01') },
  { t: 'Ratings', d: 'Estimates from public IPL stats, not official values.', icon: ic('M4 20V10M10 20V4M16 20v-7M22 20H2') },
  { t: 'No real money', d: 'Virtual purses only. No betting, payments or prizes.', icon: ic('M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6') },
];
