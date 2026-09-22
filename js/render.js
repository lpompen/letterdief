// Tekenen op canvas: pseudo-3D weg, decor, ballen, obstakels, munten en de personages.
import { LANES } from './engine.js';
import { SHOP } from './data.js';

const CAM_H = 3.1, D0 = 7, ZFAR = 70, BALL_Y = 2.05;
const SMALL_DECO = new Set(['🍄', '🌷', '🐚', '🦀', '🌻', '🌾', '🐑', '🚦', '❄️', '🌺', '🌿', '✨', '🗝️', '🔥', '🦜', '🐒', '🦉', '⛄']);
export const FONT = '"Andika", "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif';
const TAU = Math.PI * 2;

// ---------- emoji-sprites ----------
const spriteCache = new Map();
export function emojiSprite(ch, px) {
  const bucket = Math.max(16, Math.min(320, Math.pow(1.3, Math.ceil(Math.log(px) / Math.log(1.3)))));
  const key = ch + '|' + Math.round(bucket);
  let c = spriteCache.get(key);
  if (!c) {
    const size = Math.ceil(bucket * 1.3);
    c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${Math.round(bucket)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.fillText(ch, size / 2, size / 2 + bucket * 0.06);
    spriteCache.set(key, c);
    if (spriteCache.size > 400) spriteCache.delete(spriteCache.keys().next().value);
  }
  return c;
}
export function drawEmoji(ctx, ch, x, y, px, alpha = 1) {
  const s = emojiSprite(ch, px);
  const d = px * 1.3;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(s, x - d / 2, y - d / 2, d, d);
  if (alpha < 1) ctx.globalAlpha = 1;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function ellipse(ctx, x, y, rx, ry, fill, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// Eigen prentenboekdecor: één kleine sprite per vorm/thema, hergebruikt in elk frame.
// De letters blijven echte tekst; decor hoeft geen systeem-emoji of netwerk te laden.
const sceneryCache = new Map();
const SCENERY = new Set(['🌲', '🌳', '🌴', '🍄', '🌷', '🌻', '🌺', '🌿', '🌾', '🏡', '🏠', '🏢', '🏪', '🏰', '🏔️', '⛄', '❄️', '⛱️', '🐚', '🚦', '🚩', '✨', '🗝️', '🔥', '🪵', '🪣', '🚧', '🧊', '🪨', '🎃', '🛢️']);
function path(ctx, points, fill) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function block(ctx, x, y, w, h, color, radius = 4) { rrect(ctx, x, y, w, h, radius); ctx.fillStyle = color; ctx.fill(); }
function line(ctx, x1, y1, x2, y2, color, width = 2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
}
function sparkle(ctx, x, y, r, color) { path(ctx, [[x, y - r], [x + r * .28, y - r * .28], [x + r, y], [x + r * .28, y + r * .28], [x, y + r], [x - r * .28, y + r * .28], [x - r, y], [x - r * .28, y - r * .28]], color); }

function scenerySprite(ch, theme) {
  const snow = theme.obstacle === '🧊', night = !!theme.night;
  const key = `${ch}|${snow}|${night}`;
  if (sceneryCache.has(key)) return sceneryCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
  const c = canvas.getContext('2d'); c.scale(3.2, 3.2); c.translate(50, 93);
  const leaf = night ? '#3b807d' : '#3d9f76', leafLight = night ? '#67a899' : '#80c68a', trunk = '#986a46';
  ellipse(c, 0, -1, 25, 4, night ? 'rgba(7,19,37,.22)' : 'rgba(26,69,51,.14)');
  if (ch === '🌲' || ch === '🌳' || ch === '🌴') {
    block(c, -4, -52, 8, 51, trunk, 3); line(c, -1, -22, 0, -7, '#c8996e', 2);
    if (ch === '🌲') {
      for (let i = 0; i < 3; i++) {
        const y = -86 + i * 19, w = 18 + i * 7;
        path(c, [[0, y], [w, y + 34], [w * .7, y + 37], [-w * .8, y + 37], [-w, y + 33]], i % 2 ? leaf : shade(leaf, -14));
        path(c, [[0, y], [4, y + 29], [-w * .8, y + 33]], snow ? '#f4fbff' : leafLight);
      }
    } else if (ch === '🌳') {
      line(c, 0, -32, -19, -53, trunk, 6); line(c, 1, -39, 18, -61, trunk, 6);
      for (const [x, y, r] of [[-19, -56, 22], [20, -59, 23], [0, -71, 23], [0, -49, 25]]) ellipse(c, x, y, r, r * .9, leaf);
      ellipse(c, -9, -74, 17, 12, leafLight); ellipse(c, -26, -58, 11, 7, leafLight);
      ellipse(c, 21, -58, 4, 4, '#f3c260'); ellipse(c, -11, -44, 4, 4, '#f3c260');
    } else {
      c.strokeStyle = trunk; c.lineWidth = 8; c.beginPath(); c.moveTo(-7, -2); c.quadraticCurveTo(3, -37, 0, -68); c.stroke();
      for (const [x, y] of [[-39, -65], [-29, -84], [28, -87], [41, -66], [27, -48], [-25, -48]]) {
        c.beginPath(); c.moveTo(0, -67); c.quadraticCurveTo(x * .4, y - 18, x, y); c.quadraticCurveTo(x * .55, y + 3, 0, -67); c.fillStyle = x < 0 ? leafLight : leaf; c.fill();
      }
      ellipse(c, -4, -64, 5, 6, '#be8956'); ellipse(c, 6, -63, 5, 6, '#a2714a');
    }
    for (const s of [-1, 1]) { line(c, s * 12, -2, s * 15, -10, leafLight, 3); line(c, s * 12, -2, s * 21, -6, leaf, 3); }
  } else if (ch === '🍄') {
    block(c, -7, -31, 14, 30, '#ffecd5', 5);
    ellipse(c, 0, -30, 28, 7, '#eed6bd');
    c.beginPath(); c.moveTo(-29, -31); c.bezierCurveTo(-24, -68, 23, -69, 29, -31); c.quadraticCurveTo(0, -20, -29, -31); c.fillStyle = night ? '#bd9ce5' : '#ed806c'; c.fill();
    for (const [x, y, r] of [[-13, -42, 5], [4, -53, 6], [17, -37, 4], [1, -32, 4]]) ellipse(c, x, y, r, r * .75, '#fff1d5');
  } else if (['🌷', '🌻', '🌺', '🌿', '🌾'].includes(ch)) {
    for (let i = -1; i <= 1; i++) {
      const x = i * 16, h = 34 + (i === 0 ? 13 : 0);
      line(c, x, -2, x, -h, leaf, 4); ellipse(c, x - 7, -h * .45, 10, 4, leafLight, .55); ellipse(c, x + 7, -h * .65, 10, 4, leaf, -.6);
      if (ch === '🌿') { ellipse(c, x, -h, 5, 12, leafLight, .3); continue; }
      if (ch === '🌾') { for (let j = 0; j < 4; j++) { ellipse(c, x - 4, -h + j * 5, 5, 3, '#efd078', .6); ellipse(c, x + 4, -h + j * 5, 5, 3, '#f8df93', -.6); } continue; }
      const petal = ch === '🌻' ? '#ffd365' : ch === '🌺' ? '#ef9caa' : '#f5a18c';
      for (let j = 0; j < 6; j++) { const a = j * TAU / 6; ellipse(c, x + Math.cos(a) * 8, -h + Math.sin(a) * 8, 6, 6, petal); }
      ellipse(c, x, -h, 6, 6, ch === '🌻' ? '#855940' : '#ffdb7b');
    }
  } else if (['🏡', '🏠', '🏢', '🏪'].includes(ch)) {
    const tall = ch === '🏢', top = tall ? -79 : -51;
    block(c, -27, top, 54, -top - 3, tall ? '#adc9d0' : '#ffe3b0', 5);
    block(c, 19, top, 8, -top - 3, tall ? '#8eb2bf' : '#e6bd89', 2);
    if (!tall) { path(c, [[-34, top + 3], [0, top - 28], [34, top + 3]], '#b66659'); path(c, [[-32, top + 3], [0, top - 28], [-4, top + 3]], '#db8d72'); block(c, 14, top - 24, 9, 15, '#9d645b', 1); }
    for (const x of [-14, 12]) for (let y = top + 12; y < -23; y += 21) { block(c, x - 6, y, 12, 14, '#fdf5d8', 3); block(c, x - 4, y + 2, 8, 10, '#769da9', 2); line(c, x, y + 2, x, y + 12, '#fff0cb', 1); }
    block(c, -7, -25, 14, 22, '#638d89', 6); ellipse(c, 3, -13, 1.2, 1.2, '#ffe2a3');
    if (ch === '🏪') { block(c, -30, -34, 60, 10, '#fff3dd', 3); for (let x = -29; x < 26; x += 12) block(c, x, -34, 6, 11, '#ec9787', 2); }
    ellipse(c, -30, -6, 9, 7, leaf); ellipse(c, 29, -5, 9, 6, leafLight);
  } else if (ch === '🏰') {
    block(c, -32, -61, 64, 57, '#d8c5ce', 3); block(c, -17, -48, 34, 44, '#eadddf', 2);
    for (const x of [-28, 28]) { block(c, x - 9, -68, 18, 64, '#c6b6cc', 3); path(c, [[x - 14, -66], [x, -88], [x + 14, -66]], '#77799f'); block(c, x - 3, -53, 6, 13, '#64718c', 3); }
    for (let x = -17; x < 18; x += 12) block(c, x, -55, 9, 11, '#eadddf', 1);
    block(c, -10, -27, 20, 24, '#8d7689', 9); block(c, -7, -24, 14, 21, '#4c546f', 7);
    line(c, 0, -80, 0, -59, '#ac8770', 2); path(c, [[1, -80], [16, -74], [1, -69]], '#ee9d81');
  } else if (ch === '🏔️' || ch === '🪨') {
    const mountain = ch === '🏔️';
    path(c, [[-37, -3], [-30, -30], [-8, mountain ? -82 : -40], [16, -48], [36, -3]], '#8ca4b6');
    path(c, [[-8, mountain ? -82 : -40], [-1, -3], [36, -3], [16, -48]], '#708c9f');
    if (mountain) path(c, [[-8, -82], [-24, -43], [-9, -49], [0, -38], [10, -59]], '#f1f8fc');
    else line(c, -23, -18, -15, -29, '#b0c4cd', 3);
  } else if (ch === '⛄') {
    ellipse(c, 0, -23, 22, 22, '#daeaf0'); ellipse(c, -3, -25, 19, 20, '#f4fafb'); ellipse(c, 0, -56, 15, 15, '#f7fbfb');
    line(c, -18, -30, -31, -47, '#8e7963', 3); line(c, 18, -30, 30, -43, '#8e7963', 3);
    block(c, -15, -44, 30, 7, '#e99384', 3); block(c, 6, -43, 7, 17, '#d67b6e', 2);
    block(c, -12, -77, 24, 12, '#607c98', 3); block(c, -18, -68, 36, 5, '#496781', 2);
    ellipse(c, -5, -58, 1.8, 2, '#405569'); ellipse(c, 5, -58, 1.8, 2, '#405569'); path(c, [[0, -54], [13, -52], [0, -49]], '#eaaa64');
    for (let i = 0; i < 3; i++) ellipse(c, 0, -29 + i * 7, 2, 2, '#607c98');
  } else if (ch === '⛱️') {
    line(c, 0, -63, 0, -3, '#c29c73', 4);
    c.beginPath(); c.arc(0, -51, 35, Math.PI, 0); c.closePath(); c.fillStyle = '#f4a28d'; c.fill();
    c.beginPath(); c.moveTo(0, -86); c.quadraticCurveTo(-15, -72, -13, -51); c.lineTo(13, -51); c.quadraticCurveTo(15, -72, 0, -86); c.fillStyle = '#fff0d0'; c.fill();
  } else if (ch === '🚩') {
    line(c, -8, -75, -8, -1, '#bd9472', 4); path(c, [[-6, -75], [31, -66], [15, -52], [-6, -58]], '#e99183');
  } else if (ch === '🚦') {
    block(c, -4, -49, 8, 46, '#739198', 3); block(c, -12, -82, 24, 48, '#4d6b79', 6);
    for (const [i, color] of ['#eea295', '#ffda89', '#a8d49b'].entries()) ellipse(c, 0, -72 + i * 14, 5, 5, color);
  } else if (ch === '✨' || ch === '❄️' || ch === '🗝️') {
    if (ch === '🗝️') { c.strokeStyle = '#f6d382'; c.lineWidth = 7; c.beginPath(); c.arc(0, -49, 12, 0, TAU); c.stroke(); line(c, 0, -36, 0, -7, '#f6d382', 7); line(c, 0, -10, 12, -10, '#f6d382', 5); }
    else for (const [x, y, r] of [[-13, -24, 9], [9, -53, 15], [25, -16, 5]]) sparkle(c, x, y, r, ch === '❄️' ? '#f5fbff' : '#ffe4a1');
  } else if (ch === '🔥') {
    path(c, [[-21, -5], [-27, -26], [-10, -42], [-2, -65], [11, -48], [25, -23], [19, -5]], '#e5a077');
    path(c, [[-9, -5], [-14, -22], [2, -41], [15, -19], [9, -5]], '#ffe0a0');
  } else if (ch === '🐚') {
    for (let i = -2; i <= 2; i++) ellipse(c, i * 7, -20 + Math.abs(i) * 3, 7, 20, i % 2 ? '#e4b5a1' : '#f6d7bd', i * -.3);
  } else if (ch === '🪵') {
    block(c, -34, -34, 68, 30, '#ac7b50', 12); ellipse(c, 28, -19, 10, 15, '#f0cc99'); ellipse(c, 29, -19, 5, 9, '#cca675');
    line(c, -24, -27, 16, -27, '#c99b6a', 2); line(c, -27, -15, 16, -15, '#865d40', 2); line(c, -3, -32, 6, -44, '#a7774e', 8);
  } else if (ch === '🚧') {
    for (const x of [-21, 21]) line(c, x, -49, x, -3, '#7f9397', 5);
    block(c, -36, -45, 72, 25, '#fff2d1', 4);
    for (let x = -28; x < 30; x += 22) path(c, [[x, -43], [x + 11, -43], [x + 2, -22], [x - 9, -22]], '#e6aa64');
  } else if (ch === '🧊') {
    block(c, -25, -49, 50, 46, '#a7dfe6', 8); path(c, [[-25, -43], [-15, -56], [31, -56], [24, -43]], '#e0f8fa'); path(c, [[25, -43], [31, -56], [31, -17], [25, -4]], '#75bccd');
    line(c, -17, -34, -7, -42, '#ecffff', 3); line(c, -16, -17, 4, -37, '#d7f8fa', 4);
  } else if (ch === '🎃') {
    block(c, -2, -53, 7, 15, leaf, 3); for (const [x, r] of [[-16, 13], [16, 13], [0, 17]]) ellipse(c, x, -23, r, 22, x === 0 ? '#eeaa6f' : '#dc945a');
    ellipse(c, -7, -27, 2, 3, '#825c43'); ellipse(c, 7, -27, 2, 3, '#825c43');
  } else if (ch === '🪣' || ch === '🛢️') {
    const barrel = ch === '🛢️'; block(c, -22, -47, 44, 43, barrel ? '#95a8b4' : '#91c2c3', 7);
    ellipse(c, 0, -45, 22, 6, barrel ? '#c1ced4' : '#c1e0dc'); ellipse(c, 0, -45, 17, 3, '#6e949c');
    line(c, -19, -15, 19, -15, '#d0dedc', 3); if (barrel) line(c, -19, -34, 19, -34, '#d0dedc', 3);
    else { c.beginPath(); c.arc(0, -41, 17, Math.PI, TAU); c.strokeStyle = '#6f9398'; c.lineWidth = 3; c.stroke(); }
  }
  sceneryCache.set(key, canvas);
  return canvas;
}

function drawScenery(ctx, ch, x, groundY, px, theme, alpha = 1) {
  if (!SCENERY.has(ch)) { drawEmoji(ctx, ch, x, groundY - px * .45, px, alpha); return; }
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.drawImage(scenerySprite(ch, theme), x - px * .62, groundY - px * 1.15, px * 1.24, px * 1.24);
  ctx.restore();
}

// ---------- het monster van het kind ----------
// look: { color, hat, glasses, cape }  ·  opts: { facing: 'front'|'back', phase, mood, blink }
export function drawHero(ctx, x, y, size, look, opts = {}) {
  const { facing = 'front', phase = 0, mood = 'happy', tilt = 0, squash = 0 } = opts;
  const color = look.color || '#ff7a59';
  const u = size / 2; // body-halfbreedte
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const step = Math.sin(phase), bob = Math.abs(Math.cos(phase)) * u * 0.08;
  const by = -u * 1.05 - bob; // midden van het lijf
  const capeItem = SHOP.find(s => s.id === look.cape);
  // cape achter het lijf (bij voorkant alleen randjes zichtbaar)
  if (capeItem && facing === 'back') {
    const flap = Math.sin(phase * 2) * u * 0.12;
    ctx.beginPath();
    ctx.moveTo(-u * 0.55, by - u * 0.55);
    ctx.quadraticCurveTo(-u * 1.0 - flap, by + u * 0.4, -u * 0.8 - flap, by + u * 1.05);
    ctx.lineTo(u * 0.8 + flap, by + u * 1.05);
    ctx.quadraticCurveTo(u * 1.0 + flap, by + u * 0.4, u * 0.55, by - u * 0.55);
    ctx.closePath();
    ctx.fillStyle = capeFill(ctx, capeItem, -u, by - u, u * 2);
    ctx.fill();
  } else if (capeItem) {
    ctx.beginPath();
    ctx.moveTo(-u * 0.6, by - u * 0.5); ctx.lineTo(-u * 1.05, by + u * 0.95); ctx.lineTo(u * 1.05, by + u * 0.95); ctx.lineTo(u * 0.6, by - u * 0.5); ctx.closePath();
    ctx.fillStyle = capeFill(ctx, capeItem, -u, by - u, u * 2); ctx.fill();
  }
  // voeten
  const footY = -u * 0.12;
  ellipse(ctx, -u * 0.42, footY - Math.max(0, step) * u * 0.28, u * 0.3, u * 0.19, shade(color, -45));
  ellipse(ctx, u * 0.42, footY - Math.max(0, -step) * u * 0.28, u * 0.3, u * 0.19, shade(color, -45));
  // armpjes
  ellipse(ctx, -u * 0.98, by + u * 0.15 + step * u * 0.18, u * 0.2, u * 0.32, shade(color, -25), 0.4 + step * 0.3);
  ellipse(ctx, u * 0.98, by + u * 0.15 - step * u * 0.18, u * 0.2, u * 0.32, shade(color, -25), -0.4 - step * 0.3);
  // oortjes
  ellipse(ctx, -u * 0.55, by - u * 0.95, u * 0.22, u * 0.3, shade(color, -20), -0.35);
  ellipse(ctx, u * 0.55, by - u * 0.95, u * 0.22, u * 0.3, shade(color, -20), 0.35);
  // lijf
  const g = ctx.createRadialGradient(-u * 0.3, by - u * 0.4, u * 0.1, 0, by, u * 1.2);
  g.addColorStop(0, shade(color, 45)); g.addColorStop(1, color);
  ellipse(ctx, 0, by, u * (1 + squash * 0.1), u * (1.05 - squash * 0.1), g);
  if (facing === 'front') {
    ellipse(ctx, 0, by + u * 0.35, u * 0.58, u * 0.5, shade(color, 60));
    // ogen
    const ey = by - u * 0.22, blink = opts.blink ? 0.15 : 1;
    for (const s of [-1, 1]) {
      ellipse(ctx, s * u * 0.34, ey, u * 0.24, u * 0.3 * blink, '#fff');
      if (blink > 0.5) {
        ellipse(ctx, s * u * 0.31, ey + u * 0.05, u * 0.13, u * 0.16, '#1f2335');
        ellipse(ctx, s * u * 0.27, ey - u * 0.02, u * 0.05, u * 0.05, '#fff');
      }
    }
    // wangetjes
    ellipse(ctx, -u * 0.62, by + u * 0.12, u * 0.14, u * 0.08, 'rgba(255,90,120,.35)');
    ellipse(ctx, u * 0.62, by + u * 0.12, u * 0.14, u * 0.08, 'rgba(255,90,120,.35)');
    // mond
    ctx.lineWidth = u * 0.08; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f2335';
    ctx.beginPath();
    if (mood === 'wow') { ellipse(ctx, 0, by + u * 0.2, u * 0.12, u * 0.15, '#1f2335'); }
    else if (mood === 'sad') { ctx.arc(0, by + u * 0.32, u * 0.18, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    else { ctx.arc(0, by + u * 0.08, u * 0.22, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    const glasses = SHOP.find(s => s.id === look.glasses);
    if (glasses) drawEmoji(ctx, glasses.icon, 0, ey + u * 0.02, u * 1.05);
  } else {
    // vlekjes op de rug en een pluizig staartje
    ellipse(ctx, -u * 0.3, by - u * 0.35, u * 0.12, u * 0.1, shade(color, 22));
    ellipse(ctx, u * 0.25, by - u * 0.1, u * 0.09, u * 0.08, shade(color, 22));
    ellipse(ctx, 0, by + u * 0.72, u * 0.24, u * 0.22, shade(color, 55));
    ellipse(ctx, -u * 0.06, by + u * 0.66, u * 0.1, u * 0.08, shade(color, 80));
    if (capeItem) {
      ctx.beginPath(); ctx.moveTo(-u * 0.5, by - u * 0.6); ctx.lineTo(u * 0.5, by - u * 0.6); ctx.lineWidth = u * 0.12; ctx.strokeStyle = shade(capeItem.color === 'rainbow' ? '#ef4444' : capeItem.color, -30); ctx.stroke();
    }
  }
  const hat = SHOP.find(s => s.id === look.hat);
  if (hat) drawEmoji(ctx, hat.icon, 0, by - u * 1.05, u * 1.1);
  ctx.restore();
}
function capeFill(ctx, item, x, y, w) {
  if (item.color !== 'rainbow') return item.color;
  const g = ctx.createLinearGradient(x, y, x + w, y);
  ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6'].forEach((c, i) => g.addColorStop(i / 5, c));
  return g;
}

// ---------- Snaai de letterdief (wasbeer) ----------
// pose: run · throw · taunt · tired · caught · happy
export function drawSnaai(ctx, x, y, size, opts = {}) {
  const { pose = 'run', phase = 0, look = 0, sack = 1 } = opts;
  const u = size / 2;
  const grey = '#8b9ba3', dark = '#3e5159', light = '#e5e8df';
  ctx.save();
  ctx.translate(x, y);
  const running = pose === 'run' || pose === 'throw' || pose === 'taunt';
  const step = running ? Math.sin(phase) : pose === 'tired' ? Math.sin(phase * 0.5) * 0.2 : 0;
  const bob = running ? Math.abs(Math.cos(phase)) * u * 0.1 : 0;
  const lean = pose === 'tired' ? 0.18 : 0;
  ctx.rotate(lean * 0.5);
  const by = -u * 1.2 - bob;
  // staart met ringen
  ctx.save();
  ctx.translate(u * 0.55, by + u * 0.55);
  ctx.rotate(-0.5 + Math.sin(phase * 1.3) * 0.25);
  for (let i = 0; i < 5; i++) ellipse(ctx, u * (0.25 + i * 0.26), -u * i * 0.12, u * 0.22, u * 0.2, i % 2 ? dark : grey);
  ctx.restore();
  // zak op de rug
  if (sack > 0.05) {
    const sr = u * (0.45 + 0.4 * sack);
    ctx.save(); ctx.translate(-u * 0.55, by - u * 0.55);
    ellipse(ctx, 0, 0, sr, sr * 0.92, '#b07a45');
    ellipse(ctx, -sr * 0.25, -sr * 0.3, sr * 0.4, sr * 0.3, 'rgba(255,255,255,.15)');
    ctx.fillStyle = '#ffd34d'; ctx.font = `bold ${Math.round(sr * 0.6)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#fff3a0'; ctx.shadowBlur = sr * 0.4;
    ctx.fillText('a', -sr * 0.35, -sr * 0.78); ctx.fillText('m', sr * 0.2, -sr * 0.9); ctx.fillText('s', sr * 0.62, -sr * 0.6);
    ctx.shadowBlur = 0;
    ellipse(ctx, 0, -sr * 0.62, sr * 0.55, sr * 0.16, '#8a5a2e');
    ctx.restore();
  }
  // benen
  ellipse(ctx, -u * 0.3, -u * 0.18 - Math.max(0, step) * u * 0.3, u * 0.2, u * 0.26, dark);
  ellipse(ctx, u * 0.3, -u * 0.18 - Math.max(0, -step) * u * 0.3, u * 0.2, u * 0.26, dark);
  // lijf met streepjestrui
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, by + u * 0.45, u * 0.62, u * 0.72, 0, 0, TAU); ctx.fillStyle = '#fff6e2'; ctx.fill(); ctx.clip();
  ctx.fillStyle = '#3e5159';
  for (let k = -3; k < 6; k++) ctx.fillRect(-u, by + u * 0.45 + k * u * 0.22, u * 2, u * 0.11);
  ctx.restore();
  // armen
  const throwing = pose === 'throw';
  ctx.strokeStyle = grey; ctx.lineWidth = u * 0.22; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-u * 0.5, by + u * 0.15); ctx.lineTo(-u * 0.72, by - u * 0.35); ctx.stroke(); // houdt de zak vast
  ctx.beginPath(); ctx.moveTo(u * 0.5, by + u * 0.15);
  if (throwing) ctx.lineTo(u * 0.95, by - u * 0.55);
  else if (pose === 'taunt') ctx.lineTo(u * 0.95, by - u * 0.2 + Math.sin(phase * 3) * u * 0.15);
  else if (pose === 'happy') ctx.lineTo(u * 0.9, by - u * 0.6 + Math.sin(phase * 4) * u * 0.12);
  else ctx.lineTo(u * 0.8, by + u * 0.55 - step * u * 0.2);
  ctx.stroke();
  // kop
  const hy = by - u * 0.55;
  ctx.fillStyle = grey;
  for (const s of [-1, 1]) { // oren
    ctx.beginPath(); ctx.moveTo(s * u * 0.25, hy - u * 0.35); ctx.lineTo(s * u * 0.55, hy - u * 0.85); ctx.lineTo(s * u * 0.62, hy - u * 0.25); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * u * 0.33, hy - u * 0.38); ctx.lineTo(s * u * 0.52, hy - u * 0.7); ctx.lineTo(s * u * 0.55, hy - u * 0.33); ctx.closePath(); ctx.fillStyle = dark; ctx.fill(); ctx.fillStyle = grey;
  }
  const face = ctx.createRadialGradient(-u * .25, hy - u * .2, 0, 0, hy, u * .72);
  face.addColorStop(0, '#b9c6c6'); face.addColorStop(1, grey);
  ellipse(ctx, 0, hy, u * 0.66, u * 0.56, face);
  ellipse(ctx, 0, hy + u * 0.2, u * 0.42, u * 0.3, light);
  // masker
  ctx.beginPath();
  ctx.moveTo(-u * 0.66, hy - u * 0.1);
  ctx.quadraticCurveTo(0, hy - u * 0.28, u * 0.66, hy - u * 0.1);
  ctx.quadraticCurveTo(u * 0.62, hy + u * 0.18, u * 0.3, hy + u * 0.12);
  ctx.quadraticCurveTo(0, hy + u * 0.02, -u * 0.3, hy + u * 0.12);
  ctx.quadraticCurveTo(-u * 0.62, hy + u * 0.18, -u * 0.66, hy - u * 0.1);
  ctx.fillStyle = '#1f2129'; ctx.fill();
  // ogen
  const sad = pose === 'caught', sleepy = pose === 'tired';
  for (const s of [-1, 1]) {
    ellipse(ctx, s * u * 0.26, hy - u * 0.04, u * 0.13, u * (sleepy ? 0.06 : 0.14), '#fff');
    if (!sleepy) ellipse(ctx, s * u * 0.26 + look * u * 0.05, hy - u * 0.01, u * 0.065, u * 0.08, '#111');
    if (sad) { ctx.strokeStyle = light; ctx.lineWidth = u * 0.05; ctx.beginPath(); ctx.moveTo(s * u * 0.12, hy - u * 0.25); ctx.lineTo(s * u * 0.4, hy - u * 0.17); ctx.stroke(); }
  }
  // neus + mond
  ellipse(ctx, 0, hy + u * 0.12, u * 0.09, u * 0.065, '#111');
  ctx.strokeStyle = '#111'; ctx.lineWidth = u * 0.045; ctx.lineCap = 'round';
  ctx.beginPath();
  if (sad) ctx.arc(0, hy + u * 0.38, u * 0.12, Math.PI * 1.2, Math.PI * 1.8);
  else ctx.arc(0, hy + u * 0.16, u * 0.15, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  if (!sad && !sleepy) { ctx.fillStyle = '#fff'; ctx.fillRect(-u * 0.035, hy + u * 0.29, u * 0.07, u * 0.07); }
  if (pose === 'taunt') ellipse(ctx, u * 0.04, hy + u * 0.34, u * 0.07, u * 0.09, '#ff6b8b');
  if (sleepy) { // zweetdruppels
    ctx.fillStyle = '#7cc8ff';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * u * 0.75, hy - u * 0.3 + Math.sin(phase + s) * u * 0.05, u * 0.07, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

export function drawNet(ctx, x, y, size, t) {
  ctx.save(); ctx.translate(x, y);
  const u = size / 2, drop = Math.min(1, t * 3);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = u * 0.06;
  const top = -u * 3.2 + drop * u * 0.8;
  ctx.beginPath(); ctx.ellipse(0, top + u * 0.5, u * 0.95, u * 0.25, 0, 0, TAU); ctx.stroke();
  for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * u * 0.22, top + u * 0.5); ctx.quadraticCurveTo(i * u * 0.3, -u * 1.2, i * u * 0.24, 0); ctx.stroke(); }
  for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.ellipse(0, top + u * 0.5 + k * (u * 2.4 - top * 0) / 5 * drop, u * (0.95 + k * 0.04), u * 0.2, 0, 0, Math.PI); ctx.stroke(); }
  ctx.restore();
}

const decoSize = ch => (SMALL_DECO.has(ch) ? 1.1 + Math.random() * 0.6 : 2.6 + Math.random() * 1.6);

// ---------- de wereld ----------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.W = 1; this.H = 1; this.dpr = 1; this.theme = null; this.decos = []; this.particles = []; this.clouds = [];
    this.camX = 0; this.shake = 0; this.stars = [];
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    this.s0 = Math.min(this.H * 0.17, (this.W * 0.94) / 7.2);
    this.feetY = this.H * 0.87;
    this.horizon = this.feetY - CAM_H * this.s0;
    this.F = this.s0 * D0;
  }
  setTheme(theme) {
    this.theme = theme; this.decos = [];
    for (let i = 0; i < 26; i++) this.addDeco(i * 5.5 + Math.random() * 2);
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random(), y: 0.1 + Math.random() * 0.5, s: 0.6 + Math.random() * 0.8 }));
    this.stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, p: Math.random() * 6 }));
  }
  addDeco(zWorld) {
    const d = this.theme.deco;
    const side = Math.random() < 0.5 ? -1 : 1;
    const ch = d[Math.floor(Math.random() * d.length)];
    this.decos.push({ zw: zWorld, x: side * (4.6 + Math.random() * 4.5), ch, size: decoSize(ch) });
  }
  project(x, y, z) {
    const zc = z + D0;
    if (zc < 0.6) return null;
    const s = this.F / zc;
    return { x: this.W / 2 + (x - this.camX) * s, y: this.horizon + (CAM_H - y) * s, s };
  }
  laneAt(screenX) {
    // Welke baan hoort bij een tik op het scherm (gemeten op de hoogte van de held).
    const s = this.F / D0;
    const x = (screenX - this.W / 2) / s + this.camX;
    return x < -1.1 ? 0 : x > 1.1 ? 2 : 1;
  }
  burst(x, y, color, n = 14, text = null) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 120 + Math.random() * 260;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.7 + Math.random() * 0.4, age: 0, color, size: 4 + Math.random() * 6, text });
    }
  }
  floatText(x, y, text, color = '#fff') { this.particles.push({ x, y, vx: 0, vy: -70, life: 1.1, age: 0, color, size: 30, text, float: true }); }

  frame(run, state, dt) {
    const ctx = this.ctx, W = this.W, H = this.H, th = this.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.camX += ((run ? run.x * 0.35 : 0) - this.camX) * Math.min(1, dt * 4);
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake -= dt; sx = (Math.random() - 0.5) * 10 * this.shake; sy = (Math.random() - 0.5) * 10 * this.shake; }
    ctx.save(); ctx.translate(sx, sy);
    const dist = run ? run.dist : state.t * 3;
    const t = state.t;
    // lucht
    const sky = ctx.createLinearGradient(0, 0, 0, this.horizon);
    sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, this.horizon + 22);
    if (th.night) {
      for (const s of this.stars) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.p); ellipse(ctx, s.x * W, s.y * this.horizon * 0.9, s.r, s.r, '#fff'); }
      ctx.globalAlpha = 1;
      const moonX = W * .8, moonY = this.horizon * .28, moonR = Math.min(W, H) * .045;
      ellipse(ctx, moonX, moonY, moonR * 1.5, moonR * 1.5, 'rgba(255,237,193,.08)');
      ellipse(ctx, moonX, moonY, moonR, moonR, '#fff0c8');
      ellipse(ctx, moonX + moonR * .4, moonY - moonR * .3, moonR * .86, moonR * .86, th.sky[0]);
    } else {
      const sunR = Math.min(W, H) * 0.06;
      const sunX = W * .82, sunY = this.horizon * .3;
      ellipse(ctx, sunX, sunY, sunR * 1.7, sunR * 1.7, 'rgba(255,245,197,.2)');
      ellipse(ctx, sunX, sunY, sunR * 1.3, sunR * 1.3, 'rgba(255,245,197,.35)');
      ellipse(ctx, sunX, sunY, sunR, sunR, '#ffdf8a');
      ellipse(ctx, sunX - sunR * .24, sunY, sunR * .045, sunR * .075, '#c39a52');
      ellipse(ctx, sunX + sunR * .24, sunY, sunR * .045, sunR * .075, '#c39a52');
      for (const c of this.clouds) {
        const cx = ((c.x + t * 0.004 * c.s) % 1.2) * (W + 200) - 100, cy = c.y * this.horizon * 0.8, cs = c.s * Math.min(W, H) * 0.05;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        for (const [ox, oy, r] of [[0, 0, 1], [0.9, 0.15, 0.75], [-0.9, 0.2, 0.7], [0.3, -0.45, 0.7]]) { ctx.beginPath(); ctx.arc(cx + ox * cs, cy + oy * cs, r * cs, 0, TAU); ctx.fill(); }
      }
    }
    // Drie zachte lagen maken de horizon diep, zonder drukte achter de letters.
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = shade(th.hills, (2 - layer) * (th.night ? 5 : 13));
      ctx.beginPath(); ctx.moveTo(-10, this.horizon + 2);
      for (let x = -10; x <= W + 20; x += 16) {
        const k = (x + this.camX * (10 + layer * 9) + dist * (.16 + layer * .2)) / W;
        ctx.lineTo(x, this.horizon - (Math.sin(k * 6.1 + layer * 1.4) * .42 + Math.sin(k * 11.7 + layer) * .23 + .95) * H * (.095 - layer * .026));
      }
      ctx.lineTo(W + 20, this.horizon + 2); ctx.closePath(); ctx.fill();
    }
    // grond + weg in banden
    ctx.fillStyle = th.ground; ctx.fillRect(-20, this.horizon, W + 40, H - this.horizon + 20);
    const band = 3;
    for (let z = ZFAR; z > -D0 + 0.8;) {
      const stepZ = Math.max(0.6, z * 0.12);
      const z2 = Math.max(-D0 + 0.8, z - stepZ);
      const a = this.project(0, 0, z), b = this.project(0, 0, z2);
      if (!a || !b) break;
      const bandIdx = Math.floor((z2 + dist) / band);
      if (bandIdx % 2 === 0) { ctx.fillStyle = shade(th.ground, -4); ctx.fillRect(-20, a.y, W + 40, b.y - a.y + 1); }
      const edge = 3.45, curb = 3.85;
      const quad = (x1, x2, fill) => {
        const p1 = this.project(x1, 0, z), p2 = this.project(x2, 0, z), p3 = this.project(x2, 0, z2), p4 = this.project(x1, 0, z2);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y + 0.5); ctx.lineTo(p4.x, p4.y + 0.5); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      };
      quad(-curb, curb, shade(th.edge, 10));
      quad(-edge, edge, bandIdx % 2 ? shade(th.road, 8) : th.road);
      quad(-edge, -edge + .09, 'rgba(255,255,255,.3)'); quad(edge - .09, edge, 'rgba(255,255,255,.3)');
      if (Math.floor((z2 + dist) / 1.5) % 2 === 0) { quad(-1.14, -1.06, 'rgba(255,255,255,.48)'); quad(1.06, 1.14, 'rgba(255,255,255,.48)'); }
      z = z2;
    }
    // decor verversen
    for (const d of this.decos) if (d.zw - dist < -D0) { d.zw += 26 * 5.5; d.ch = th.deco[Math.floor(Math.random() * th.deco.length)]; d.size = decoSize(d.ch); d.x = (Math.random() < 0.5 ? -1 : 1) * (4.6 + Math.random() * 4.5); }
    // alles sorteren van ver naar dichtbij
    const list = [];
    for (const d of this.decos) { const z = d.zw - dist; if (z < ZFAR && z > -D0 + 0.8) list.push({ z, kind: 'deco', d }); }
    if (run) {
      for (const o of run.obstacles) list.push({ z: o.z, kind: 'obs', o });
      for (const c of run.coins) list.push({ z: c.z, kind: 'coin', c });
      for (const r of run.rows) for (const it of r.items) if (!it.taken) list.push({ z: r.z, kind: 'ball', r, it });
      if (state.showSnaai !== false) list.push({ z: run.snaaiZ, kind: 'snaai' });
      list.push({ z: 0.01, kind: 'hero' });
    }
    list.sort((a, b) => b.z - a.z);
    for (const e of list) this.drawEntity(e, run, state);
    // deeltjes
    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.float) p.vy += 600 * dt;
      const a = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = a;
      if (p.text) {
        ctx.font = `bold ${p.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
      } else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter(p => p.age < p.life);
    ctx.restore();
  }

  drawEntity(e, run, state) {
    const ctx = this.ctx, t = state.t;
    if (e.kind === 'deco') {
      const p = this.project(e.d.x, 0, e.z); if (!p) return;
      const px = e.d.size * p.s;
      const fade = e.z > ZFAR - 12 ? (ZFAR - e.z) / 12 : 1;
      drawScenery(ctx, e.d.ch, p.x, p.y, px, this.theme, fade);
    } else if (e.kind === 'obs') {
      const p = this.project(LANES[e.o.lane], 0, e.z); if (!p) return;
      ellipse(ctx, p.x, p.y, 0.7 * p.s, 0.18 * p.s, 'rgba(0,0,0,.18)');
      const wob = e.o.hit ? Math.sin(t * 30) * 0.1 : 0;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(wob);
      drawScenery(ctx, this.theme.obstacle, 0, 0, 1.65 * p.s, this.theme);
      ctx.restore();
    } else if (e.kind === 'coin') {
      const p = this.project(LANES[e.c.lane], e.c.y + 0.35, e.z); if (!p) return;
      const w = Math.abs(Math.cos(t * 5 + e.c.spin));
      const r = 0.32 * p.s;
      ellipse(ctx, p.x, p.y, r * Math.max(0.15, w), r, '#e0a100');
      ellipse(ctx, p.x, p.y, r * Math.max(0.1, w) * 0.72, r * 0.72, '#ffd43b');
      if (w > 0.5) ellipse(ctx, p.x - r * 0.2 * w, p.y - r * 0.25, r * 0.12 * w, r * 0.2, 'rgba(255,255,255,.8)');
    } else if (e.kind === 'ball') {
      this.drawBall(e.r, e.it, run, state);
    } else if (e.kind === 'snaai') {
      const sz = run.snaaiZ;
      const weave = run.mode === 'run' ? Math.sin(t * 0.8) * 1.4 : 0;
      state.snaaiX = state.snaaiX == null ? 0 : state.snaaiX + (weave - state.snaaiX) * 0.05;
      const p = this.project(state.snaaiX, 0, sz); if (!p) return;
      const size = 1.5 * p.s * 1.8;
      ellipse(ctx, p.x, p.y, size * 0.35, size * 0.08, 'rgba(0,0,0,.2)');
      let pose = 'run';
      if (run.mode === 'catch') pose = run.gap < 0.05 ? 'tired' : 'run';
      if (run.mode === 'caught') pose = state.happySnaai ? 'happy' : 'caught';
      if (t - run.snaaiThrowT < 0.45) pose = 'throw';
      else if (t - run.snaaiHitT < 1.2) pose = 'taunt';
      drawSnaai(ctx, p.x, p.y, size, { pose, phase: run.dist * 1.6, look: (this.project(run.x, 0, 0).x - p.x) / this.W, sack: state.sack ?? 1 });
      state.snaaiScreen = { x: p.x, y: p.y - size * 0.7, r: size * 0.9 };
      if (run.mode === 'caught') drawNet(ctx, p.x, p.y, size, state.caughtT || 0);
    } else if (e.kind === 'hero') {
      const p = this.project(run.x, run.jumpH, 0); if (!p) return;
      const ground = this.project(run.x, 0, 0);
      const size = 1.25 * p.s;
      const shadow = 1 - Math.min(0.6, run.jumpH / 2);
      ellipse(ctx, ground.x, ground.y, size * 0.45 * shadow, size * 0.1 * shadow, 'rgba(0,0,0,.22)');
      if (run.invuln > 0 && Math.floor(t * 12) % 2 === 0) ctx.globalAlpha = 0.45;
      const tilt = run.stumbleT > 0 ? Math.sin(t * 25) * 0.25 : (LANES[run.lane] - run.x) * -0.08;
      drawHero(ctx, p.x, p.y, size, state.look, { facing: 'back', phase: run.dist * 1.9, tilt, squash: run.jumpT < 0 ? 0 : -0.5 });
      ctx.globalAlpha = 1;
      if (run.stumbleT > 0) for (let i = 0; i < 3; i++) drawEmoji(ctx, '⭐', p.x + Math.cos(t * 6 + i * 2.1) * size * 0.5, p.y - size * 1.5 + Math.sin(t * 6 + i * 2.1) * size * 0.12, size * 0.25);
      state.heroScreen = { x: p.x, y: p.y - size * 0.8 };
    }
  }

  drawBall(row, it, run, state) {
    const ctx = this.ctx, t = state.t;
    // Boven het hoofd van de held, zodat de bal in de eigen baan zichtbaar blijft.
    let x = LANES[it.lane], y = BALL_Y + Math.sin(t * 3 + it.lane) * 0.08, z = row.z;
    const fly = Math.min(1, row.age / 0.5);
    if (fly < 1) { // boog uit de zak van Snaai
      const sx = state.snaaiX || 0;
      x = sx + (x - sx) * fly; y = 2.8 + (y - 2.8) * fly + Math.sin(fly * Math.PI) * 1.4;
    }
    const p = this.project(x, y, z); if (!p) return;
    const r = 0.62 * p.s * (0.6 + 0.4 * fly);
    if (it.gone) ctx.globalAlpha = Math.max(0, 0.4 + z * 0.1);
    const g0 = this.project(x, 0, z);
    ellipse(ctx, g0.x, g0.y, r * 0.8, r * 0.2, 'rgba(0,0,0,.15)');
    if (row.glow && it.correct && !row.resolved) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      ellipse(ctx, p.x, p.y, r * (1.3 + pulse * 0.15), r * (1.3 + pulse * 0.15), `rgba(255,214,60,${0.35 + pulse * 0.35})`);
    }
    const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
    const night = this.theme.night;
    g.addColorStop(0, '#fffefa'); g.addColorStop(0.75, night ? '#ede7ff' : '#f2f7e6'); g.addColorStop(1, night ? '#bcaee5' : '#c7dfcb');
    ellipse(ctx, p.x, p.y, r, r, g);
    ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = night ? '#9a8bcc' : '#76a994'; ctx.stroke();
    if (it.pic) drawEmoji(ctx, it.pic, p.x, p.y, r * 1.2);
    else {
      const len = it.label.length;
      ctx.font = `bold ${Math.round(r * (len === 1 ? 1.25 : len === 2 ? 1.0 : 0.78))}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#23304a';
      ctx.fillText(it.label, p.x, p.y + r * 0.02);
    }
    ellipse(ctx, p.x - r * 0.38, p.y - r * 0.45, r * 0.18, r * 0.11, 'rgba(255,255,255,.9)', -0.6);
    ctx.globalAlpha = 1;
    it.screen = { x: p.x, y: p.y, r };
  }
}

// Kleine canvas voor personages in menu's (profielen, winkel, uitslag).
export class CharCanvas {
  constructor(canvas, draw) { this.canvas = canvas; this.draw = draw; this.t = 0; }
  render(dt) {
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    this.t += dt;
    this.draw(ctx, w, h, this.t);
  }
}
export { rrect, shade };
