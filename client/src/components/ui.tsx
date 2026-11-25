import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getTeam, playerPhoto, teamLogo } from '../lib/data';
import type { Player } from '../lib/types';

type Toast = { id: number; text: string; err?: boolean };
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, err = false) => {
    const id = Math.random();
    setList((l) => [...l.slice(-2), { id, text, err }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        <AnimatePresence>
          {list.map((t) => (
            <motion.div key={t.id} className={`toast ${t.err ? 'err' : ''}`} initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function TeamLogo({ code, size = 40, className = '' }: { code: string; size?: number; className?: string }) {
  return <img src={teamLogo(code)} alt={getTeam(code)?.name || code} width={size} height={size} className={`logo ${className}`} style={{ width: size, height: size }} draggable={false} />;
}

export function teamVars(code?: string | null): Record<string, string> {
  const t = getTeam(code);
  return { ['--c1' as any]: t?.primary || '#1f1f1f', ['--c2' as any]: t?.secondary || '#f5c04a' };
}

export function initials(name: string) {
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Small square face used in lists
export function Face({ p, className = 'face' }: { p: Player; className?: string }) {
  const src = playerPhoto(p);
  return (
    <div className={className}>
      {src ? <img src={src} alt="" loading="lazy" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: 'var(--font-display)', fontSize: 18 }}>{initials(p.name)}</div>}
    </div>
  );
}

export function Silhouette({ className = 'silhouette' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 240" aria-hidden="true">
      <defs>
        <linearGradient id="sil" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.12)" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="70" r="40" fill="url(#sil)" />
      <path d="M20 240c0-60 36-100 80-100s80 40 80 100z" fill="url(#sil)" />
    </svg>
  );
}

export function GavelIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g transform="rotate(-35 12 12)">
        <rect x="5" y="5" width="12" height="5.5" rx="1.4" fill="#f5c04a" />
        <rect x="9.9" y="10.5" width="2.2" height="10" rx="1" fill="#f5c04a" />
      </g>
      <rect x="3" y="20" width="10" height="2" rx="1" fill="#b9851c" />
    </svg>
  );
}
