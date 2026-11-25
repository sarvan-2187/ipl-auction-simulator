// Small inline icons + self-hosted SVG flags (flag-icons, MIT; custom West Indies flag).
import { useState } from 'react';

export function Flag({ cc, title }: { cc: string; title?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok || !cc) return null;
  return <img src={`/flags/${cc}.svg`} alt="" title={title} className="flag" onError={() => setOk(false)} draggable={false} />;
}

export function PlaneIcon({ size = 12 }: { size?: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" aria-label="Overseas" role="img">
      <path fill="currentColor" d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z" />
    </svg>
  );
}

export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19.5 5.5a9 9 0 0 1 0 13" /></>}
    </svg>
  );
}
