import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: PromptEvent | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// The browser can fire this before React renders, so catch it at module load.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; ping(); });
  window.addEventListener('appinstalled', () => { deferred = null; ping(); });
  if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); });
  }
}

export function usePwa() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const installed = isStandalone();
  const ios = isIOS();
  return {
    installed,
    ios,
    canPrompt: !!deferred,
    // show the button where an install is actually possible: native prompt, or iOS Safari steps
    available: !installed && (!!deferred || ios),
    async install(): Promise<'accepted' | 'dismissed' | 'ios'> {
      if (!deferred) return 'ios';
      const d = deferred; deferred = null; ping();
      await d.prompt();
      return (await d.userChoice).outcome;
    },
  };
}
