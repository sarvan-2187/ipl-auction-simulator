// Text chat inside a room: floating button with unread badge, slide-up panel.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call, memberId } from '../lib/socket';
import type { RoomState } from '../lib/types';
import { TeamLogo, useToast } from './ui';
import { sfx } from '../lib/sound';

const QUICK = ['Too costly!', 'Mine!', 'Bargain', 'Let him go', 'Well bought', 'GG'];

export default function Chat({ room, raised = false, inline = false }: { room: RoomState; raised?: boolean; inline?: boolean }) {
  const toast = useToast();
  const msgs = room.chat || [];
  const [openState, setOpen] = useState(false);
  const open = inline || openState;
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(msgs.length ? msgs[msgs.length - 1].id : '');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastId = msgs.length ? msgs[msgs.length - 1].id : '';

  const unread = useMemo(() => {
    if (open || !lastId) return 0;
    const i = msgs.findIndex((m) => m.id === seen);
    return msgs.slice(i + 1).filter((m) => m.from !== memberId).length;
  }, [msgs, seen, open, lastId]);

  // mark read while open; ping when a friend's message arrives while closed
  const prevLast = useRef(lastId);
  useEffect(() => {
    if (open) setSeen(lastId);
    const newest = msgs[msgs.length - 1];
    if (newest && newest.id !== prevLast.current && newest.from !== memberId && !open) sfx.newLot();
    prevLast.current = lastId;
  }, [lastId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [open, lastId]);
  useEffect(() => { if (open && !inline) setTimeout(() => inputRef.current?.focus(), 150); }, [open, inline]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const send = async (t: string) => {
    const v = t.trim();
    if (!v) return;
    setText('');
    const r = await call('chat', { text: v });
    if (!r.ok) { toast(r.error || 'Message not sent', true); setText(v); }
  };

  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const body = (
    <>
      <div className="chat-list" ref={listRef}>
        {msgs.length === 0 && <div className="chat-empty">No messages yet. Say hi, or trash-talk a bid.</div>}
        {msgs.map((m, i) => {
          const mine = m.from === memberId;
          const prev = msgs[i - 1];
          const grouped = prev && prev.from === m.from && m.t - prev.t < 120000;
          return (
            <div key={m.id} className={`chat-msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
              {!grouped && (
                <div className="chat-meta">
                  {m.team && <TeamLogo code={m.team} size={16} />}
                  <b>{mine ? 'You' : m.name}</b>
                  <span>{time(m.t)}</span>
                </div>
              )}
              <div className="chat-bubble">{m.text}</div>
            </div>
          );
        })}
      </div>
      <div className="chat-quick">
        {QUICK.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={240} placeholder="Message the room" aria-label="Message" enterKeyHint="send"
          onKeyDown={(e) => e.stopPropagation()} />
        <button className="btn btn-gold btn-sm" disabled={!text.trim()}>Send</button>
      </form>
    </>
  );

  if (inline) return <div className="chat-inline">{body}</div>;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div className={`chat-panel ${raised ? 'raised' : ''}`} initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }} role="dialog" aria-label="Room chat">
            <div className="chat-head">
              <div><b>Room chat</b><span>{room.members.filter((m) => !m.bot && m.connected).length} online</span></div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
            </div>
            {body}
          </motion.div>
        )}
      </AnimatePresence>
      {!open && (
        <button className={`chat-fab ${raised ? 'raised' : ''}`} onClick={() => setOpen(true)} aria-label={`Open chat${unread ? `, ${unread} unread` : ''}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
          {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
    </>
  );
}
