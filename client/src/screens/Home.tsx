import { useState } from 'react';
import { motion } from 'framer-motion';
import { allPlayers, allTeams } from '../lib/data';
import { createRoom, joinRoom, getName, setName } from '../lib/socket';
import { GavelIcon, TeamLogo, useToast } from '../components/ui';
import { sfx } from '../lib/sound';

export default function Home({ initialCode }: { initialCode: string | null }) {
  const [tab, setTab] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [name, setNameState] = useState(getName());
  const [code, setCode] = useState(initialCode || '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const players = allPlayers();

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
    <div className="home">
      <div className="home-inner">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="brand-mark">
            <div className="gavel"><GavelIcon size={28} /></div>
            <div className="eyebrow">Private Friends League · Season 2027</div>
          </div>
          <h1 className="hero-title display">
            The IPL<br /><span className="gold-grad">Auction Room</span>
          </h1>
          <p className="hero-sub">
            Grab a franchise, bring your mates, and fight over every star in a live, real-time auction. Purse, overseas caps and the hammer, all for real.
          </p>
          <div className="stat-strip">
            <div><b>{players.length}</b><span>Players</span></div>
            <div><b>10</b><span>Franchises</span></div>
            <div><b>Live</b><span>Multiplayer</span></div>
          </div>
          <div className="logo-wall">
            {allTeams().map((t, i) => (
              <motion.div key={t.code} className="tile" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.04 }} title={t.name}>
                <TeamLogo code={t.code} size={56} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.form className="panel home-card" onSubmit={go} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Create room</button>
            <button type="button" role="tab" aria-selected={tab === 'join'} className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>Join room</button>
          </div>
          <div className="col" style={{ gap: 14 }}>
            <label className="col" style={{ gap: 6 }}>
              <span className="eyebrow">Your name</span>
              <input className="input" value={name} maxLength={18} onChange={(e) => setNameState(e.target.value)} placeholder="e.g. Sarvan" autoFocus={!name} />
            </label>
            {tab === 'join' && (
              <label className="col" style={{ gap: 6 }}>
                <span className="eyebrow">Room code</span>
                <input className="input code-input" value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="•••••" autoFocus={!!name} inputMode="text" autoCapitalize="characters" />
              </label>
            )}
            <button className="btn btn-gold" style={{ height: 58, fontSize: 20, marginTop: 6 }} disabled={busy}>
              {busy ? 'Connecting…' : tab === 'create' ? 'Create auction room' : 'Enter auction room'}
            </button>
            <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              {tab === 'create'
                ? 'You become the host. Share the room code with friends, everyone picks a franchise, and you start the hammer.'
                : 'Ask the host for the 5-letter code, or open the invite link they shared.'}
            </p>
          </div>
        </motion.form>
      </div>
      <footer className="site-foot">
        <div className="disclaimer">
          <div className="d-col">
            <b>Fan-made, just for fun</b>
            <p>A private, non-commercial auction game for friends. Not affiliated with, endorsed or sponsored by the Indian Premier League, the BCCI or any franchise.</p>
          </div>
          <div className="d-col">
            <b>Names, logos and photos</b>
            <p>Team names, logos and player photos are the property of their respective owners and are used here for identification only.</p>
          </div>
          <div className="d-col">
            <b>Ratings and prices</b>
            <p>Player ratings and base prices are estimates built from public IPL stats. They are not official valuations.</p>
          </div>
          <div className="d-col">
            <b>No real money</b>
            <p>All purses and bids are virtual. There is no betting, payment or prize of any kind.</p>
          </div>
        </div>
        <div className="credits">
          Type: <b>Geist</b> by <a href="https://vercel.com/font" target="_blank" rel="noreferrer">Vercel</a> · <b>NType 82</b> serif by <a href="https://nothing.tech" target="_blank" rel="noreferrer">Nothing</a> · Flags by flag-icons
        </div>
      </footer>
    </div>
  );
}
