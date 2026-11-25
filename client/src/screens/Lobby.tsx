import { motion } from 'framer-motion';
import { allTeams, money, teamPattern } from '../lib/data';
import { call, memberId, leaveRoom } from '../lib/socket';
import type { RoomState, Settings } from '../lib/types';
import { TeamLogo, useToast, GavelIcon } from '../components/ui';
import { sfx } from '../lib/sound';

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
    const text = `Join my IPL auction! Room code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'IPL Auction Room', text, url: link });
      else { await navigator.clipboard.writeText(`${text}: ${link}`); toast('Invite link copied'); }
    } catch {}
  }

  const set = (patch: Partial<Settings>) => act('settings', patch);
  const step = (k: keyof Settings, d: number) => set({ [k]: (s[k] as number) + d });

  return (
    <div className="shell">
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

      <div className="lobby-grid">
        <div className="col" style={{ gap: 18 }}>
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

          <div className="panel" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="eyebrow">Auction format {isHost ? '' : '· set by host'}</div>
            </div>
            <div className="seg" style={{ marginBottom: 6 }}>
              {PRESETS.map((p) => (
                <button key={p.key} className={s.pool === p.key ? 'on' : ''} onClick={() => isHost && set(p.patch)} disabled={!isHost}>
                  {p.label}<small>{p.sub}</small>
                </button>
              ))}
            </div>
            <div className="setting">
              <label>Purse per team<small>Everyone starts with the same money</small></label>
              {isHost ? <div className="stepper"><button onClick={() => step('purse', -1000)}>−</button><span>{money(s.purse)}</span><button onClick={() => step('purse', 1000)}>+</button></div> : <b>{money(s.purse)}</b>}
            </div>
            <div className="setting">
              <label>Squad size<small>Minimum must be filled, maximum is a hard cap</small></label>
              {isHost ? (
                <div className="row" style={{ gap: 6 }}>
                  <div className="stepper"><button onClick={() => step('minSquad', -1)}>−</button><span>min {s.minSquad}</span><button onClick={() => step('minSquad', 1)}>+</button></div>
                  <div className="stepper"><button onClick={() => step('maxSquad', -1)}>−</button><span>max {s.maxSquad}</span><button onClick={() => step('maxSquad', 1)}>+</button></div>
                </div>
              ) : <b>{s.minSquad}–{s.maxSquad}</b>}
            </div>
            <div className="setting">
              <label>Overseas limit<small>Max overseas players per squad</small></label>
              {isHost ? <div className="stepper"><button onClick={() => step('maxOverseas', -1)}>−</button><span>{s.maxOverseas}</span><button onClick={() => step('maxOverseas', 1)}>+</button></div> : <b>{s.maxOverseas}</b>}
            </div>
            <div className="setting">
              <label>Squad rules<small>Minimum batters, bowlers, all-rounders and keepers per squad</small></label>
              <div className="role-steppers">
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
              </div>
            </div>
            <div className="setting">
              <label>Bid clock<small>Seconds on the clock after each bid</small></label>
              {isHost ? <div className="stepper"><button onClick={() => step('bidTime', -1)}>−</button><span>{s.bidTime}s</span><button onClick={() => step('bidTime', 1)}>+</button></div> : <b>{s.bidTime}s</b>}
            </div>
            <div className="setting">
              <label>Accelerated round<small>Unsold players come back once at the end</small></label>
              {isHost ? (
                <div className="seg" style={{ width: 140 }}>
                  <button className={s.unsoldRound ? 'on' : ''} onClick={() => set({ unsoldRound: true })}>On</button>
                  <button className={!s.unsoldRound ? 'on' : ''} onClick={() => set({ unsoldRound: false })}>Off</button>
                </div>
              ) : <b>{s.unsoldRound ? 'On' : 'Off'}</b>}
            </div>
          </div>
        </div>

        <div className="col" style={{ gap: 18 }}>
          <div className="panel" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="eyebrow">In the room · {room.members.length}</div>
              <div className="eyebrow gold">{owners.length} teams</div>
            </div>
            <div style={{ marginTop: 8 }}>
              {room.members.map((m) => (
                <div className="member" key={m.id}>
                  <div className="avatar">{m.team ? <TeamLogo code={m.team} size={26} /> : m.name[0]?.toUpperCase()}</div>
                  <div className="grow">
                    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16 }} className="ellipsis">
                      {m.name}{m.id === memberId ? ' (you)' : ''}
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>{m.id === room.hostId ? 'Host · ' : ''}{m.bot ? 'Computer player · ' : ''}{m.team ? `Bidding as ${m.team}` : 'Spectating'}</div>
                  </div>
                  <span className={`dot ${m.connected ? '' : 'off'}`} title={m.connected ? 'Online' : 'Offline'} />
                  {isHost && m.id !== memberId && (
                    <button className="icon-btn" style={{ width: 30, height: 30, fontSize: 14 }} onClick={() => act('removeMember', { id: m.id })} aria-label={`Remove ${m.name}`}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ padding: 18 }}>
            {isHost ? (
              <>
                <button className="btn btn-gold" style={{ width: '100%', height: 64, fontSize: 22 }} disabled={owners.length < 2} onClick={() => { sfx.unlock(); act('start'); }}>
                  <GavelIcon size={26} /> Start auction
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

          <div className="panel" style={{ padding: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>How it works</div>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
              <li>Players come up in sets: marquee first, then by role.</li>
              <li>Hit <b>BID</b> (or Space) to raise. The clock resets on every bid.</li>
              <li>Clock hits zero → <b className="gold">SOLD</b> to the highest bidder.</li>
              <li>Keep enough purse to fill your minimum squad. Mind the overseas cap.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
