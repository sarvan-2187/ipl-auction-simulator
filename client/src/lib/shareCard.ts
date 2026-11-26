// Renders a 1080x1350 share image of a Playing XI (Instagram / WhatsApp friendly).
import { getPlayer, getTeam, playerPhoto, ratingAs } from './data';
import { roleIn, xiInfo } from './xi';
import type { Role, TeamState } from './types';

// whichever address the player is on (custom domain or the Render link)
export const SITE = typeof location !== 'undefined' && !/^(localhost|127\.)/.test(location.hostname) ? location.host : 'ipl.sarvankumar.in';
const W = 1080;
const H = 1350;

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// largest font size (down to `min`) at which `text` fits in `max` px
function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, start: number, min: number, weight = 800) {
  let size = start;
  ctx.font = `${weight} ${size}px Geist, sans-serif`;
  while (size > min && ctx.measureText(text).width > max) { size -= 2; ctx.font = `${weight} ${size}px Geist, sans-serif`; }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

export async function renderXICard(team: TeamState, ids: number[], ownerName: string, roomCode: string): Promise<Blob> {
  await document.fonts.ready;
  const info = getTeam(team.code)!;
  const xi = xiInfo(ids, team.squad);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // background: outfield green with mowing stripes and one team-coloured glow
  const turf = ctx.createLinearGradient(0, 0, 0, H);
  turf.addColorStop(0, '#0c2a1a');
  turf.addColorStop(0.6, '#071a0f');
  turf.addColorStop(1, '#041008');
  ctx.fillStyle = turf;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < W; x += 120) ctx.fillRect(x, 0, 60, H);
  const glow = ctx.createRadialGradient(W / 2, -120, 40, W / 2, -120, 900);
  glow.addColorStop(0, info.primary + 'cc');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // header
  const logo = await load(`/teams/${team.code}.svg`);
  if (logo) ctx.drawImage(logo, 56, 52, 112, 112);
  ctx.fillStyle = '#a8b9a7';
  ctx.font = '600 22px Geist, sans-serif';
  (ctx as any).letterSpacing = '4px';
  ctx.fillText('PLAYING XI', 190, 84);
  (ctx as any).letterSpacing = '0px';
  ctx.fillStyle = '#fff';
  fitFont(ctx, info.name, 560, 54, 34);
  ctx.fillText(fitText(ctx, info.name, 560), 188, 136);
  ctx.fillStyle = '#a8b9a7';
  ctx.font = '500 26px Geist, sans-serif';
  ctx.fillText(fitText(ctx, `Picked by ${ownerName}`, 560), 190, 174);

  // XI rating badge
  roundRect(ctx, W - 270, 52, 214, 140, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245,192,74,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a8b9a7';
  ctx.font = '600 18px Geist, sans-serif';
  (ctx as any).letterSpacing = '3px';
  ctx.fillText('XI RATING', W - 163, 88);
  (ctx as any).letterSpacing = '0px';
  ctx.fillStyle = '#f5c04a';
  ctx.font = '800 78px Geist, sans-serif';
  ctx.fillText(xi.rating.toFixed(1), W - 163, 168);

  // ground
  const gx = W / 2, gy = 735, rx = 470, ry = 520;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? '#19703a' : '#1d7a3c';
    ctx.fillRect(gx - rx, gy - ry + (i * 2 * ry) / 16, rx * 2, (2 * ry) / 16 + 1);
  }
  const vignette = ctx.createRadialGradient(gx, gy, ry * 0.5, gx, gy, ry * 1.05);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(gx - rx, gy - ry, rx * 2, ry * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(gx, gy, rx - 16, ry - 16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(gx, gy, rx * 0.62, ry * 0.56, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(216,192,138,0.35)';
  roundRect(ctx, gx - 30, gy - 125, 60, 250, 6);
  ctx.fill();

  // players by role
  const rows: { role: Role; label: string; y: number; half: number }[] = [
    { role: 'WK', label: 'WICKET-KEEPER', y: 352, half: 200 },
    { role: 'BAT', label: 'BATTERS', y: 574, half: 360 },
    { role: 'AR', label: 'ALL-ROUNDERS', y: 806, half: 360 },
    { role: 'BOWL', label: 'BOWLERS', y: 1040, half: 300 },
  ];
  const R = 62; // head radius
  const photos = await Promise.all(ids.map((id) => { const src = playerPhoto(getPlayer(id)); return src ? load(src) : Promise.resolve(null); }));
  for (const row of rows) {
    const list = ids.map((id, i) => ({ id, img: photos[i] })).filter((x) => roleIn(team.squad, x.id) === row.role);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '700 18px Geist, sans-serif';
    (ctx as any).letterSpacing = '4px';
    ctx.fillText(row.label, gx, row.y - R - 26);
    (ctx as any).letterSpacing = '0px';
    const n = list.length;
    const spread = Math.min(row.half, 130 * (n - 1));
    list.forEach((x, i) => {
      const p = getPlayer(x.id);
      const cx = n === 1 ? gx : gx - spread + (2 * spread * i) / (n - 1);
      const cy = row.y;
      // ring
      ctx.beginPath(); ctx.arc(cx, cy, R + 8, 0, Math.PI * 2); ctx.fillStyle = info.primary; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      // photo
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      const bg = ctx.createRadialGradient(cx, cy - R / 2, 4, cx, cy, R * 1.2);
      bg.addColorStop(0, info.primary); bg.addColorStop(1, '#111');
      ctx.fillStyle = bg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      if (x.img) {
        const s = (R * 2 * 1.35) / x.img.width; // zoom on the face
        const w = x.img.width * s, h = x.img.height * s;
        ctx.drawImage(x.img, cx - w / 2, cy - R - h * 0.04, w, h);
      } else {
        ctx.fillStyle = '#fff'; ctx.font = '800 44px Geist, sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(p.name.split(' ').map((w) => w[0]).slice(0, 2).join(''), cx, cy);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
      // rating badge
      const role = roleIn(team.squad, x.id);
      roundRect(ctx, cx + R - 34, cy - R - 10, 52, 32, 10);
      ctx.fillStyle = '#f5c04a'; ctx.fill();
      ctx.fillStyle = '#1a1200'; ctx.font = '800 20px Geist, sans-serif';
      ctx.fillText(String(ratingAs(p, role)), cx + R - 8, cy - R + 13);
      if (p.overseas) {
        roundRect(ctx, cx - R - 14, cy - R - 8, 40, 26, 8);
        ctx.fillStyle = '#2b6cb0'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '800 14px Geist, sans-serif';
        ctx.fillText('OS', cx - R + 6, cy - R + 10);
      }
      // name pill
      const surname = p.name.split(' ').slice(-1)[0];
      ctx.font = '400 28px "NType 82", Georgia, serif';
      const label = fitText(ctx, surname, 190);
      const tw = ctx.measureText(label).width + 28;
      roundRect(ctx, cx - tw / 2, cy + R + 12, tw, 42, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, cx, cy + R + 42);
    });
  }

  // footer
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6b6b6b';
  ctx.font = '600 22px Geist, sans-serif';
  ctx.fillText(`WK ${xi.counts.WK}  ·  BAT ${xi.counts.BAT}  ·  AR ${xi.counts.AR}  ·  BOWL ${xi.counts.BOWL}  ·  OS ${xi.os}/4`, 56, H - 60);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5c04a';
  ctx.font = '700 24px Geist, sans-serif';
  ctx.fillText(SITE, W - 56, H - 74);
  ctx.fillStyle = '#6b6b6b';
  ctx.font = '500 18px Geist, sans-serif';
  ctx.fillText(`The Dugout · Room ${roomCode}`, W - 56, H - 46);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render failed'))), 'image/png'));
}

export async function shareOrDownload(blob: Blob, filename: string, text: string) {
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My Playing XI', text });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

// Full squad card: cut-out faces on the team's colours (no ground), grouped by role
export async function renderSquadCard(team: TeamState, ownerName: string, roomCode: string, purseTotal: number): Promise<Blob> {
  await document.fonts.ready;
  const info = getTeam(team.code)!;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const money = (l: number) => (l < 100 ? `₹${l} L` : `₹${+(l / 100).toFixed(2)} Cr`);

  // team background: colour gradient + the franchise pattern
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, info.primary);
  bg.addColorStop(1, '#041008');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const pattern = await load(`/teams/${team.code}-bg.svg`);
  if (pattern) { ctx.globalAlpha = 0.18; ctx.drawImage(pattern, 0, 0, W, H); ctx.globalAlpha = 1; }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0.15)');
  shade.addColorStop(1, 'rgba(2,10,5,0.65)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // header
  const logo = await load(`/teams/${team.code}.svg`);
  if (logo) ctx.drawImage(logo, 48, 40, 104, 104);
  (ctx as any).letterSpacing = '4px';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 20px Geist, sans-serif';
  ctx.fillText(`FULL SQUAD · ${team.squad.length} PLAYERS`, 172, 72);
  (ctx as any).letterSpacing = '0px';
  ctx.fillStyle = '#fff';
  fitFont(ctx, info.name, 560, 52, 34);
  ctx.fillText(fitText(ctx, info.name, 560), 170, 122);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '500 24px Geist, sans-serif';
  ctx.fillText(fitText(ctx, `Built by ${ownerName}`, 560), 172, 156);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 18px Geist, sans-serif';
  ctx.fillText('SPENT', W - 48, 72);
  ctx.fillStyle = '#f5c04a';
  ctx.font = '800 44px Geist, sans-serif';
  ctx.fillText(money(purseTotal - team.purse), W - 48, 116);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 20px Geist, sans-serif';
  ctx.fillText(`${money(team.purse)} left`, W - 48, 148);
  ctx.textAlign = 'left';

  // tiles
  const order: Role[] = ['WK', 'BAT', 'AR', 'BOWL'];
  const list = team.squad
    .map((e) => { const p = getPlayer(e.id); const role = (e.role || p.role) as Role; return { e, p, role, r: ratingAs(p, role) }; })
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || b.r - a.r);
  const n = list.length;
  const cols = n <= 9 ? 3 : n <= 16 ? 4 : 5;
  const rows = Math.ceil(n / cols);
  const top = 196, bottom = H - 96, gap = 14, side = 48;
  const tw = (W - side * 2 - gap * (cols - 1)) / cols;
  const th = Math.min(tw * 1.32, (bottom - top - gap * (rows - 1)) / rows);
  const imgs = await Promise.all(list.map((x) => { const src = playerPhoto(x.p); return src ? load(src) : Promise.resolve(null); }));
  list.forEach((x, i) => {
    const cx = side + (i % cols) * (tw + gap);
    const cy = top + Math.floor(i / cols) * (th + gap);
    const band = Math.max(54, th * 0.27);
    ctx.save();
    roundRect(ctx, cx, cy, tw, th, 16);
    ctx.clip();
    const tile = ctx.createLinearGradient(0, cy, 0, cy + th);
    tile.addColorStop(0, 'rgba(255,255,255,0.16)');
    tile.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = tile;
    ctx.fillRect(cx, cy, tw, th);
    const img = imgs[i];
    const area = th - band;
    if (img) {
      // cut-out anchored to the bottom of the photo area, head and shoulders
      const s = (area * 1.25) / img.height;
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, cx + tw / 2 - w / 2, cy + area - h * 0.86, w, h);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `800 ${Math.round(area * 0.3)}px Geist, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(x.p.name.split(' ').map((w) => w[0]).slice(0, 2).join(''), cx + tw / 2, cy + area * 0.62);
      ctx.textAlign = 'left';
    }
    // name band
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(cx, cy + th - band, tw, band);
    ctx.restore();
    const sz = Math.max(18, Math.min(26, tw / 8.5));
    ctx.fillStyle = '#fff';
    ctx.font = `400 ${sz}px "NType 82", Georgia, serif`;
    ctx.fillText(fitText(ctx, x.p.name, tw - 20), cx + 10, cy + th - band + sz + 6);
    ctx.font = `700 ${Math.round(sz * 0.62)}px Geist, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`${x.role} ${x.r}${x.p.overseas ? ' · OS' : ''}`, cx + 10, cy + th - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f5c04a';
    ctx.font = `800 ${Math.round(sz * 0.72)}px Geist, sans-serif`;
    ctx.fillText(money(x.e.price), cx + tw - 10, cy + th - 12);
    ctx.textAlign = 'left';
  });

  // footer
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 20px Geist, sans-serif';
  const c = { WK: 0, BAT: 0, AR: 0, BOWL: 0 } as Record<Role, number>;
  list.forEach((x) => c[x.role]++);
  ctx.fillText(`WK ${c.WK}  ·  BAT ${c.BAT}  ·  AR ${c.AR}  ·  BOWL ${c.BOWL}  ·  OS ${list.filter((x) => x.p.overseas).length}`, side, H - 44);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5c04a';
  ctx.font = '700 22px Geist, sans-serif';
  ctx.fillText(SITE, W - side, H - 56);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '500 16px Geist, sans-serif';
  ctx.fillText(`The Dugout · Room ${roomCode}`, W - side, H - 32);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render failed'))), 'image/png'));
}
