import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

// Portrait phones get paged screens (tabs) instead of long scrolling pages
const PHONE = '(max-width: 820px) and (orientation: portrait)';

export function usePhone() {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return on;
}

export type PageTab<K extends string> = { key: K; label: string; badge?: number | string | null; disabled?: boolean };

export function PageTabs<K extends string>({ tabs, page, setPage, id }: { tabs: PageTab<K>[]; page: K; setPage: (k: K) => void; id: string }) {
  return (
    <div className="page-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={page === t.key} className={page === t.key ? 'on' : ''} disabled={t.disabled} onClick={() => setPage(t.key)}>
          {page === t.key && <motion.i layoutId={`pt-${id}`} className="pt-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span>{t.label}</span>
          {t.badge != null && t.badge !== 0 && <em>{t.badge}</em>}
        </button>
      ))}
    </div>
  );
}

// One page of a paged screen; slides in when it becomes active
export function Page({ children, className = '', k }: { children: ReactNode; className?: string; k: string }) {
  return (
    <motion.div key={k} className={`page ${className}`} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}
