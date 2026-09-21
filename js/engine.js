// Renmotor: 3 banen, de held staat op z=0 en alles op de weg komt naar hem toe.
// Puur en deterministisch (rng meegeven), zodat de balans in Node te testen is.
export const LANES = [-2.2, 0, 2.2];
export const HIT_Z = 0.45;          // binnen deze afstand raakt de held iets
const JUMP_TIME = 0.72, JUMP_HEIGHT = 1.35;

export class Runner {
  constructor({ rng, speed = 7.5, escape = true, obstacles = 0.5, coins = true } = {}) {
    this.rng = rng || Math.random;
    this.baseSpeed = speed; this.speed = 0; this.escape = escape;
    this.obstacleRate = obstacles; this.coinsOn = coins;
    this.t = 0; this.dist = 0;
    this.lane = 1; this.x = LANES[1];
    this.jumpT = -1; this.stumbleT = 0; this.invuln = 0; this.boostT = 0;
    this.gap = 0.5; this.snaaiThrowT = -9; this.snaaiHitT = -9; this.sz = 32;
    this.rows = []; this.obstacles = []; this.coins = []; this.fx = [];
    this.events = [];
    this.mode = 'run';          // run · cruise (geen nieuwe dingen) · catch (Snaai is moe) · caught · escaped
    this.nextObstacle = 3; this.nextCoin = 1.5; this.rowSeq = 0;
    this.coinCount = 0; this.hits = 0;
  }
  // Waar Snaai zou moeten lopen; this.sz volgt dat vloeiend (geen sprongen bij de eindsprint).
  get snaaiTarget() { return this.mode === 'catch' || this.mode === 'caught' ? 6 + this.gap * 22 : 20 + this.gap * 24; }
  get snaaiZ() { return this.sz; }
  get jumpH() {
    if (this.jumpT < 0) return 0;
    const u = this.jumpT / JUMP_TIME;
    return 4 * JUMP_HEIGHT * u * (1 - u);
  }
  get busy() { return this.rows.some(r => !r.resolved); }
  emit(type, data = {}) { this.events.push({ type, t: this.t, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }

  steer(lane) {
    lane = Math.max(0, Math.min(2, lane));
    if (lane !== this.lane) { this.lane = lane; this.emit('steer', { lane }); }
  }
  move(dir) { this.steer(this.lane + dir); }
  jump() {
    if (this.jumpT >= 0 || this.mode === 'caught') return false;
    this.jumpT = 0; this.emit('jump'); return true;
  }

  // Snaai gooit een rij ballen achter zich; elke optie in een eigen baan.
  throwRow(options) {
    const lanes = this.pickLanes(options.length);
    const z = this.snaaiZ;
    const row = { id: ++this.rowSeq, z, age: 0, resolved: false, glow: false,
      items: options.map((o, i) => ({ ...o, lane: lanes[i], taken: false, gone: false })) };
    this.rows.push(row);
    this.snaaiThrowT = this.t;
    // Houd de baan voor de rij vrij van obstakels.
    this.obstacles = this.obstacles.filter(o => Math.abs(o.z - z) > 4);
    this.emit('throw', { row });
    return row;
  }
  pickLanes(n) {
    const all = [0, 1, 2];
    if (n >= 3) return this.shuffle(all);
    // Bij 1-2 opties: niet steeds de baan waar de held al staat.
    const lanes = this.shuffle(all).slice(0, n);
    if (n === 1 && lanes[0] === this.lane && this.rng() < 0.6) lanes[0] = (this.lane + 1 + Math.floor(this.rng() * 2)) % 3;
    return lanes;
  }
  shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Aanpassing van de afstand tot Snaai (negatief = dichterbij).
  nudge(amount) {
    this.gap = Math.max(0, Math.min(1, this.gap + amount));
    if (amount < 0) this.boostT = 0.6;
  }
  startCatch() { this.mode = 'catch'; this.rows.forEach(r => (r.resolved = true)); this.obstacles = []; }
  catchSnaai() { if (this.mode === 'catch') { this.mode = 'caught'; this.emit('caught'); } }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    // Snelheid: struikelen remt, goed antwoord geeft even een duwtje.
    let target = this.baseSpeed;
    if (this.mode === 'cruise') target *= 0.7;
    if (this.mode === 'catch') target *= this.gap > 0.02 ? 0.85 : 0;
    if (this.mode === 'caught' || this.mode === 'escaped') target = 0;
    if (this.stumbleT > 0) { target *= 0.5; this.stumbleT -= dt; }
    if (this.boostT > 0) { target *= 1.15; this.boostT -= dt; }
    this.speed += (target - this.speed) * Math.min(1, dt * 3);
    const step = this.speed * dt;
    this.dist += step;
    this.x += (LANES[this.lane] - this.x) * Math.min(1, dt * 14);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.jumpT >= 0) { this.jumpT += dt; if (this.jumpT >= JUMP_TIME) { this.jumpT = -1; this.emit('land'); } }

    // Snaai loopt langzaam uit, behalve als hij moe is.
    if (this.mode === 'run') {
      this.gap = Math.min(1, this.gap + dt * 0.0035);
      if (this.gap >= 1 && this.escape) { this.mode = 'escaped'; this.emit('escaped'); }
      if (!this.escape) this.gap = Math.min(this.gap, 0.92);
    } else if (this.mode === 'catch') {
      this.gap = Math.max(0, this.gap - dt * 0.35);
    }
    this.sz += (this.snaaiTarget - this.sz) * Math.min(1, dt * 1.5);

    const heroLane = Math.round((this.x - LANES[0]) / 2.2);
    for (const row of this.rows) {
      row.z -= step; row.age += dt;
      if (row.resolved) continue;
      for (const item of row.items) {
        if (item.taken || item.gone) continue;
        if (row.z <= HIT_Z && row.z > -HIT_Z && item.lane === heroLane) {
          item.taken = true; row.resolved = true;
          this.emit('catch', { row, item });
          break;
        }
      }
      if (!row.resolved && row.z < -1.2) { row.resolved = true; row.items.forEach(i => (i.gone = true)); this.emit('miss', { row }); }
    }
    this.rows = this.rows.filter(r => r.z > -6);

    for (const o of this.obstacles) {
      o.z -= step;
      if (!o.hit && !o.passed && this.mode === 'run' && o.z <= HIT_Z && o.z > -HIT_Z && o.lane === heroLane) {
        if (this.jumpH > 0.55) { o.passed = true; this.emit('hop', { obstacle: o }); }
        else if (this.invuln <= 0) {
          o.hit = true; this.hits++; this.stumbleT = 0.8; this.invuln = 1.3;
          this.nudge(0.12);
          this.emit('hit', { obstacle: o });
        }
      }
      if (o.z < -HIT_Z) o.passed = true;
    }
    this.obstacles = this.obstacles.filter(o => o.z > -6);

    for (const c of this.coins) {
      c.z -= step;
      if (!c.taken && c.z <= HIT_Z && c.z > -HIT_Z && c.lane === heroLane && Math.abs(this.jumpH - c.y) < 0.9) {
        c.taken = true; this.coinCount++; this.emit('coin', { coin: c });
      }
    }
    this.coins = this.coins.filter(c => c.z > -3 && !c.taken);

    if (this.mode === 'run') this.spawn(step);
  }

  // Snaai laat obstakels vallen en munten liggen; nooit alle banen dicht, nooit vlak bij een rij ballen.
  spawn(step) {
    const z = this.snaaiZ;
    const nearRow = this.rows.some(r => !r.resolved && Math.abs(r.z - z) < 7);
    this.nextObstacle -= step / Math.max(1, this.baseSpeed);
    if (this.obstacleRate > 0 && this.nextObstacle <= 0 && !nearRow) {
      const lane = Math.floor(this.rng() * 3);
      this.obstacles.push({ z, lane, hit: false, passed: false, id: Math.random() });
      if (this.obstacleRate > 0.7 && this.rng() < 0.3) {
        const other = (lane + 1 + Math.floor(this.rng() * 2)) % 3;
        this.obstacles.push({ z, lane: other, hit: false, passed: false, id: Math.random() });
      }
      this.nextObstacle = (2.2 + this.rng() * 2.5) / this.obstacleRate;
      this.emit('drop');
      // Munten boven een obstakel: wie springt, pakt ze.
      if (this.coinsOn && this.rng() < 0.5) this.coins.push({ z, lane, y: 1.2, taken: false, spin: this.rng() * 6 });
    }
    this.nextCoin -= step / Math.max(1, this.baseSpeed);
    if (this.coinsOn && this.nextCoin <= 0 && !nearRow) {
      const lane = Math.floor(this.rng() * 3);
      const n = 3 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        const cz = z - i * 1.6;
        if (!this.obstacles.some(o => o.lane === lane && Math.abs(o.z - cz) < 1.5)) this.coins.push({ z: cz, lane, y: 0.35, taken: false, spin: i * 0.7 });
      }
      this.nextCoin = 2.5 + this.rng() * 3;
    }
  }
}
