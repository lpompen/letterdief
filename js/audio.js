// Geluid: ingesproken fragmenten (Web Audio), gesynthetiseerde effecten en zachte muziek.
// Ontbreekt een fragment, dan valt de verteller terug op de spraak van het apparaat.
const clipName = key => {
  const [kind, rest] = key.includes(':') ? key.split(':') : ['p', key];
  return kind + '_' + rest;
};

export class AudioSys {
  constructor() {
    this.ctx = null; this.buffers = new Map(); this.pending = new Map();
    this.clips = {}; this.texts = {}; this.base = './audio/';
    this.muted = false; this.musicOn = true; this.seq = 0; this.sources = [];
    this.voiceGain = null; this.sfxGain = null; this.musicGain = null;
    this.musicTimer = null; this.musicWorld = -1; this.duck = 1;
  }
  async init(url = './audio/manifest.json') {
    try {
      const res = await fetch(url);
      const data = await res.json();
      this.clips = data.clips || {}; this.texts = data.texts || {};
    } catch (e) { console.warn('audio manifest ontbreekt', e); }
  }
  // Moet vanuit een tik gebeuren (iOS).
  unlock() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* oudere Safari */ }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC({ sampleRate: 22050 }); } catch (e) { this.ctx = new AC(); }
      const master = this.ctx.createGain(); master.connect(this.ctx.destination); this.master = master;
      this.voiceGain = this.ctx.createGain(); this.voiceGain.connect(master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55; this.sfxGain.connect(master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.0; this.musicGain.connect(master);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    this.master.gain.value = this.muted ? 0 : 1;
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 1; if (m) this.stopSpeech(); }
  has(key) { return !!this.clips[clipName(key)]; }
  duration(key) { const c = this.clips[clipName(key)]; return c ? c.d : 0.8; }
  timing(key) { const c = this.clips[clipName(key)]; return c && c.t; }

  async load(keys) {
    if (!this.ctx) return;
    const todo = [...new Set(keys.filter(k => typeof k === 'string').map(clipName))].filter(n => this.clips[n] && !this.buffers.has(n));
    await Promise.all(todo.map(n => this.fetchClip(n)));
  }
  fetchClip(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const p = fetch(this.base + this.clips[name].f)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(buf => new Promise((ok, fail) => this.ctx.decodeAudioData(buf, ok, fail)))
      .then(audio => { this.buffers.set(name, audio); this.pending.delete(name); this.trim(); return audio; })
      .catch(e => { this.pending.delete(name); console.warn('clip', name, e); return null; });
    this.pending.set(name, p);
    return p;
  }
  trim() {
    // Houd het geheugen klein op oudere iPads: woordfragmenten mogen weer weg.
    if (this.buffers.size < 220) return;
    for (const k of this.buffers.keys()) {
      if (k.startsWith('w_') || k.startsWith('z_')) { this.buffers.delete(k); if (this.buffers.size < 160) break; }
    }
  }
  stopSpeech() {
    this.seq++;
    for (const s of this.sources) { try { s.stop(); } catch (e) { /* al gestopt */ } }
    this.sources = [];
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.setDuck(false);
  }
  setDuck(on) {
    if (!this.musicGain) return;
    const v = this.musicOn && !this.muted ? (on ? 0.035 : 0.09) : 0;
    this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }
  // Speelt een reeks fragmenten na elkaar; een nieuwe say() onderbreekt de vorige.
  async say(keys, { onClip = null, gap = 0.09 } = {}) {
    this.stopSpeech();
    const id = this.seq;
    if (!keys || !keys.length) return true;
    if (!this.ctx || this.muted) return true;
    this.setDuck(true);
    await this.load(keys);
    for (const key of keys) {
      if (id !== this.seq) return false;
      if (typeof key === 'number') { await wait(key * 1000); continue; }
      const name = clipName(key);
      const buf = this.buffers.get(name);
      if (buf) {
        if (onClip) onClip(key, buf.duration);
        await this.playBuffer(buf, id);
      } else {
        const text = this.texts[name] || (key.includes(':') ? key.split(':')[1] : key);
        if (onClip) onClip(key, 0.8);
        await this.speak(text, id);
      }
      if (id !== this.seq) return false;
      await wait(gap * 1000);
    }
    if (id === this.seq) this.setDuck(false);
    return id === this.seq;
  }
  playBuffer(buf, id) {
    return new Promise(done => {
      if (id !== this.seq) return done();
      const s = this.ctx.createBufferSource();
      s.buffer = buf; s.connect(this.voiceGain);
      this.sources.push(s);
      let finished = false;
      const end = () => { if (finished) return; finished = true; this.sources = this.sources.filter(x => x !== s); done(); };
      s.onended = end;
      // Vangnet: als onended niet komt (achtergrond), toch doorgaan.
      setTimeout(end, buf.duration * 1000 + 400);
      s.start();
    });
  }
  speak(text, id) {
    return new Promise(done => {
      const synth = window.speechSynthesis;
      if (!synth || id !== this.seq) return done();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'nl-NL'; u.rate = 0.9;
      const voice = synth.getVoices().find(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('nl'));
      if (voice) u.voice = voice;
      let finished = false;
      const end = () => { if (!finished) { finished = true; done(); } };
      u.onend = end; u.onerror = end;
      setTimeout(end, 600 + text.length * 110);
      synth.speak(u);
    });
  }

  // ---- effecten ----
  makeNoise() {
    const len = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  tone(freq, start, dur, { type = 'sine', vol = 0.3, to = null, attack = 0.005 } = {}) {
    const c = this.ctx, t = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  hiss(start, dur, { freq = 1200, to = null, q = 1, vol = 0.25 } = {}) {
    const c = this.ctx, t = c.currentTime + start;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  sfx(name) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    switch (name) {
      case 'pop': this.tone(520, 0, 0.12, { to: 1100, vol: 0.35 }); this.tone(1560, 0.06, 0.18, { vol: 0.12 }); break;
      case 'ding': this.tone(1047, 0, 0.35, { type: 'triangle', vol: 0.3 }); this.tone(1319, 0.09, 0.45, { type: 'triangle', vol: 0.28 }); break;
      case 'boing': this.tone(330, 0, 0.28, { to: 180, vol: 0.28 }); this.tone(220, 0.12, 0.25, { to: 260, vol: 0.18 }); break;
      case 'coin': this.tone(988, 0, 0.07, { type: 'square', vol: 0.09 }); this.tone(1319, 0.06, 0.16, { type: 'square', vol: 0.09 }); break;
      case 'jump': this.tone(300, 0, 0.22, { to: 640, vol: 0.18 }); break;
      case 'land': this.tone(140, 0, 0.1, { to: 90, vol: 0.18 }); break;
      case 'hit': this.hiss(0, 0.25, { freq: 400, vol: 0.35 }); this.tone(150, 0, 0.3, { to: 70, vol: 0.3, type: 'triangle' }); break;
      case 'whoosh': this.hiss(0, 0.45, { freq: 500, to: 2600, q: 2, vol: 0.2 }); break;
      case 'throw': this.hiss(0, 0.3, { freq: 900, to: 400, q: 3, vol: 0.14 }); break;
      case 'tap': this.tone(880, 0, 0.05, { vol: 0.12 }); break;
      case 'star': [784, 988, 1175].forEach((f, i) => this.tone(f, i * 0.09, 0.4, { type: 'triangle', vol: 0.22 })); break;
      case 'fanfare': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, i === 5 ? 0.7 : 0.18, { type: 'triangle', vol: 0.24 })); break;
      case 'giggle': for (let i = 0; i < 5; i++) this.tone(900 + (i % 2) * 180, i * 0.09, 0.08, { type: 'sine', vol: 0.12, to: 1300 }); break;
      case 'net': this.hiss(0, 0.5, { freq: 300, to: 1500, vol: 0.2 }); this.tone(200, 0.35, 0.3, { to: 120, vol: 0.2 }); break;
      case 'sparkle': for (let i = 0; i < 6; i++) this.tone(1500 + Math.random() * 1500, i * 0.05, 0.15, { vol: 0.07 }); break;
    }
  }

  // ---- muziek: korte vrolijke lus per wereld, heel zacht ----
  music(world) {
    if (!this.ctx) return;
    if (this.musicWorld === world && this.musicTimer) return;
    this.stopMusic();
    this.musicWorld = world;
    const scales = [[0, 2, 4, 7, 9], [0, 2, 4, 7, 9], [0, 2, 5, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 7, 11], [0, 2, 3, 7, 9], [0, 3, 5, 8, 10], [0, 2, 4, 6, 9]];
    const roots = [60, 62, 57, 59, 64, 58, 55, 61];
    const scale = scales[world % 8], root = roots[world % 8];
    const bpm = 112, beat = 60 / bpm / 2;
    let step = 0, next = this.ctx.currentTime + 0.1;
    let seed = 7 + world * 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const melody = Array.from({ length: 16 }, (_, i) => (i % 4 === 3 && rnd() < 0.5 ? null : scale[Math.floor(rnd() * scale.length)] + (rnd() < 0.3 ? 12 : 0)));
    const bass = [0, 0, 7, 7, 5, 5, 7, 4];
    const midi = n => 440 * Math.pow(2, (n - 69) / 12);
    this.setDuck(false);
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (next < this.ctx.currentTime + 0.3) {
        const m = melody[step % 16];
        if (m !== null) this.note(midi(root + 12 + m), next, beat * 0.9, 'triangle', 0.5);
        if (step % 2 === 0) this.note(midi(root - 12 + bass[(step / 2) % 8]), next, beat * 1.8, 'sine', 0.7);
        if (step % 4 === 2) this.noteHat(next);
        step++; next += beat;
      }
    }, 90);
  }
  note(freq, t, dur, type, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + dur + 0.05);
  }
  noteHat(t) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.musicGain); s.start(t, Math.random() * 0.5); s.stop(t + 0.06);
  }
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; this.musicWorld = -1; }
  setMusic(on) { this.musicOn = on; this.setDuck(false); }
}

export const wait = ms => new Promise(r => setTimeout(r, ms));
