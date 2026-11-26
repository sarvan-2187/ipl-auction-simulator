import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Page, PageTabs, usePhone } from '../components/Pager';
import Chat from '../components/Chat';
import HostTransfer from '../components/HostTransfer';
import { allTeams, money, teamPattern } from '../lib/data';
import { call, memberId, leaveRoom } from '../lib/socket';
import type { RoomState, Settings } from '../lib/types';
import { TeamLogo, useToast } from '../components/ui';
import { sfx } from '../lib/sound';

const CPU_HELP: Record<string, string> = {
  easy: 'Computers drop out early and often let you have players cheaply',
  medium: 'Computers bid around fair value',
  hard: 'Computers pay big, fight you for stars and react fast',
};

const PRESETS: { key: string; label: string; sub: string; patch: Partial<Settings> }[] = [
  { key: 'blitz', label: 'Blitz', sub: '~20 min', patch: { pool: 'blitz', minSquad: 11, maxSquad: 15, maxOverseas: 5, bidTime: 7 } },
  { key: 'quick', label: 'Quick', sub: '~45 min', patch: { pool: 'quick', minSquad: 15, maxSquad: 20, maxOverseas: 8, bidTime: 7 } },
  { key: 'standard', label: 'Classic', sub: '~1.5 hr', patch: { pool: 'standard', minSquad: 18, maxSquad: 25, maxOverseas: 8, bidTime: 7 } },
  { key: 'full', label: 'Mega', sub: 'All players', patch: { pool: 'full', minSquad: 18, maxSquad: 25, maxOverseas: 8, bidTime: 7 } },
];

export default function Lobby({ room }: { room: RoomState }) {
  const toast = useToast();
  const isHost = room.hostId === memberId;
  const me = room.members.find((m) => m.id === memberId)!;
  const s = room.settings;
  const owners = room.members.filter((m) => m.team);
  const link = `${location.origin}/room/${room.code}`;

  async function act(ev: string, payload: object = {}) {
    const r = await call(ev, payload);
    if (!r.ok) { toast(r.error || 'Failed', true); sfx.error(); }
    return r.ok;
  }

  async function share() {
    const text = `Join my IPL auction on The Dugout! Room code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'The Dugout', text, url: link });
      else { await navigator.clipboard.writeText(`${text}: ${link}`); toast('Invite link copied'); }
    } catch {}
  }

  const set = (patch: Partial<Settings>) => act('settings', patch);
  const step = (k: keyof Settings, d: number) => set({ [k]: (s[k] as number) + d });
  const phone = usePhone();
  const [page, setPage] = useState<'teams' | 'format' | 'rules' | 'room'>('teams');

  const teamsEl = (
          <div className="team-grid">
            {allTeams().map((t, i) => {
              const owner = room.members.find((m) => m.team === t.code);
              const mine = owner?.id === memberId;
              return (
                <motion.button
                  key={t.code}
                  className={`team-tile ${owner ? 'taken' : ''} ${mine ? 'mine' : ''}`}
                  style={{ ['--c1' as any]: t.primary, ['--pattern' as any]: `url(${teamPattern(t.code)})`, color: '#fff' }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => {
                    sfx.unlock();
                    if (mine) act('leaveTeam');
                    else if (!owner) act('pickTeam', { team: t.code }).then((ok) => ok && sfx.myBid());
                  }}
                  disabled={!!owner && !mine}
                  aria-pressed={mine}
                  aria-label={`${t.name}${owner ? `, taken by ${owner.name}` : ', available'}`}
                >
                  <TeamLogo code={t.code} size={74} />
                  <div className="tname">{t.code}</div>
                  <div className={`owner ellipsis ${owner ? '' : 'open'}`}>
                    {owner ? `${owner.name}${mine ? ' (you)' : ''}` : 'Tap to pick'}
                  </div>
                  {isHost && !owner && (
                    <span
                      className="bot-add"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); act('addBot', { team: t.code }); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); act('addBot', { team: t.code }); } }}
                    >
                      + CPU
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
  );
  const settingsEl = (
          <div className="panel" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="eyebrow">Auction format {isHost ? '' : '· set by host'}</div>
            </div>
            <div className="seg slide set-preset" style={{ marginBottom: 6, ['--n' as any]: PRESETS.length, ['--i' as any]: Math.max(0, PRESETS.findIndex((p) => p.key === s.pool)) }}>
              {PRESETS.map((p) => (
                <button key={p.key} className={s.pool === p.key ? 'on' : ''} onClick={() => isHost && set(p.patch)} disabled={!isHost}>
                  {p.label}<small>{p.sub}</small>
                </button>
              ))}
            </div>
            <div className="setting set-a">
              <label>Purse per team<small>Everyone starts with the same money</small></label>
              {isHost ? <div className="stepper"><button onClick={() => step('purse', -1000)}>−</button><span>{money(s.purse)}</span><button onClick={() => step('purse', 1000)}>+</button></div> : <b>{money(s.purse)}</b>}
            </div>
            <div className="setting set-a">
              <label>Squad size<small>Minimum must be filled, maximum is a hard cap</small></label>
              {isHost ? (
                <div className="row" style={{ gap: 6 }}>
                  <div className="stepper"><button onClick={() => step('minSquad', -1)}>−</button><span>min {s.minSquad}</span><button onClick={() => step('minSquad', 1)}>+</button></div>
                  <div className="stepper"><button onClick={() => step('maxSquad', -1)}>−</button><span>max {s.maxSquad}</span><button onClick={() => step('maxSquad', 1)}>+</button></div>
                </div>
              ) : <b>{s.minSquad}–{s.maxSquad}</b>}
            </div>
            <div className="setting set-a">
              <label>Overseas limit<small>Max overseas players per squad</small></label>
              {isHost ? <div className="stepper"><button onClick={() => step('maxOverseas', -1)}>−</button><span>{s.maxOverseas}</span><button onClick={() => step('maxOverseas', 1)}>+</button></div> : <b>{s.maxOverseas}</b>}
            </div>
            <div className="setting set-b">
              <div className="row rules-head">
                <label>Squad rules<small>{s.roleRules === false ? 'Off: buy any mix of players' : 'Minimum batters, bowlers, all-rounders and keepers per squad'}</small></label>
                {isHost ? (
                  <div className="seg slide" style={{ width: 120, ['--n' as any]: 2, ['--i' as any]: s.roleRules === false ? 1 : 0 }}>
                    <button className={s.roleRules !== false ? 'on' : ''} onClick={() => set({ roleRules: true })}>On</button>
                    <button className={s.roleRules === false ? 'on' : ''} onClick={() => set({ roleRules: false })}>Off</button>
                  </div>
                ) : <b>{s.roleRules === false ? 'Off' : 'On'}</b>}
              </div>
              {s.roleRules !== false && <div className="role-steppers">
                {(['BAT', 'BOWL', 'AR', 'WK'] as const).map((r) => {
                  const rm = s.roleMin || { BAT: 3, BOWL: 4, AR: 2, WK: 2 };
                  return isHost ? (
                    <div className="stepper" key={r}>
                      <button onClick={() => set({ roleMin: { ...rm, [r]: Math.max(0, rm[r] - 1) } })} aria-label={`Fewer ${r}`}>−</button>
                      <span style={{ minWidth: 0, padding: '0 4px' }}>{r} {rm[r]}</span>
                      <button onClick={() => set({ roleMin: { ...rm, [r]: rm[r] + 1 } })} aria-label={`More ${r}`}>+</button>
                    </div>
                  ) : <span className="chip" key={r}>{r} {rm[r]}</span>;
                })}
              </div>}
            </div>
            <div className="setting set-a">
              <label>Computer difficulty<small>{CPU_HELP[s.cpuLevel || 'medium']}</small></label>
              {isHost ? (
                <div className="seg slide" style={{ width: 240, ['--n' as any]: 3, ['--i' as any]: Math.max(0, ['easy', 'medium', 'hard'].indexOf(s.cpuLevel || 'medium')) }}>
                  {(['easy', 'medium', 'hard'] as const).map((lv) => (
                    <button key={lv} className={(s.cpuLevel || 'medium') === lv ? 'on' : ''} onClick={() => set({ cpuLevel: lv })}>{lv[0].toUpperCase() + lv.slice(1)}</button>
                  ))}
                </div>
              ) : <b style={{ textTransform: 'capitalize' }}>{s.cpuLevel || 'medium'}</b>}
            </div>
            <div className="setting set-b">
              <label>Bid clock<small>Seconds on the clock after each bid</small></label>
              {isHost ? <div className="stepper"><button onClick={() => step('bidTime', -1)}>−</button><span>{s.bidTime}s</span><button onClick={() => step('bidTime', 1)}>+</button></div> : <b>{s.bidTime}s</b>}
            </div>
            <div className="setting set-b">
              <label>Accelerated round<small>Unsold players come back once at the end</small></label>
              {isHost ? (
                <div className="seg slide" style={{ width: 140, ['--n' as any]: 2, ['--i' as any]: s.unsoldRound ? 0 : 1 }}>
                  <button className={s.unsoldRound ? 'on' : ''} onClick={() => set({ unsoldRound: true })}>On</button>
                  <button className={!s.unsoldRound ? 'on' : ''} onClick={() => set({ unsoldRound: false })}>Off</button>
                </div>
              ) : <b>{s.unsoldRound ? 'On' : 'Off'}</b>}
            </div>
            <div className="setting set-b">
              <label>Trading window<small>After the auction, owners can swap players and cash before locking their XI</small></label>
              {isHost ? (
                <div className="seg slide" style={{ width: 140, ['--n' as any]: 2, ['--i' as any]: s.trading !== false ? 0 : 1 }}>
                  <button className={s.trading !== false ? 'on' : ''} onClick={() => set({ trading: true })}>On</button>
                  <button className={s.trading === false ? 'on' : ''} onClick={() => set({ trading: false })}>Off</button>
                </div>
              ) : <b>{s.trading !== false ? 'On' : 'Off'}</b>}
            </div>
          </div>
  );
  const membersEl = (
          <div className="panel" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="eyebrow">In the room · {room.members.length}</div>
              <div className="row" style={{ gap: 8 }}><HostTransfer room={room} compact /><div className="eyebrow gold">{owners.length} teams</div></div>
            </div>
            <div style={{ marginTop: 8 }}>
              {[['Players', room.members.filter((m) => m.team)], [`Spectators · ${room.members.filter((m) => !m.bot && !m.team).length}/10`, room.members.filter((m) => !m.team && !m.bot)]].map(([label, list]) => (
                (list as typeof room.members).length > 0 && (
                <div key={label as string}>
                  <div className="eyebrow member-group">{label as string}</div>
                  {(list as typeof room.members).map((m) => (
                    <div className="member" key={m.id}>
                      <div className="avatar">{m.team ? <TeamLogo code={m.team} size={26} /> : m.name[0]?.toUpperCase()}</div>
                      <div className="grow">
                        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16 }} className="ellipsis">
                          {m.name}{m.id === memberId ? ' (you)' : ''}
                        </div>
                        <div className="dim" style={{ fontSize: 12 }}>{m.id === room.hostId ? 'Host · ' : ''}{m.bot ? 'Computer player · ' : ''}{m.team ? `Bidding as ${m.team}` : 'Watching and reacting'}</div>
                      </div>
                      <span className={`dot ${m.connected ? '' : 'off'}`} title={m.connected ? 'Online' : 'Offline'} />
                      {isHost && m.id !== memberId && !m.bot && m.connected && m.team && (
                        <button className="btn btn-sm make-host" onClick={() => { if (confirm(`Make ${m.name} the host? You'll lose the host controls.`)) act('transferHost', { to: m.id }); }} title={`Make ${m.name} the host`}>Make host</button>
                      )}
                      {isHost && m.id !== memberId && (
                        <button className="icon-btn" style={{ width: 30, height: 30, fontSize: 14 }} onClick={() => act('removeMember', { id: m.id })} aria-label={`Remove ${m.name}`}>✕</button>
                      )}
                    </div>
                  ))}
                </div>)
              ))}
            </div>
          </div>
  );
  const startEl = (
          <div className="panel" style={{ padding: 18 }}>
            {isHost ? (
              <>
                <button className="btn btn-gold" style={{ width: '100%', height: 64, fontSize: 22 }} disabled={owners.length < 2} onClick={() => { sfx.unlock(); act('start'); }}>
                  Start auction
                </button>
                <p className="dim" style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>
                  {owners.length < 2
                    ? 'Need at least 2 teams. Invite friends, or tap “+ CPU” on a franchise to add a computer player (Computer A, B…).'
                    : `${owners.length} teams ready. Unclaimed franchises won't take part. Add computer players to make it spicier.`}
                </p>
              </>
            ) : (
              <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: 8 }}>
                <div className="display" style={{ fontSize: 28 }}>{me.team ? `You're ${me.team}` : 'Pick a team'}</div>
                <div className="dim" style={{ fontSize: 14 }}>Waiting for the host to start the auction…</div>
              </div>
            )}
          </div>
  );
  const howEl = (
          <div className="panel" style={{ padding: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>How it works</div>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
              <li>Players come up in sets: marquee first, then by role.</li>
              <li>Hit <b>BID</b> (or Space) to raise. The clock resets on every bid.</li>
              <li>Clock hits zero → <b className="gold">SOLD</b> to the highest bidder.</li>
              <li>Keep enough purse to fill your minimum squad. Mind the overseas cap.</li>
            </ol>
          </div>
  );
  const topbarEl = (
      <div className="topbar">
        <button className="icon-btn" onClick={leaveRoom} aria-label="Leave room" title="Leave room">←</button>
        <div className="grow">
          <div className="eyebrow">Auction lobby</div>
          <div className="display" style={{ fontSize: 34 }}>Pick your franchise</div>
        </div>
        <div className="panel room-code">
          <div>
            <div className="eyebrow" style={{ fontSize: 10 }}>Room code</div>
            <div className="code">{room.code}</div>
          </div>
          <button className="btn btn-sm btn-gold" onClick={share}>Invite</button>
        </div>
      </div>
  );

  if (phone) {
    const people = room.members.filter((m) => !m.bot).length;
    return (
      <div className="shell paged lobby-paged">
        {topbarEl}
        <PageTabs id="lobby" page={page} setPage={setPage} tabs={[
          { key: 'teams', label: 'Teams', badge: owners.length ? `${owners.length}/10` : null },
          { key: 'format', label: 'Format' },
          { key: 'rules', label: 'Rules' },
          { key: 'room', label: 'Room', badge: people },
        ]} />
        <div className="pages">
          <AnimatePresence mode="wait" initial={false}>
            {page === 'teams' && <Page k="teams">{teamsEl}</Page>}
            {page === 'format' && <Page k="format" className="pg-format">{settingsEl}</Page>}
            {page === 'rules' && <Page k="rules" className="pg-rules">{settingsEl}</Page>}
            {page === 'room' && <Page k="room">{membersEl}</Page>}
          </AnimatePresence>
        </div>
        <div className="page-foot">{startEl}</div>
        <Chat room={room} />
      </div>
    );
  }

  return (
    <div className="shell">
      {topbarEl}
      <div className="lobby-grid">
        <div className="col" style={{ gap: 18 }}>
          {teamsEl}
          {settingsEl}
        </div>
        <div className="col" style={{ gap: 18 }}>
          {membersEl}
          {startEl}
          {howEl}
        </div>
      </div>
      <Chat room={room} />
    </div>
  );
}
