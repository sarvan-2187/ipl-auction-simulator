// Tiny synthesized sound kit (no audio files needed).
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('ipl.muted') === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('ipl.muted', m ? '1' : '0'); } catch {}
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0, slideTo?: number) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.3, delay = 0, lp = 900) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  unlock: () => { try { ac(); } catch {} },
  bid: () => { tone(660, 0.09, 'triangle', 0.12); tone(990, 0.12, 'triangle', 0.08, 0.05); },
  myBid: () => { tone(523, 0.08, 'square', 0.06); tone(784, 0.08, 'square', 0.06, 0.06); tone(1046, 0.16, 'square', 0.06, 0.12); },
  tick: () => tone(1200, 0.05, 'sine', 0.06),
  urgent: () => tone(880, 0.08, 'square', 0.05),
  gavel: () => { noise(0.18, 0.9, 0, 700); tone(140, 0.25, 'sine', 0.35, 0, 70); noise(0.12, 0.5, 0.22, 600); tone(120, 0.2, 'sine', 0.25, 0.22, 60); },
  sold: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, 0.32 + i * 0.07)); },
  unsold: () => { tone(300, 0.35, 'sawtooth', 0.05, 0.25, 160); },
  // heavy rubber stamp hitting paper
  stamp: (delay = 0) => { noise(0.09, 1.1, delay, 1800); tone(95, 0.18, 'sine', 0.45, delay, 50); noise(0.25, 0.25, delay + 0.03, 400); },
  // paper ticket whoosh
  whoosh: (delay = 0) => { if (muted) return; const a = ac(); const t = a.currentTime + delay; const n = a.createBufferSource(); const len = 0.35; const buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length); n.buffer = buf; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3500, t + len); const g = a.createGain(); g.gain.value = 0.35; n.connect(f).connect(g).connect(a.destination); n.start(t); },
  // stadium crowd roar: swelling filtered noise
  crowd: (delay = 0, big = false) => {
    if (muted) return;
    const a = ac(); const t = a.currentTime + delay; const len = big ? 2.6 : 1.8;
    const buf = a.createBuffer(2, a.sampleRate * len, a.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const g = a.createGain(); const peak = big ? 0.32 : 0.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(g).connect(a.destination); src.start(t);
  },
  newLot: () => { tone(392, 0.12, 'sine', 0.08); tone(587, 0.18, 'sine', 0.08, 0.1); },
  error: () => tone(200, 0.15, 'square', 0.05),
};
