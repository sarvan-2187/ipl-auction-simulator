// Anonymous counters sent to our own server: no cookies, no ids, no personal data.
type Ev = 'visit' | 'clickCreate' | 'clickJoin' | 'clickInstall' | 'installed';

export function track(e: Ev) {
  try {
    if (navigator.doNotTrack === '1') return;
    fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ e }), keepalive: true }).catch(() => {});
  } catch {}
}

// one visit per browser session
export function trackVisit() {
  try {
    if (sessionStorage.getItem('dg-visit')) return;
    sessionStorage.setItem('dg-visit', '1');
  } catch {}
  track('visit');
}
