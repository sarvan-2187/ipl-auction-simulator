import { useEffect, useState } from 'react';
import { loadData } from './lib/data';
import { useRoom, useConnected, joinRoom, getName } from './lib/socket';
import { ToastProvider } from './components/ui';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Auction from './screens/Auction';
import Results from './screens/Results';
import { getTeam } from './lib/data';
import { memberId } from './lib/socket';

function codeFromPath() {
  const m = location.pathname.match(/^\/room\/([A-Za-z0-9]{4,6})/);
  return m ? m[1].toUpperCase() : null;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(codeFromPath());
  const room = useRoom();
  const connected = useConnected();

  useEffect(() => { loadData().then(() => setReady(true)); }, []);

  // Auto-rejoin when opening /room/CODE and a name is already known (refresh / shared link)
  // Once we're in a room (however we got there), the invite-link code is used up
  useEffect(() => { if (room) setPendingCode(null); }, [room?.code]);

  useEffect(() => {
    if (!ready || !pendingCode || room) return;
    const name = getName();
    if (!name) return;
    const code = pendingCode;
    setPendingCode(null); // join a link once; never auto-rejoin after leaving
    joinRoom(code, name);
  }, [ready, pendingCode, room]);

  useEffect(() => {
    if (room && location.pathname !== `/room/${room.code}`) history.replaceState(null, '', `/room/${room.code}`);
  }, [room?.code]);

  useEffect(() => { window.scrollTo(0, 0); }, [room?.phase]);

  const me = room?.members.find((m) => m.id === memberId);
  const myTeam = getTeam(me?.team);
  useEffect(() => {
    document.documentElement.style.setProperty('--team', myTeam?.primary || '#9a9a9a');
    document.documentElement.style.setProperty('--team-2', myTeam?.secondary || '#f5c04a');
    document.documentElement.style.setProperty('--tt', myTeam?.text || '#fff');
  }, [myTeam]);

  return (
    <ToastProvider>
      <div className="stage-bg" />
      <div className="grain" />
      {!connected && <div className="conn-banner">Reconnecting to the auction server…</div>}
      {!ready ? (
        <div className="home"><div className="eyebrow">Loading auction room…</div></div>
      ) : !room ? (
        <Home initialCode={pendingCode} />
      ) : room.phase === 'lobby' ? (
        <Lobby room={room} />
      ) : room.phase === 'auction' ? (
        <Auction room={room} />
      ) : (
        <Results room={room} />
      )}
    </ToastProvider>
  );
}
