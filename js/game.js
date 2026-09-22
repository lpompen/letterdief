// De Letterdief — schermen, spelflow en invoer.
import { VERSION, WORLDS, LEVELS, levelsFor, COLORS, SHOP, PHRASES, GRAPHEMES, WORLD_OF } from './data.js';
import { WORDS, KEYWORDS } from './words.js';
import { introduced, mastery, mulberry32 } from './learn.js';
import { LevelDirector, isReadable } from './level.js';
import { Runner, LANES } from './engine.js';
import { AudioSys, wait } from './audio.js';
import { Renderer, CharCanvas, drawHero, drawSnaai, drawEmoji, FONT } from './render.js';
import { load, save, newProfile, today, isUnlocked } from './storage.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const params = new URLSearchParams(location.search);
const QA = params.has('qa');

// Kleine diagnose van de laatste sessie, zonder spelersnamen of voortgang.
const runLog = [];
function logRun(event, detail = {}) {
  const entry = { time: new Date().toISOString(), version: VERSION, event, ...detail };
  runLog.push(entry);
  if (runLog.length > 150) runLog.shift();
  try { localStorage.setItem('letterdief-latest-run', JSON.stringify(runLog)); } catch (e) { /* opslag vol */ }
  if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
    fetch('./api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {});
  }
}
addEventListener('error', e => logRun('error', { message: e.message, file: e.filename?.split('/').pop(), line: e.lineno }));
addEventListener('unhandledrejection', e => logRun('rejection', { message: String(e.reason?.stack || e.reason).slice(0, 2500) }));

const audio = new AudioSys();
const renderer = new Renderer($('#world'));
const S = {
  data: load(), profile: null, screen: 'title', world: 0, run: null, t: 0, speed: 1,
  view: { t: 0, look: { color: COLORS[0] } }, chars: [], unlocked: false, autoplay: false,
};
const wordByW = Object.fromEntries(WORDS.map(w => [w.w, w]));

// ---------------- hulpjes ----------------
function show(name) {
  S.screen = name;
  logRun('screen', { screen: name });
  $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== 'scr-' + name));
  $('#hud').classList.toggle('hidden', name !== 'run');
  S.chars = S.chars.filter(c => c.canvas.isConnected && !c.canvas.closest('.hidden'));
}
function persist() { save(S.data); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }
function lookOf(p) { return { color: p.color, ...p.look }; }
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function claim(canvas) { S.chars = S.chars.filter(x => x.canvas !== canvas && x.canvas.isConnected); }
function heroCanvas(canvas, getLook, opts = {}) {
  claim(canvas);
  const c = new CharCanvas(canvas, (ctx, w, h, t) => {
    const size = Math.min(w, h * 0.9) * (opts.scale || 0.62);
    const hop = opts.hop ? Math.abs(Math.sin(t * 3)) * h * 0.04 : 0;
    drawHero(ctx, w / 2, h * 0.93 - hop, size, getLook(), { facing: 'front', phase: opts.run ? t * 8 : 0, mood: opts.mood || 'happy', blink: (t % 3.2) < 0.12 });
  });
  S.chars.push(c);
  return c;
}
function snaaiCanvas(canvas, pose = 'taunt', opts = {}) {
  claim(canvas);
  const c = new CharCanvas(canvas, (ctx, w, h, t) => {
    drawSnaai(ctx, w / 2, h * 0.95, Math.min(w, h) * (opts.scale || 0.55), { pose: typeof pose === 'function' ? pose() : pose, phase: t * 6, look: Math.sin(t) * 0.5, sack: opts.sack ?? 1 });
  });
  S.chars.push(c);
  return c;
}
const worldOfWord = w => Math.max(...w.g.map(g => WORLD_OF[g] ?? 0));
const unlockedWorld = w => w === 0 || S.data.settings.allOpen || (S.profile && (S.profile.stars[`w${w - 1}l6`] || 0) > 0);

// ---------------- opstarten ----------------
async function boot() {
  const versionBadge = document.createElement('span');
  versionBadge.id = 'app-version'; versionBadge.textContent = 'v' + VERSION;
  $('#app').appendChild(versionBadge);
  document.title = 'De Letterdief · v' + VERSION;
  logRun('boot', { qa: QA });
  renderer.resize();
  renderer.setTheme(WORLDS[0]);
  addEventListener('resize', () => { renderer.resize(); if (S.screen === 'map') renderMap(); });
  $('#parent-version').textContent = 'v' + VERSION;
  snaaiCanvas($('.title-snaai'), () => ((S.t % 4) < 2 ? 'taunt' : 'run'), { scale: 0.62 });
  requestAnimationFrame(loop);
  const fontsReady = document.fonts ? Promise.race([document.fonts.load(`700 40px ${FONT}`), wait(2500)]) : Promise.resolve();
  await Promise.all([audio.init(), fontsReady]);
  logRun('audio-ready', { clips: Object.keys(audio.clips).length });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  $('#loadinfo').textContent = ios && !standalone ? 'Tip voor ouders: Deel ⬆︎ → Zet op beginscherm, dan werkt het spel ook zonder internet.' : '';
  audio.setMuted(!S.data.settings.sound);
  audio.setMusic(S.data.settings.music);
  bindUI();
  registerSW();
  if (QA) exposeQA();
}

function registerSW() {
  if (!('serviceWorker' in navigator) || params.has('dev') || QA) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    S.swReady = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.ready.then(() => { S.swReady = true; });
  }).catch(e => console.warn('sw', e));
}

// Eerste tik: geluid vrijgeven (iOS) en de vaste fragmenten laden.
function unlockAudio() {
  audio.unlock();
  if (S.unlocked) return;
  S.unlocked = true;
  const fixed = Object.keys(PHRASES).concat(GRAPHEMES.map(g => 'k:' + g));
  audio.load(fixed);
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* niet ondersteund */ }
}

// ---------------- UI koppelen ----------------
function bindUI() {
  document.addEventListener('pointerdown', () => { if (S.unlocked) audio.unlock(); }, { passive: true });
  $('#btn-start').addEventListener('click', () => { unlockAudio(); audio.sfx('pop'); goProfiles(true); });
  $('#btn-new-back').addEventListener('click', () => { audio.sfx('tap'); goProfiles(); });
  $('#btn-new-ok').addEventListener('click', () => { audio.sfx('pop'); createProfile(); });
  $('#btn-profiles').addEventListener('click', () => { audio.sfx('tap'); goProfiles(); });
  $('#world-prev').addEventListener('click', () => { if (S.world > 0) { S.world--; audio.sfx('tap'); renderMap(); } });
  $('#world-next').addEventListener('click', () => { if (S.world < WORLDS.length - 1 && unlockedWorld(S.world + 1)) { S.world++; audio.sfx('tap'); renderMap(); } else audio.sfx('boing'); });
  $('#btn-book').addEventListener('click', () => { audio.sfx('tap'); goBook(); });
  $('#btn-shop').addEventListener('click', () => { audio.sfx('tap'); goShop(); });
  $('#btn-endless').addEventListener('click', () => { audio.sfx('pop'); startEndless(); });
  $$('.back').forEach(b => b.addEventListener('click', () => { audio.sfx('tap'); audio.stopSpeech(); goMap(); }));
  $$('[data-gate="parent"]').forEach(b => b.addEventListener('click', () => { audio.sfx('tap'); gate(goParent); }));
  $('#btn-pause').addEventListener('click', () => pauseRun());
  $('#btn-replay').addEventListener('click', () => replayPrompt());
  const cv = $('#world');
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('pointercancel', () => (S.ptr = null));
  addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (S.run && ['play', 'steal', 'celebrate', 'catch'].includes(S.run.state)) pauseRun(); audio.stopSpeech(); audio.suspend(); }
  });
}

// ---------------- profielen ----------------
function goProfiles(fromTitle = false) {
  const list = $('#profile-list');
  list.innerHTML = '';
  if (!S.data.profiles.length) return goNewProfile();
  if (fromTitle && S.data.profiles.length === 1) return pickProfile(S.data.profiles[0]);
  show('profiles');
  for (const p of S.data.profiles) {
    const b = el('button', 'profile');
    const c = el('canvas'); b.appendChild(c); b.appendChild(el('span', 'pname', p.name || ''));
    b.addEventListener('click', () => { audio.sfx('pop'); pickProfile(p); });
    list.appendChild(b);
    heroCanvas(c, () => lookOf(p), { hop: true });
  }
  if (S.data.profiles.length < 4) {
    const add = el('button', 'profile add', '＋');
    add.setAttribute('aria-label', 'Nieuwe speler');
    add.addEventListener('click', () => { audio.sfx('tap'); goNewProfile(); });
    list.appendChild(add);
  }
  audio.say(['wie']);
}
let newColor = COLORS[0];
function goNewProfile() {
  show('newprofile');
  const used = S.data.profiles.map(p => p.color);
  newColor = COLORS.find(c => !used.includes(c)) || COLORS[0];
  const list = $('#color-list');
  list.innerHTML = '';
  for (const c of COLORS) {
    const d = el('button', 'color-dot' + (c === newColor ? ' on' : ''));
    d.style.background = c; d.setAttribute('aria-label', 'Kleur');
    d.addEventListener('click', () => { newColor = c; audio.sfx('pop'); $$('.color-dot').forEach(x => x.classList.toggle('on', x === d)); });
    list.appendChild(d);
  }
  heroCanvas($('#new-hero'), () => ({ color: newColor }), { hop: true, scale: 0.7 });
  $('#btn-new-back').classList.toggle('hidden', !S.data.profiles.length);
  audio.say(['nieuw_monster']);
}
function createProfile() {
  const p = newProfile(S.data.profiles.length, newColor);
  p.learner.diff = S.data.settings.startDiff;
  S.data.profiles.push(p);
  persist();
  pickProfile(p);
}
function pickProfile(p) {
  S.profile = p; S.data.active = p.id;
  S.view.look = lookOf(p);
  const day = today();
  const returning = p.days.length && !p.days.includes(day);
  if (!p.days.includes(day)) { p.days.push(day); if (p.days.length > 400) p.days.shift(); }
  if (p.playDay !== day) { p.playDay = day; p.playMsToday = 0; }
  persist();
  // Begin op de wereld waar het kind nu is.
  S.world = 0;
  for (let w = 0; w < WORLDS.length; w++) if (unlockedWorld(w)) S.world = w;
  goMap(returning ? ['welkom_terug'] : p.created > Date.now() - 5000 ? ['welkom', 'kaart'] : ['kaart']);
}

// ---------------- kaart ----------------
function goMap(say = null) {
  endRun();
  show('map');
  renderMap();
  audio.music(S.world);
  if (say) audio.say(say);
}
function renderMap() {
  const p = S.profile, w = S.world, levels = levelsFor(w);
  renderer.setTheme(WORLDS[w]);
  $('#world-name').textContent = WORLDS[w].icon + ' ' + WORLDS[w].name;
  $('#map-coins').textContent = p.coins;
  $('#world-prev').style.visibility = w > 0 ? 'visible' : 'hidden';
  $('#world-next').style.visibility = w < WORLDS.length - 1 ? 'visible' : 'hidden';
  $('#world-next').style.opacity = unlockedWorld(w + 1) ? 1 : 0.4;
  const box = $('#map-path');
  box.innerHTML = '';
  const r = box.getBoundingClientRect();
  const portrait = r.height > r.width * 1.05;
  const pts = portrait
    ? [[0.28, 0.9], [0.7, 0.78], [0.32, 0.64], [0.7, 0.5], [0.3, 0.36], [0.68, 0.22], [0.45, 0.08]]
    : [[0.08, 0.72], [0.22, 0.38], [0.37, 0.7], [0.51, 0.36], [0.65, 0.68], [0.79, 0.34], [0.92, 0.62]];
  const W = r.width, H = r.height;
  const xy = pts.map(([x, y]) => [x * W, y * H]);
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1], [x1, y1] = xy[i];
    d += ` C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
  }
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 26"/></svg>`;
  const allLevels = LEVELS;
  let current = null;
  levels.forEach((lv, i) => {
    const open = isUnlocked(p, allLevels, lv, S.data.settings.allOpen);
    const stars = p.stars[lv.id] || 0;
    if (open && !stars && current == null) current = i;
    const b = el('button', 'node' + (lv.kind === 'baas' ? ' boss' : '') + (open ? '' : ' locked'));
    b.style.left = xy[i][0] + 'px'; b.style.top = xy[i][1] + 'px';
    b.innerHTML = (open ? (lv.kind === 'baas' ? '🦝' : String(i + 1)) : '🔒') + (stars ? `<span class="stars">${'⭐'.repeat(stars)}</span>` : '');
    b.setAttribute('aria-label', 'Level ' + (i + 1));
    b.addEventListener('click', () => {
      if (!open) { audio.sfx('boing'); return; }
      unlockAudio(); audio.sfx('pop'); startLevel(lv);
    });
    box.appendChild(b);
  });
  if (current != null) box.children[current + 1].classList.add('current');
  const hi = current ?? levels.length - 1;
  const hc = el('canvas', 'map-hero');
  hc.style.left = xy[hi][0] + 'px'; hc.style.top = (xy[hi][1] - H * 0.07) + 'px';
  box.appendChild(hc);
  heroCanvas(hc, () => lookOf(p), { hop: true, scale: 0.8 });
  heroCanvas($('#btn-profiles canvas'), () => lookOf(p), { scale: 0.75 });
  $('#btn-endless').classList.toggle('hidden', !((p.stars.w0l2 || 0) > 0 || S.data.settings.allOpen));
}

// ---------------- boek ----------------
function goBook() {
  show('book');
  const p = S.profile, grid = $('#book-grid');
  grid.innerHTML = '';
  const words = WORDS.slice().sort((a, b) => worldOfWord(a) - worldOfWord(b) || a.w.localeCompare(b.w));
  let have = 0;
  for (const w of words) {
    const got = (p.stickers[w.w] || 0) > 0;
    if (got) have++;
    const t = el('button', 'tile' + (got ? '' : ' nope'), `<span class="e">${w.e}</span><span>${got ? w.w : '?'}</span>`);
    t.addEventListener('click', () => { if (got) { audio.sfx('tap'); audio.say(['z:' + w.w, 'w:' + w.w]); } else audio.sfx('boing'); });
    grid.appendChild(t);
  }
  $('#book-count').textContent = `${have} / ${WORDS.length}`;
  audio.say(['boek']);
}

// ---------------- winkel ----------------
function goShop() {
  show('shop');
  heroCanvas($('#shop-hero'), () => lookOf(S.profile), { hop: true, scale: 0.7 });
  renderShop();
  audio.say(['winkel']);
}
function renderShop() {
  const p = S.profile, grid = $('#shop-grid');
  $('#shop-coins').textContent = p.coins;
  grid.innerHTML = '';
  for (const item of SHOP) {
    const owned = p.owned.includes(item.id);
    const on = p.look[item.kind] === item.id;
    const b = el('button', 'tile shop-item' + (on ? ' on' : '') + (!owned && p.coins < item.price ? ' poor' : ''),
      `<span class="e">${item.icon}</span><span class="price">${owned ? (on ? '✔️' : '') : '🪙 ' + item.price}</span>`);
    b.addEventListener('click', () => {
      if (owned) { p.look[item.kind] = on ? null : item.id; audio.sfx('pop'); }
      else if (p.coins >= item.price) { p.coins -= item.price; p.owned.push(item.id); p.look[item.kind] = item.id; audio.sfx('fanfare'); audio.say(['gekocht']); }
      else { audio.sfx('boing'); audio.say(['te_duur']); return; }
      S.view.look = lookOf(p); persist(); renderShop();
    });
    grid.appendChild(b);
  }
}

// ---------------- overlay ----------------
function overlay(html, { onClose = null } = {}) {
  const o = $('#overlay'), panel = $('#panel');
  panel.innerHTML = '';
  if (typeof html === 'string') panel.innerHTML = html; else panel.appendChild(html);
  o.classList.remove('hidden');
  o.onclick = null;
  return panel;
}
function closeOverlay() { $('#overlay').classList.add('hidden'); $('#panel').innerHTML = ''; }
function btn(label, cls, onClick, aria) {
  const b = el('button', 'round ' + (cls || ''), label);
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', e => { e.stopPropagation(); audio.sfx('tap'); onClick(); });
  return b;
}

// Ouderslot: een som die kleuters (nog) niet kunnen.
function gate(onOk) {
  const a = 6 + Math.floor(Math.random() * 7), b = 5 + Math.floor(Math.random() * 8);
  let typed = '';
  const panel = overlay(`<p class="gate-q">Voor ouders: hoeveel is ${a} + ${b}?</p><div class="gate-in"></div><div class="keypad"></div><p class="small-note">Dit slot houdt kleine vingers uit de instellingen.</p>`);
  const pad = panel.querySelector('.keypad'), out = panel.querySelector('.gate-in');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '✖', '0', '✔'];
  for (const k of keys) {
    const kb = el('button', '', k);
    kb.addEventListener('click', () => {
      if (k === '✖') { if (!typed) return closeOverlay(); typed = typed.slice(0, -1); }
      else if (k === '✔') { if (Number(typed) === a + b) { closeOverlay(); onOk(); } else { typed = ''; out.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], 250); } }
      else if (typed.length < 3) typed += k;
      out.textContent = typed;
    });
    pad.appendChild(kb);
  }
}

// ---------------- level starten ----------------
function makeRun(kind, spec) {
  const p = S.profile, L = p.learner, st = S.data.settings;
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const rng = mulberry32(seed);
  const director = new LevelDirector(L, spec, WORDS, rng, { endless: kind === 'endless' });
  const speed = 6.2 + L.diff * 2.6 + (spec.speed || 0) * 4;
  const runner = new Runner({ rng, speed, escape: kind === 'level' && st.escape && spec.kind !== 'intro', obstacles: kind === 'endless' ? 0.75 : 0.35 + spec.idx * 0.07 + (spec.world || 0) * 0.03 });
  return { kind, spec, director, runner, rng, state: 'intro', rowToken: 0, row: null, rowAt: 0, glowAfter: null, misses: 0, lives: 3, newStickers: [], startedAt: performance.now(), over: false, tutorial: false };
}
async function startLevel(spec) {
  logRun('level-start', { level: spec.id });
  const run = makeRun('level', spec);
  S.run = run;
  renderer.setTheme(WORLDS[spec.world]);
  S.view = { t: S.view.t, look: lookOf(S.profile), sack: 1, snaaiX: 0 };
  show('run');
  $('#lives').classList.add('hidden');
  hudDots(run);
  $('#wordcard').classList.add('hidden');
  const words = run.director.items.map(i => i.word.w);
  const lees = run.director.items.some(i => i.mode === 'lees');
  audio.load(words.flatMap(w => ['w:' + w, 'z:' + w]));
  if (lees) audio.load(WORDS.filter(w => isReadable(S.profile.learner, w)).map(w => 'w:' + w.w));
  audio.music(spec.world);
  // Eerste keer ooit: het verhaal.
  if (!S.profile.story) { await storyIntro(run); S.profile.story = true; persist(); }
  if (run !== S.run) return;
  for (const g of run.director.fresh) { await newLetter(run, g); if (run !== S.run) return; }
  if (spec.kind === 'baas') {
    const say = run.director.items[0]?.mode === 'lees' ? ['baas_intro', 's_baas'] : ['baas_klank', 's_baas'];
    audio.say(say);
  }
  run.tutorial = !S.profile.tutorialDone;
  run.state = 'play';
  run.runner.speed = run.runner.baseSpeed * 0.5;
  if (run.tutorial) { await audio.say(['uitleg_tik']); if (run !== S.run) return; }
  beginItem(run);
}
async function startEndless() {
  unlockAudio();
  const L = S.profile.learner;
  const maxWorld = Math.max(0, ...introduced(L).map(g => WORLD_OF[g] ?? 0));
  const spec = { kind: 'klank', world: maxWorld, idx: 3, focus: introduced(L), pos: 'any', review: true, words: 3, speed: 0.15, gaps: 1, id: 'endless' };
  if (!spec.focus.length) spec.focus = ['m', 's'];
  const run = makeRun('endless', spec);
  run.runner.escape = false;
  S.run = run;
  renderer.setTheme(WORLDS[maxWorld]);
  S.view = { t: S.view.t, look: lookOf(S.profile), sack: 1, snaaiX: 0 };
  show('run');
  $('#lives').classList.remove('hidden');
  hudLives(run);
  $('#dots').innerHTML = '';
  audio.music(maxWorld);
  await audio.say(['vrij']);
  if (run !== S.run) return;
  run.state = 'play';
  beginItem(run);
}
function endRun() {
  if (S.run) { S.run.over = true; S.run.runner.rows = []; }
  S.run = null;
  closeOverlay();
  $('#flyers').innerHTML = '';
  $$('.hand').forEach(h => h.remove());
}

async function storyIntro(run) {
  const wrap = el('div');
  const c = el('canvas', 'panel-char'); wrap.appendChild(c);
  const panel = overlay(wrap);
  panel.style.gap = '12px';
  snaaiCanvas(c, () => ((S.t % 2.4) < 1.2 ? 'taunt' : 'throw'));
  const go = btn('▶', 'go', () => { closeOverlay(); audio.stopSpeech(); done(); }, 'Verder');
  const row = el('div', 'panel-buttons'); row.appendChild(go); panel.appendChild(row);
  let done;
  const finished = new Promise(r => (done = r));
  audio.say(['intro1', 's_hihi', 'intro2', 'intro3']).then(ok => { if (ok) go.classList.add('pulse'); });
  await finished;
}

// Nieuwe letter: expliciet voordoen, zoals de juf dat doet.
async function newLetter(run, g) {
  const key = wordByW[KEYWORDS[g]] || WORDS.find(w => w.g.includes(g));
  const wordHtml = key ? key.g.map(x => (x === g ? `<b>${x}</b>` : x)).join('') : '';
  const panel = overlay(`<div class="gain">⭐ ⭐ ⭐</div><div class="big-letter" role="button">${g}</div>${key ? `<div class="key-word"><span class="e">${key.e}</span><span>${wordHtml}</span></div>` : ''}`);
  panel.querySelector('.gain').textContent = '✨';
  const seq = ['nieuwe_letter', 'dit_is_de', 'k:' + g].concat(key ? ['van', 'w:' + key.w, 0.3, 'k:' + g] : []);
  panel.querySelector('.big-letter').addEventListener('click', () => { audio.sfx('tap'); audio.say(['k:' + g]); });
  const kw = panel.querySelector('.key-word');
  if (kw) kw.addEventListener('click', () => audio.say(['w:' + key.w]));
  const row = el('div', 'panel-buttons');
  row.appendChild(btn('🔊', '', () => audio.say(seq), 'Nog eens'));
  let done;
  const finished = new Promise(r => (done = r));
  row.appendChild(btn('▶', 'go', () => { closeOverlay(); audio.stopSpeech(); done(); }, 'Verder'));
  panel.appendChild(row);
  audio.sfx('sparkle');
  audio.say(seq);
  await finished;
}

// ---------------- HUD ----------------
function hudDots(run) {
  const d = $('#dots'); d.innerHTML = '';
  run.director.items.forEach(() => d.appendChild(el('i')));
}
function hudLives(run) { $('#lives').textContent = '❤️'.repeat(Math.max(0, run.lives)) + '🤍'.repeat(Math.max(0, 3 - run.lives)); }
function renderCard(run, { stolen = true } = {}) {
  const it = run.director.item;
  const card = $('#wordcard');
  if (!it) return;
  card.classList.remove('hidden', 'big');
  card.classList.toggle('read', it.mode === 'lees');
  card.querySelector('.pic').textContent = it.word.e;
  const slots = card.querySelector('.slots');
  slots.innerHTML = '';
  const filled = run.director.filled[run.director.itemIdx];
  const activeIndex = run.director.target && run.director.target.index;
  it.word.g.forEach((g, i) => {
    const gap = stolen && it.gaps.includes(i) && !filled.has(i);
    const s = el('span', 'slot' + (gap ? ' gap' : '') + (gap && i === activeIndex ? ' active' : ''), g);
    s.dataset.i = i;
    slots.appendChild(s);
  });
}
function slotEl(i) { return $(`#wordcard .slot[data-i="${i}"]`); }
function flyer(text, from, to, { size = 60, cls = '' } = {}) {
  return new Promise(res => {
    const f = el('div', 'flyer ' + cls, text);
    f.style.fontSize = size + 'px';
    f.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%)`;
    $('#flyers').appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(${to.scale || 1})`;
      if (to.fade) f.style.opacity = '0';
    }));
    setTimeout(() => { f.remove(); res(); }, 650);
  });
}
const center = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

// ---------------- spelverloop ----------------
// Toestand zetten; tijdens de pauze onthouden we hem voor daarna.
function setState(run, state) { if (run.state === 'paused') run.resume = state; else run.state = state; }
async function hold(run) { while (run.state === 'paused' && !run.over) await wait(120); }
async function beginItem(run) {
  if (run !== S.run || run.over) return;
  const it = run.director.item;
  if (!it) return finishChase(run);
  setState(run, 'steal');
  run.runner.mode = 'cruise';
  // Snaai pikt de letters (bij lezen: hij heeft het plaatje ingepikt).
  renderCard(run, { stolen: false });
  await wait(450);
  await hold(run);
  if (run !== S.run) return;
  const snaai = S.view.snaaiScreen || { x: renderer.W / 2, y: renderer.H * 0.45 };
  audio.sfx('whoosh');
  if (it.mode === 'lees') {
    const pic = $('#wordcard .pic');
    flyer(it.word.e, center(pic), { x: snaai.x, y: snaai.y, scale: 0.3, fade: true }, { size: 70 });
  } else {
    for (const i of it.gaps) flyer(it.word.g[i], center(slotEl(i)), { x: snaai.x, y: snaai.y, scale: 0.3, fade: true });
  }
  if (run.rng() < 0.35) setTimeout(() => audio.sfx('giggle'), 300);
  await wait(250);
  renderCard(run, { stolen: true });
  await wait(350);
  await hold(run);
  if (run !== S.run || run.over) return;
  setState(run, 'play');
  run.runner.mode = 'run';
  nextRow(run);
}
async function nextRow(run, { repeat = false } = {}) {
  if (run !== S.run || run.over || run.state !== 'play') return;
  const r = run.director.nextRow({ repeat });
  if (!r) return;
  const token = ++run.rowToken;
  renderCard(run);
  run.prompt = r.prompt;
  const prompt = repeat && r.prompt.length ? ['luister'].concat(r.prompt) : r.prompt;
  audio.say(prompt);
  await wait(prompt.length ? 700 : 250);
  if (token !== run.rowToken || run !== S.run || run.state !== 'play') return;
  run.row = run.runner.throwRow(r.options);
  run.rowAt = run.runner.t;
  run.glowAfter = run.tutorial && run.director.answered < 2 ? 1 : r.glowAfter;
  if (run.misses >= 2) run.glowAfter = 0.3;
  audio.sfx('throw');
  if (run.tutorial && run.director.answered < 2) showHand(run);
}
function showHand(run) {
  $$('.hand').forEach(h => h.remove());
  const target = run.row && run.row.items.find(i => i.correct);
  if (!target) return;
  const p = renderer.project(LANES[target.lane], 0, 0);
  const h = el('div', 'hand', '👆');
  h.style.left = (p.x - 40) + 'px'; h.style.top = (p.y - 30) + 'px';
  $('#app').appendChild(h);
  setTimeout(() => h.remove(), 3500);
}
function replayPrompt() {
  const run = S.run;
  audio.sfx('tap');
  if (!run || run.over) return;
  audio.say(run.director.replay());
}

function handleEvents(run) {
  for (const e of run.runner.drain()) {
    switch (e.type) {
      case 'catch': onCatch(run, e.item); break;
      case 'miss': onMiss(run); break;
      case 'hit':
        audio.sfx('hit'); renderer.shake = 0.35;
        run.runner.snaaiHitT = run.runner.t;
        if (run.kind === 'endless') { run.lives--; hudLives(run); if (run.lives <= 0) endlessOver(run); }
        if (!S.profile.jumpHint) { S.profile.jumpHint = true; audio.say(['uitleg_spring']); }
        else if (run.rng() < 0.3) audio.sfx('giggle');
        break;
      case 'hop': audio.sfx('jump'); break;
      case 'coin': audio.sfx('coin'); $('#coins b').textContent = run.runner.coinCount; break;
      case 'jump': audio.sfx('jump'); break;
      case 'land': audio.sfx('land'); break;
      case 'escaped': onEscaped(run); break;
    }
  }
}
async function onCatch(run, item) {
  $$('.hand').forEach(h => h.remove());
  run.misses = 0;
  const res = run.director.answer(item.label);
  if (!res) return;
  const token = ++run.rowToken;
  const at = item.screen || { x: renderer.W / 2, y: renderer.H * 0.7 };
  if (!res.correct) {
    audio.sfx('boing');
    renderer.burst(at.x, at.y, '#9aa9c4', 8);
    run.runner.nudge(0.02);
    run.runner.snaaiHitT = run.runner.t;
    await audio.say(res.feedback);
    await hold(run);
    if (token !== run.rowToken) return;
    await wait(200);
    return nextRow(run);
  }
  S.profile.tutorialDone = S.profile.tutorialDone || run.director.answered >= 2;
  audio.sfx('ding'); audio.sfx('pop');
  renderer.burst(at.x, at.y, '#ffd43b', 16);
  run.runner.nudge(res.firstTry ? -0.1 : -0.05);
  if (res.mode === 'lees') S.view.sack = Math.max(0.1, 1 - run.director.done.length / run.director.items.length);
  if (res.fill != null) {
    // De kaart niet opnieuw opbouwen: na de laatste letter wijst de regisseur al naar het volgende woord.
    const slot = slotEl(res.fill);
    if (slot) {
      slot.classList.remove('active');
      await flyer(item.label, at, center(slot), { size: 64 });
      slot.classList.remove('gap');
      slot.classList.add('new');
      const t = !res.wordDone && run.director.target;
      if (t && t.index != null) { const nx = slotEl(t.index); if (nx) nx.classList.add('active'); }
    }
  }
  if (res.wordDone) return celebrate(run, res);
  await audio.say(res.feedback);
  if (token !== run.rowToken) return;
  nextRow(run);
}
function onMiss(run) {
  run.misses++;
  const token = ++run.rowToken;
  setTimeout(() => { if (token === run.rowToken) nextRow(run, { repeat: true }); }, 350);
}
async function celebrate(run, res) {
  setState(run, 'celebrate');
  run.runner.mode = 'cruise';
  const word = res.word;
  const p = S.profile;
  const isNew = !(p.stickers[word.w] > 0);
  p.stickers[word.w] = (p.stickers[word.w] || 0) + 1;
  if (isNew) run.newStickers.push(word);
  // Lees-modus: plaatje terug op de kaart.
  const card = $('#wordcard');
  card.classList.remove('read');
  card.querySelector('.pic').textContent = word.e;
  $$('#wordcard .slot').forEach(s => s.classList.remove('gap', 'active'));
  card.classList.add('big');
  const dots = $$('#dots i'); if (dots[run.director.done.length - 1]) dots[run.director.done.length - 1].classList.add('done');
  audio.sfx('sparkle');
  await audio.say(res.feedback, { onClip: (key, dur) => highlight(key, dur, word) });
  await hold(run);
  if (run !== S.run || run.over) return;
  card.classList.remove('big');
  $$('#wordcard .slot').forEach(s => s.classList.remove('lit'));
  persist();
  await wait(250);
  if (run.director.finished && run.kind === 'level') return finishChase(run);
  setState(run, 'play');
  beginItem(run);
}
function highlight(key, dur, word) {
  const slots = $$('#wordcard .slot');
  if (key.startsWith('z:')) {
    const t = audio.timing(key);
    // Natuurlijk uitgesproken woorden hebben geen betrouwbare lettertijdstippen.
    if (!t) {
      slots.forEach(s => s.classList.add('lit'));
      setTimeout(() => slots.forEach(s => s.classList.remove('lit')), dur * 1000);
      return;
    }
    slots.forEach((s, i) => {
      setTimeout(() => { slots.forEach(x => x.classList.remove('lit')); s.classList.add('lit'); }, (t[i] || 0) * dur * 1000);
    });
    setTimeout(() => slots.forEach(x => x.classList.remove('lit')), dur * 1000);
  } else if (key.startsWith('w:')) {
    slots.forEach(s => s.classList.add('lit'));
    setTimeout(() => slots.forEach(x => x.classList.remove('lit')), dur * 1000 + 150);
  }
}
async function finishChase(run) {
  if (run.kind !== 'level') return;
  setState(run, 'catch');
  $('#wordcard').classList.add('hidden');
  run.runner.startCatch();
  audio.say(['s_moe', 'pak_hem']);
  run.catchAt = performance.now();
  setTimeout(() => {
    if (S.run === run && run.state === 'catch' && S.view.snaaiScreen) {
      const h = el('div', 'hand', '👆');
      h.style.left = (S.view.snaaiScreen.x - 40) + 'px'; h.style.top = (S.view.snaaiScreen.y) + 'px';
      $('#app').appendChild(h);
    }
  }, 3200);
}
async function catchSnaai(run) {
  if (run.state !== 'catch') return;
  run.state = 'caught';
  $$('.hand').forEach(h => h.remove());
  run.runner.catchSnaai();
  S.view.caughtT = 0;
  audio.sfx('net');
  await wait(400);
  audio.sfx('fanfare');
  await audio.say(['hebbes', 's_sorry']);
  if (run !== S.run) return;
  S.view.happySnaai = true;
  await wait(500);
  showResult(run);
}
function onEscaped(run) {
  run.state = 'escaped';
  audio.say(['s_haha', 'ontsnapt']);
  const wrap = el('div');
  const c = el('canvas', 'panel-char'); wrap.appendChild(c);
  const panel = overlay(wrap);
  snaaiCanvas(c, 'taunt');
  const row = el('div', 'panel-buttons');
  row.appendChild(btn('🗺️', '', () => goMap(), 'Naar de kaart'));
  row.appendChild(btn('↻', 'go', () => { closeOverlay(); startLevel(run.spec); }, 'Opnieuw'));
  panel.appendChild(row);
}

function addPlayTime(run) {
  const p = S.profile;
  const ms = performance.now() - run.startedAt;
  p.playedMs = (p.playedMs || 0) + ms;
  if (p.playDay !== today()) { p.playDay = today(); p.playMsToday = 0; }
  p.playMsToday = (p.playMsToday || 0) + ms;
}
function overLimit() {
  const lim = S.data.settings.playLimit;
  return lim > 0 && (S.profile.playMsToday || 0) > lim * 60000;
}

function showResult(run) {
  run.state = 'done';
  const p = S.profile, spec = run.spec;
  addPlayTime(run);
  const stars = run.director.stars;
  const before = p.stars[spec.id] || 0;
  p.stars[spec.id] = Math.max(before, stars);
  const gained = run.runner.coinCount + stars * 5;
  p.coins += gained;
  const worldDone = spec.kind === 'baas' && !before;
  const finale = worldDone && spec.world === WORLDS.length - 1;
  persist();
  const wrap = el('div');
  wrap.innerHTML = `<div class="stars-row"><span>⭐</span><span>⭐</span><span>⭐</span></div><div class="gain">🪙 +${gained}</div>`;
  if (run.newStickers.length) {
    const st = el('div', 'stickers');
    for (const w of run.newStickers) st.appendChild(el('span', '', `<i>${w.e}</i>${w.w}`));
    wrap.appendChild(st);
  }
  const panel = overlay(wrap);
  const row = el('div', 'panel-buttons');
  const levels = LEVELS, i = levels.indexOf(levels.find(l => l.id === spec.id));
  const next = levels[i + 1];
  row.appendChild(btn('🗺️', '', () => goMap(worldDone && next ? ['wereld_open'] : null), 'Naar de kaart'));
  row.appendChild(btn('↻', '', () => { closeOverlay(); startLevel(spec); }, 'Nog een keer'));
  if (next && !finale) row.appendChild(btn('▶', 'go', () => {
    closeOverlay();
    if (overLimit()) return pauseLimit();
    if (next.world !== spec.world) { S.world = next.world; return goMap(['wereld_open']); }
    startLevel(next);
  }, 'Volgende'));
  panel.appendChild(row);
  const starEls = panel.querySelectorAll('.stars-row span');
  (async () => {
    for (let k = 0; k < stars; k++) { await wait(380); starEls[k].classList.add('on'); audio.sfx('star'); }
    await wait(300);
    const say = ['ster' + stars];
    if (run.newStickers.length) say.push('sticker');
    await audio.say(say);
    if (finale) showFinale();
    else if (overLimit()) pauseLimit();
  })();
}
function showFinale() {
  S.profile.finale = true; persist();
  const wrap = el('div');
  const c1 = el('canvas', 'panel-char'); wrap.appendChild(c1);
  const panel = overlay(wrap);
  snaaiCanvas(c1, 'happy');
  for (let i = 0; i < 40; i++) setTimeout(() => renderer.burst(Math.random() * renderer.W, Math.random() * renderer.H * 0.6, ['#ffd43b', '#ff6fb5', '#4cc9f0', '#80d858'][i % 4], 10), i * 90);
  audio.sfx('fanfare');
  audio.say(['einde', 's_leren', 'snaai_leert']);
  const row = el('div', 'panel-buttons');
  row.appendChild(btn('🗺️', 'go', () => goMap(), 'Naar de kaart'));
  panel.appendChild(row);
}
function pauseLimit() {
  const wrap = el('div');
  const c = el('canvas', 'panel-char'); wrap.appendChild(c);
  const panel = overlay(wrap);
  snaaiCanvas(c, 'tired');
  audio.say(['pauze']);
  const row = el('div', 'panel-buttons');
  row.appendChild(btn('🗺️', 'go', () => goMap(), 'Naar de kaart'));
  row.appendChild(btn('⚙️', 'small', () => gate(() => { S.profile.playMsToday = 0; persist(); goMap(); }), 'Ouders: toch doorspelen'));
  panel.appendChild(row);
}
function endlessOver(run) {
  run.state = 'done';
  run.runner.mode = 'escaped';
  addPlayTime(run);
  const p = S.profile;
  const meters = Math.round(run.runner.dist);
  const record = meters > (p.best || 0);
  if (record) p.best = meters;
  p.coins += run.runner.coinCount;
  persist();
  const panel = overlay(`<div class="gain">🏃 ${meters} m</div><div class="gain">🪙 +${run.runner.coinCount}</div><div class="gain">🏆 ${p.best} m</div>`);
  if (run.newStickers.length) {
    const st = el('div', 'stickers');
    for (const w of run.newStickers) st.appendChild(el('span', '', `<i>${w.e}</i>${w.w}`));
    panel.appendChild(st);
  }
  const row = el('div', 'panel-buttons');
  row.appendChild(btn('🗺️', '', () => goMap(), 'Naar de kaart'));
  row.appendChild(btn('↻', 'go', () => { closeOverlay(); startEndless(); }, 'Nog een keer'));
  panel.appendChild(row);
  audio.say(record ? ['record'] : ['klaar_vrij']);
}
function pauseRun() {
  const run = S.run;
  if (!run || run.over || run.state === 'paused' || run.state === 'done') return;
  audio.sfx('tap');
  run.resume = run.state;
  run.state = 'paused';
  audio.stopSpeech();
  const panel = overlay('<div class="gain">⏸</div>');
  const row = el('div', 'panel-buttons');
  row.appendChild(btn('🗺️', '', () => { addPlayTime(run); persist(); goMap(); }, 'Stoppen'));
  row.appendChild(btn('▶', 'go', () => {
    closeOverlay(); audio.unlock(); run.state = run.resume || 'play';
    if (run.state === 'play') { run.rowToken++; if (!run.runner.busy) nextRow(run, { repeat: true }); else audio.say(run.director.replay()); }
  }, 'Verder'));
  panel.appendChild(row);
}

// ---------------- oudermenu ----------------
function goParent(tabId = null) {
  show('parent');
  const body = $('#parent-body');
  const st = S.data.settings;
  const p = S.data.profiles.find(x => x.id === tabId) || S.profile || S.data.profiles[0];
  body.innerHTML = '';
  if (S.data.profiles.length > 1) {
    const tabs = el('div', 'ptabs');
    for (const q of S.data.profiles) {
      const b = el('button', q === p ? 'on' : '', (q.name || 'Speler') + ' ●');
      b.style.color = q === p ? '#fff' : q.color;
      b.addEventListener('click', () => goParent(q.id));
      tabs.appendChild(b);
    }
    body.appendChild(tabs);
  }
  if (p) {
    const L = p.learner;
    const totalStars = Object.values(p.stars).reduce((a, b) => a + b, 0);
    const stickers = Object.keys(p.stickers).length;
    const lees = Object.entries(L.words).filter(([, s]) => s.c > 0).length;
    const sec = el('section');
    sec.innerHTML = `<h3>Speler</h3>
      <label>Naam (verschijnt onder het monster) <input type="text" maxlength="14" value="${(p.name || '').replace(/"/g, '')}"></label>
      <p>⭐ ${totalStars} sterren · 📖 ${stickers} van ${WORDS.length} woorden verzameld · ${lees} verschillende woorden goed gelezen/gebouwd · 🪙 ${p.coins} munten · 🏃 record ${p.best || 0} m</p>
      <p>Vandaag gespeeld: ${Math.round((p.playDay === today() ? p.playMsToday || 0 : 0) / 60000)} min · totaal ${Math.round((p.playedMs || 0) / 60000)} min · ${p.days.length} ${p.days.length === 1 ? 'dag' : 'dagen'} gespeeld · moeilijkheid nu ${Math.round(L.diff * 100)}%</p>`;
    sec.querySelector('input').addEventListener('change', e => { p.name = e.target.value.trim(); persist(); });
    body.appendChild(sec);
    const ms = el('section');
    ms.innerHTML = '<h3>Klanken</h3><p class="small-note">Hoe goed kent je kind elke klank? Groen = zit goed (≥ 80%), oranje = oefent nog, rood = lastig. Grijs = nog niet aangeboden.</p>';
    const grid = el('div', 'mastery');
    for (const g of GRAPHEMES) {
      const s = L.g[g];
      const d = el('div');
      if (s && !s.n) {
        d.style.background = '#e3eefc';
        d.innerHTML = `<b>${g}</b><small>nieuw</small>`;
      } else if (s) {
        const pc = Math.round(s.p * 100);
        d.style.background = s.p >= 0.8 ? '#c9f2d7' : s.p >= 0.5 ? '#ffe7b8' : '#ffd0cc';
        d.innerHTML = `<b>${g}</b><small>${pc}% · ${s.c}/${s.n}</small>`;
      } else d.innerHTML = `<b style="opacity:.35">${g}</b><small>—</small>`;
      grid.appendChild(d);
    }
    ms.appendChild(grid);
    const conf = Object.entries(L.conf).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (conf.length) ms.appendChild(el('p', '', 'Vaakst verwisseld: ' + conf.map(([k, n]) => `${k.replace('>', ' ↔ ')} (${n}×)`).join(', ')));
    body.appendChild(ms);
  }
  const set = el('section');
  set.innerHTML = `<h3>Instellingen</h3>
    <label>Muziek <input type="checkbox" data-k="music" ${st.music ? 'checked' : ''}></label>
    <label>Geluid en stem <input type="checkbox" data-k="sound" ${st.sound ? 'checked' : ''}></label>
    <label>Snaai kan ontsnappen bij veel botsingen (uitdaging) <input type="checkbox" data-k="escape" ${st.escape ? 'checked' : ''}></label>
    <label>Alle werelden open (voor kinderen die al letters kennen) <input type="checkbox" data-k="allOpen" ${st.allOpen ? 'checked' : ''}></label>
    <label>Speeltijd per dag <select data-k="playLimit">${[10, 15, 20, 30, 45, 0].map(v => `<option value="${v}" ${st.playLimit === v ? 'selected' : ''}>${v ? v + ' minuten' : 'geen grens'}</option>`).join('')}</select></label>
    ${p ? `<label>Moeilijkheid van ${p.name || 'deze speler'} (past zich daarna zelf aan) <select data-k="diff"><option value="0.15">makkelijk (4 jaar)</option><option value="0.3">normaal (5 jaar)</option><option value="0.55">pittig (6 jaar, groep 3)</option></select></label>` : ''}`;
  set.querySelectorAll('input[type=checkbox]').forEach(i => i.addEventListener('change', () => {
    st[i.dataset.k] = i.checked; persist();
    audio.setMuted(!st.sound); audio.setMusic(st.music);
  }));
  set.querySelector('select[data-k=playLimit]').addEventListener('change', e => { st.playLimit = Number(e.target.value); persist(); });
  const ds = set.querySelector('select[data-k=diff]');
  if (ds && p) {
    const v = p.learner.diff < 0.22 ? '0.15' : p.learner.diff < 0.45 ? '0.3' : '0.55';
    ds.value = v;
    ds.addEventListener('change', e => { p.learner.diff = Number(e.target.value); st.startDiff = p.learner.diff; persist(); });
  }
  body.appendChild(set);
  const info = el('section');
  info.innerHTML = `<h3>Op de iPad zetten (offline)</h3>
    <p>1. Open deze pagina één keer in Safari mét internet en wacht tot hieronder "Offline klaar" staat.<br>2. Tik op <b>Deel</b> (vierkantje met pijl) → <b>Zet op beginscherm</b>.<br>3. Start De Letterdief voortaan vanaf het beginscherm; hij werkt dan zonder internet.</p>
    <p>Status: <b>${S.swReady ? '✅ Offline klaar' : navigator.onLine ? '⏳ nog bezig of niet beschikbaar in deze modus' : '📴 offline'}</b> · versie ${VERSION}</p>
    <h3>Over het spel</h3>
    <p class="small-note">De letters volgen de volgorde van Veilig Leren Lezen (kim-versie). Het spel zegt klanken (mmm) en geen letternamen (em), past de moeilijkheid aan naar ongeveer 80% goed, en doet het goede antwoord voor. Advies: 10–15 minuten per dag. Woorden en zinnen: Nederlandse stemmen Fenna en Maarten. Losse klanken: fonetische spraak. Alle opnamen werken offline. Lettertype Andika (SIL OFL).</p>`;
  body.appendChild(info);
  const danger = el('section');
  danger.innerHTML = '<h3>Beheer</h3>';
  if (p) {
    danger.appendChild(Object.assign(el('button', 'pbtn danger', `Speler "${p.name || 'zonder naam'}" verwijderen`), { onclick: () => {
      if (!confirm('Deze speler en alle voortgang verwijderen?')) return;
      S.data.profiles = S.data.profiles.filter(x => x !== p);
      if (S.profile === p) S.profile = null;
      persist(); S.profile ? goParent() : goProfiles();
    } }));
  }
  danger.appendChild(Object.assign(el('button', 'pbtn', 'Klaar'), { onclick: () => (S.profile ? goMap() : goProfiles()) }));
  body.appendChild(danger);
}

// ---------------- invoer ----------------
function onPointerDown(e) {
  S.ptr = { x: e.clientX, y: e.clientY, t: performance.now(), done: false };
}
function onPointerMove(e) {
  const p = S.ptr;
  if (!p || p.done || !S.run || S.run.state === 'paused') return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (Math.hypot(dx, dy) > 38) { p.done = true; swipe(dx, dy); }
}
function onPointerUp(e) {
  const p = S.ptr; S.ptr = null;
  if (!p || p.done) return;
  tap(e.clientX, e.clientY);
}
function swipe(dx, dy) {
  const run = S.run; if (!run) return;
  if (Math.abs(dy) > Math.abs(dx) && dy < 0) run.runner.jump();
  else if (Math.abs(dx) >= Math.abs(dy)) run.runner.move(dx > 0 ? 1 : -1);
}
function tap(x, y) {
  const run = S.run; if (!run) return;
  if (run.state === 'catch') {
    const s = S.view.snaaiScreen;
    const near = s && Math.hypot(x - s.x, y - s.y) < Math.max(s.r * 1.6, 110);
    if (near || performance.now() - run.catchAt > 4500) catchSnaai(run);
    return;
  }
  if (!['play', 'steal', 'celebrate'].includes(run.state)) return;
  const h = S.view.heroScreen;
  if (h && Math.hypot(x - h.x, y - h.y) < renderer.s0 * 0.5 && renderer.laneAt(x) === run.runner.lane) { run.runner.jump(); return; }
  run.runner.steer(renderer.laneAt(x));
}
function onKey(e) {
  const run = S.run; if (!run) return;
  if (e.key === 'ArrowLeft') run.runner.move(-1);
  else if (e.key === 'ArrowRight') run.runner.move(1);
  else if (e.key === 'ArrowUp' || e.key === ' ') run.runner.jump();
  else if (e.key === 'Enter' && run.state === 'catch') catchSnaai(run);
}

// ---------------- hoofdlus ----------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * S.speed;
  last = now;
  S.t += dt; S.view.t = S.t;
  const run = S.run;
  if (run && !run.over && !['paused', 'done', 'escaped'].includes(run.state)) {
    if (S.autoplay) autoplay(run);
    run.runner.update(dt);
    handleEvents(run);
    if (run.row && !run.row.resolved && run.glowAfter != null && run.runner.t - run.rowAt > run.glowAfter) run.row.glow = true;
    const bar = $('#chase .bar i'); if (bar) bar.style.width = Math.round((1 - run.runner.gap) * 100) + '%';
    if (run.state === 'caught') S.view.caughtT = (S.view.caughtT || 0) + dt;
  }
  if (S.screen === 'run' || !S.run) renderer.frame(run && S.screen === 'run' ? run.runner : null, S.view, dt);
  for (const c of S.chars) c.render(dt);
  requestAnimationFrame(loop);
}

// Testhulp (?qa): stuurt de held automatisch naar de goede bal.
function autoplay(run) {
  const row = run.runner.rows.find(r => !r.resolved);
  if (row) {
    const good = row.items.find(i => i.correct);
    const pick = S.autoplay === 'wrong' && run.director.tries === 0 ? row.items.find(i => !i.correct) || good : good;
    if (pick && row.z < 14) run.runner.steer(pick.lane);
  }
  const obs = run.runner.obstacles.find(o => !o.hit && !o.passed && o.z > 0 && o.z < 2.2 && o.lane === run.runner.lane);
  if (obs) run.runner.jump();
  if (run.state === 'catch' && run.runner.gap < 0.03) catchSnaai(run);
}
function exposeQA() {
  window.ld = { S, audio, renderer, WORDS, LEVELS, startLevel, startEndless, goMap, goBook, goShop, goParent, pickProfile, levelById: id => LEVELS.find(l => l.id === id) };
}

boot().catch(e => { logRun('boot-failed', { message: String(e.stack || e) }); $('#loadinfo').textContent = 'Het laden is niet gelukt. Vernieuw de pagina om opnieuw te proberen.'; });
