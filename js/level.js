// Regisseur van één level: kiest woorden + gestolen letters, bouwt keuzerijen en verwerkt antwoorden.
// Puur (geen DOM), zodat het in Node getest kan worden.
import { introduce, introduced, record, scaffold, pickOptions, need, weightedPick, starsFor, mastery } from './learn.js';
import { WORLD_LETTERS, WORLD_OF, PRAISE } from './data.js';

export const isReadable = (L, word) => !(word.nz && word.nz.length) && word.g.every(g => L.g[g]);
export function stealIndices(word, g, pos) {
  const out = [];
  word.g.forEach((x, i) => {
    if (x !== g || (word.nz || []).includes(i)) return;
    if (pos === 'first' && i !== 0) return;
    out.push(i);
  });
  return out;
}

// Letters uit eerdere werelden gelden als bekend (ook als een ouder werelden heeft opengezet).
export function ensurePrior(L, world) {
  for (let w = 0; w < world; w++) {
    for (const g of WORLD_LETTERS[w]) if (!L.g[g]) { introduce(L, [g]); L.g[g].p = 0.5; }
  }
}

function pickWord(L, candidates, used, rng, preferShort) {
  const fresh = candidates.filter(w => !used.has(w.w));
  const list = fresh.length ? fresh : candidates;
  return weightedPick(list, w => {
    const seen = (L.words[w.w] && L.words[w.w].n) || 0;
    const len = w.g.length;
    return (seen === 0 ? 3 : 1 / (1 + seen * 0.3)) * (preferShort ? (len <= 3 ? 2 : len === 4 ? 1 : 0.4) : 1);
  }, rng);
}

export function planItems(L, spec, words, rng) {
  ensurePrior(L, spec.world ?? 0);
  const fresh = introduce(L, spec.focus);
  const used = new Set();
  const items = [];
  const readable = words.filter(w => isReadable(L, w));
  const preferShort = (spec.world ?? 0) <= 1;
  const focus = spec.focus.filter(g => L.g[g]);
  const review = spec.review || spec.kind === 'intro' ? introduced(L).filter(g => !focus.includes(g)) : [];
  let bossMode = spec.kind === 'baas' ? (readable.length >= 4 ? 'lees' : 'klank') : null;
  const freshQueue = fresh.slice();
  for (let i = 0; i < spec.words; i++) {
    let mode = spec.kind === 'woord' ? 'woord' : bossMode || 'klank';
    if (spec.kind === 'mix') mode = i % 2 === 1 ? 'woord' : 'klank';
    if (mode === 'woord') {
      const pool = readable.filter(w => w.g.length >= 2 && w.g.length <= (L.diff > 0.6 ? 5 : 4) && !used.has(w.w));
      if (pool.length) {
        const word = pickWord(L, pool, used, rng, true);
        used.add(word.w);
        items.push({ mode: 'woord', word, gaps: word.g.map((_, k) => k) });
        continue;
      }
      mode = 'klank';
    }
    if (mode === 'lees') {
      const pool = readable.filter(w => !used.has(w.w));
      const word = pickWord(L, pool.length ? pool : readable, used, rng, false);
      used.add(word.w);
      items.push({ mode: 'lees', word, gaps: [] });
      continue;
    }
    // klank: eerst de nieuwe letters in volgorde, daarna gewogen naar behoefte.
    let target = null, word = null, idx = [];
    for (let attempt = 0; attempt < 12 && !word; attempt++) {
      if (freshQueue.length && attempt === 0) target = freshQueue.shift();
      else target = weightedPick(focus.concat(review), g => need(L, g) * (focus.includes(g) ? 3 : 0.7), rng);
      let pos = spec.pos;
      let cands = words.filter(w => !used.has(w.w) && stealIndices(w, target, pos).length);
      if (!cands.length) { pos = 'any'; cands = words.filter(w => !used.has(w.w) && stealIndices(w, target, pos).length); }
      if (!cands.length) cands = words.filter(w => stealIndices(w, target, 'any').length);
      if (!cands.length) continue;
      word = pickWord(L, cands, used, rng, preferShort);
      idx = stealIndices(word, target, pos);
      if (!idx.length) idx = stealIndices(word, target, 'any');
    }
    if (!word) continue;
    used.add(word.w);
    const gaps = [idx[Math.floor(rng() * idx.length)]];
    if ((spec.gaps || 1) >= 2 && word.g.length >= 3) {
      const second = word.g.map((g, k) => k).filter(k => k !== gaps[0] && L.g[word.g[k]] && mastery(L, word.g[k]) >= 0.5 && !(word.nz || []).includes(k));
      if (second.length && rng() < 0.75) gaps.push(second[Math.floor(rng() * second.length)]);
    }
    gaps.sort((a, b) => a - b);
    items.push({ mode: 'klank', word, gaps });
  }
  return { items, fresh };
}

const praise = rng => PRAISE[Math.floor(rng() * PRAISE.length)];

export class LevelDirector {
  constructor(L, spec, words, rng, { plan = null, endless = false } = {}) {
    this.L = L; this.spec = spec; this.words = words; this.rng = rng; this.endless = endless;
    const planned = plan || planItems(L, spec, words, rng);
    this.items = planned.items; this.fresh = planned.fresh;
    this.itemIdx = 0; this.gapPos = 0; this.tries = 0;
    this.firstTryCorrect = 0; this.answered = 0; this.wrong = 0;
    this.seenFresh = {}; this.done = [];
    this.filled = this.items.map(() => new Set());
  }
  get item() { return this.items[this.itemIdx]; }
  get finished() { return this.itemIdx >= this.items.length; }
  // Het gestolen stuk waar we nu naar zoeken.
  get target() {
    const it = this.item;
    if (!it) return null;
    if (it.mode === 'lees') return { kind: 'pic', label: it.word.w, grapheme: null };
    const index = it.gaps[this.gapPos];
    return { kind: 'letter', label: it.word.g[index], grapheme: it.word.g[index], index };
  }
  // Volgende rij ballen die Snaai gooit + wat de verteller zegt.
  nextRow({ repeat = false } = {}) {
    const it = this.item, t = this.target;
    if (!it) return null;
    if (it.mode === 'lees') {
      const readable = this.words.filter(w => w.w !== it.word.w && isReadable(this.L, w) && w.e !== it.word.e);
      let count = this.L.diff < 0.4 ? 2 : 3;
      if (this.tries === 1) count = 2; else if (this.tries >= 2) count = 1;
      const hard = this.L.diff > 0.55;
      const pool = readable.slice().sort((a, b) => this.sim(it.word, b) - this.sim(it.word, a));
      const distract = [];
      while (distract.length < count - 1 && pool.length) {
        const k = hard ? Math.floor(this.rng() * Math.min(4, pool.length)) : Math.floor(this.rng() * pool.length);
        distract.push(pool.splice(k, 1)[0]);
      }
      const options = [{ label: it.word.w, pic: it.word.e, correct: true }].concat(distract.map(w => ({ label: w.w, pic: w.e, correct: false })));
      return { options: this.shuffle(options), prompt: this.itemIdx === 0 && !repeat && this.tries === 0 ? [] : ['lees'], glowAfter: this.tries >= 1 ? 3 : null, scaffold: 3 };
    }
    const g = t.grapheme;
    const isFresh = this.fresh.includes(g) && (this.seenFresh[g] || 0) < 2;
    const sc = scaffold(this.L, g, { fresh: isFresh });
    let count = sc.options;
    if (this.tries === 1) count = Math.max(2, count - 1); else if (this.tries >= 2) count = 1;
    const distract = pickOptions(this.L, g, count, this.rng);
    const options = this.shuffle([{ label: g, correct: true }].concat(distract.map(d => ({ label: d, correct: false }))));
    let prompt;
    const w = it.word;
    const helpSound = sc.level <= 1 || this.tries > 0;
    if (it.mode === 'woord') {
      if (this.gapPos === 0) prompt = ['pak_letters', 'w:' + w.w].concat(helpSound ? ['pak_de', 'k:' + g] : ['eerst']);
      else if (this.gapPos === it.gaps.length - 1) prompt = ['laatste'].concat(helpSound ? ['k:' + g] : []);
      else prompt = ['en_dan'].concat(helpSound ? ['k:' + g] : []);
    } else if (helpSound) {
      prompt = ['pak_de', 'k:' + g];
    } else if (sc.level === 2) {
      const last = w.g.length - 1;
      if (t.index === 0) prompt = ['w:' + w.w, 'vooraan'];
      else if (t.index === last) prompt = ['w:' + w.w, 'achteraan'];
      else if (w.g.length === 3) prompt = ['w:' + w.w, 'midden'];
      else prompt = ['pak_de', 'k:' + g];
    } else {
      prompt = ['welke_mist'];
    }
    return { options, prompt, glowAfter: this.tries >= 2 ? 0.5 : sc.glowAfter, scaffold: sc.level, fresh: isFresh };
  }
  // Wat de 🔊-knop herhaalt.
  replay() {
    const it = this.item, t = this.target;
    if (!it) return [];
    if (it.mode === 'lees') return ['lees'];
    const sc = scaffold(this.L, t.grapheme);
    return sc.level >= 2 && this.tries === 0 ? ['w:' + it.word.w] : ['w:' + it.word.w, 'pak_de', 'k:' + t.grapheme];
  }
  sim(a, b) {
    let s = 0;
    if (a.g[0] === b.g[0]) s += 2;
    if (a.g[a.g.length - 1] === b.g[b.g.length - 1]) s += 1.5;
    if (a.g.length === b.g.length) s += 1;
    for (const g of a.g) if (b.g.includes(g)) s += 0.5;
    return s;
  }
  shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // Kind heeft een bal gepakt.
  answer(label) {
    const it = this.item, t = this.target;
    if (!it) return null;
    const correct = label === t.label;
    const firstTry = this.tries === 0;
    if (firstTry) { this.answered++; if (correct) this.firstTryCorrect++; }
    if (it.mode === 'lees') {
      const s = this.L.words[it.word.w] || (this.L.words[it.word.w] = { n: 0, c: 0 });
      if (firstTry) { s.n++; if (correct) s.c++; }
    } else {
      record(this.L, t.grapheme, correct, firstTry, label);
      if (this.fresh.includes(t.grapheme)) this.seenFresh[t.grapheme] = (this.seenFresh[t.grapheme] || 0) + 1;
    }
    if (!correct) {
      this.tries++; this.wrong++;
      if (it.mode === 'lees') {
        const chosen = this.words.find(w => w.w === label);
        return { correct: false, firstTry, feedback: (chosen ? ['dat_is', 'w:' + chosen.w] : []).concat(['hier_staat', 'z:' + it.word.w, 'w:' + it.word.w]) };
      }
      return { correct: false, firstTry, feedback: ['dat_is_de', 'k:' + label, 'we_zoeken', 'k:' + t.grapheme] };
    }
    this.tries = 0;
    const result = { correct: true, firstTry, fill: t.index ?? null, word: it.word, mode: it.mode, feedback: [] };
    if (it.mode !== 'lees') this.filled[this.itemIdx].add(t.index);
    const lastGap = it.mode === 'lees' || this.gapPos >= it.gaps.length - 1;
    if (lastGap) {
      const s = this.L.words[it.word.w] || (this.L.words[it.word.w] = { n: 0, c: 0 });
      if (it.mode !== 'lees') { s.n++; s.c++; }
      result.wordDone = true;
      result.feedback = [praise(this.rng), 'z:' + it.word.w, 'w:' + it.word.w];
      this.done.push(it.word);
      this.itemIdx++; this.gapPos = 0;
      if (this.endless && this.finished) this.extend();
      result.levelDone = this.finished;
    } else {
      this.gapPos++;
      result.feedback = [praise(this.rng)];
    }
    return result;
  }
  // Oneindig rennen: steeds één nieuw item erbij.
  extend() {
    const spec = { ...this.spec, words: 1, focus: introduced(this.L) };
    const kinds = isReadableCount(this.L, this.words) >= 4 && this.L.diff > 0.45 ? ['klank', 'klank', 'woord', 'lees'] : ['klank'];
    spec.kind = kinds[Math.floor(this.rng() * kinds.length)];
    if (spec.kind === 'lees') spec.kind = 'baas';
    const { items } = planItems(this.L, spec, this.words, this.rng);
    this.items.push(...items);
    this.filled.push(...items.map(() => new Set()));
  }
  get stars() { return starsFor(this.firstTryCorrect, this.answered); }
}

const isReadableCount = (L, words) => words.filter(w => isReadable(L, w)).length;
