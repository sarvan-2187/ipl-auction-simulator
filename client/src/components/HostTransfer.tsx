// Host hands over control to another person in the room.
import { confirmDialog } from './ConfirmDialog';
import { useEffect, useRef, useState } from 'react';
import { call, memberId } from '../lib/socket';
import type { RoomState } from '../lib/types';
import { TeamLogo, useToast } from './ui';

export default function HostTransfer({ room, compact = false }: { room: RoomState; compact?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const people = room.members.filter((m) => !m.bot && m.id !== memberId);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  if (room.hostId !== memberId || !people.length) return null;
  const give = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: `Make ${name} the host?`, body: "You'll lose the host controls.", ok: 'Make host' }))) return;
    const r = await call('transferHost', { to: id });
    setOpen(false);
    toast(r.ok ? `${name} is now the host` : r.error || 'Could not transfer', !r.ok);
  };
  return (
    <div className="ht" ref={ref}>
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{compact ? 'Host' : 'Transfer host'}</button>
      {open && (
        <div className="ht-menu" role="menu">
          <div className="ht-title">Hand host controls to</div>
          {people.map((m) => (
            <button key={m.id} role="menuitem" disabled={!m.connected} onClick={() => give(m.id, m.name)}>
              <span className="ht-ic">{m.team ? <TeamLogo code={m.team} size={22} /> : m.name[0]?.toUpperCase()}</span>
              <span className="grow ellipsis">{m.name}</span>
              <small>{!m.connected ? 'Offline' : m.team ? m.team : 'Spectator'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
