// Leermodel: per klank een beheersingsschatting (p), Leitner-bakje voor herhaling op afstand,
// en één moeilijkheidsknop (diff) die zich bijstelt naar ongeveer 80% goed bij de eerste poging.
import { GRAPHEMES, WORLD_OF, HOMOPHONES, CONFUSABLE } from './data.js';

const INTERVALS = [0, 3, 8, 20, 45, 100]; // aantal beantwoorde items tot de volgende herhaling, per bakje
const TARGET_LOW = 0.68, TARGET_HIGH = 0.88;

export function newLearner(startDiff = 0.3) {
  return { g: {}, n: 0, recent: [], diff: startDiff, conf: {}, words: {} };
}

export function introduce(L, list) {
  const fresh = [];
  for (const g of list) {
    if (!L.g[g]) { L.g[g] = { p: 0.3, n: 0, c: 0, box: 0, due: L.n, intro: L.n, last: -1 }; fresh.push(g); }
  }
  return fresh;
}

export const introduced = L => GRAPHEMES.filter(g => L.g[g]);
export const mastery = (L, g) => (L.g[g] ? L.g[g].p : 0);

// Alleen de eerste poging telt voor de beheersing; een fout kost meer bakjes dan een goed antwoord oplevert.
export function record(L, g, correct, firstTry = true, chosen = null) {
  if (!L.g[g]) introduce(L, [g]);
  const s = L.g[g];
  L.n++;
  s.n++;
  s.last = L.n;
  if (correct) s.c++;
  if (!correct && chosen && chosen !== g) L.conf[g + '>' + chosen] = (L.conf[g + '>' + chosen] || 0) + 1;
  if (!firstTry) return;
  s.p += 0.3 * ((correct ? 1 : 0) - s.p);
  s.box = correct ? Math.min(5, s.box + 1) : Math.max(0, s.box - 2);
  s.due = L.n + INTERVALS[s.box];
  L.recent.push(correct ? 1 : 0);
  if (L.recent.length > 12) L.recent.shift();
  if (L.recent.length >= 5) {
    const rate = L.recent.reduce((a, b) => a + b, 0) / L.recent.length;
    if (rate > TARGET_HIGH) L.diff = Math.min(1, L.diff + 0.04);
    else if (rate < TARGET_LOW) L.diff = Math.max(0, L.diff - 0.08);
  }
}

// Hoeveel hulp een kind krijgt bij deze klank.
// 0: klank wordt voorgezegd, 2 keuzes, goede bal gloeit na korte tijd
// 1: klank wordt voorgezegd, 2-3 keuzes
// 2: woord wordt gezegd + "wat hoor je vooraan?", 3 keuzes
// 3: alleen plaatje en gat ("welke letter mist er?"), 3 keuzes
export function scaffold(L, g, { fresh = false } = {}) {
  const p = mastery(L, g), d = L.diff;
  let level;
  if (fresh || p < 0.45) level = 0;
  else if (p < 0.65) level = 1;
  else if (p < 0.85) level = d > 0.5 ? 2 : 1;
  else level = d > 0.7 ? 3 : 2;
  const options = level === 0 ? 2 : level === 1 ? (d < 0.35 ? 2 : 3) : 3;
  const glowAfter = level === 0 ? 2.5 : level === 1 ? 7 : null;
  return { level, options, glowAfter };
}

export function homophonesOf(g) {
  const out = new Set([g]);
  for (const set of HOMOPHONES) if (set.includes(g)) set.forEach(x => out.add(x));
  return out;
}

// Afleiders kiezen uit wat het kind al kent. Lijkende letters pas als de doelletter goed zit.
export function pickOptions(L, target, count, rng) {
  const banned = homophonesOf(target);
  let pool = introduced(L).filter(g => !banned.has(g));
  if (pool.length < count - 1) {
    // Te weinig bekende letters (begin van het spel): vul aan met letters uit dezelfde of de volgende wereld.
    const w = WORLD_OF[target] ?? 0;
    const extra = GRAPHEMES.filter(g => !banned.has(g) && !pool.includes(g) && (WORLD_OF[g] ?? 9) <= w + 1);
    pool = pool.concat(extra);
  }
  const p = mastery(L, target);
  const confusable = (CONFUSABLE[target] || []).filter(g => pool.includes(g));
  const picked = [];
  const useConfusable = p >= 0.75 && L.diff > 0.4 && confusable.length && rng() < 0.6;
  if (useConfusable) picked.push(confusable[Math.floor(rng() * confusable.length)]);
  // Eerder verwarde letters komen vaker terug als afleider (maar niet bij een pas geleerde letter).
  const weighted = pool.filter(g => !picked.includes(g) && (p >= 0.6 || !confusable.includes(g))).map(g => {
    const conf = L.conf[target + '>' + g] || 0;
    return { g, w: 1 + (p >= 0.6 ? conf * 1.5 : 0) + (L.g[g] ? 0.5 : 0) };
  });
  while (picked.length < count - 1 && weighted.length) {
    const total = weighted.reduce((a, b) => a + b.w, 0);
    let r = rng() * total, i = 0;
    while (i < weighted.length - 1 && (r -= weighted[i].w) > 0) i++;
    picked.push(weighted.splice(i, 1)[0].g);
  }
  return picked;
}

// Hoe hard heeft deze klank oefening nodig? Nieuw/zwak/verlopen weegt zwaar.
export function need(L, g) {
  const s = L.g[g];
  if (!s) return 0;
  const overdue = Math.max(0, L.n - s.due);
  return 0.4 + (1 - s.p) * 2.5 + Math.min(1.5, overdue / 10) + (s.n < 3 ? 1 : 0);
}

export function weightedPick(list, weightOf, rng) {
  const total = list.reduce((a, x) => a + weightOf(x), 0);
  if (!(total > 0)) return list[Math.floor(rng() * list.length)];
  let r = rng() * total;
  for (const x of list) if ((r -= weightOf(x)) <= 0) return x;
  return list[list.length - 1];
}

export function starsFor(firstTryCorrect, total) {
  if (!total) return 3;
  const rate = firstTryCorrect / total;
  return rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : 1;
}

// Deterministische random voor tests en herhaalbare levels.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
