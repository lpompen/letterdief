// Opslag in localStorage: meerdere spelers (broertjes/zusjes) + instellingen voor ouders.
import { newLearner } from './learn.js';
import { COLORS } from './data.js';

const KEY = 'letterdief-v1';

export function defaultSettings() {
  return { music: true, sound: true, escape: true, playLimit: 20, allOpen: false, startDiff: 0.3 };
}

export function newProfile(index, color) {
  return {
    id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    name: '', color: color || COLORS[index % COLORS.length],
    look: { hat: null, glasses: null, cape: null }, owned: [],
    coins: 0, stars: {}, stickers: {}, best: 0, learner: newLearner(0.3),
    days: [], created: Date.now(), playedMs: 0, finale: false,
  };
}

export function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data || !Array.isArray(data.profiles)) data = { profiles: [], active: null, settings: defaultSettings() };
  data.settings = { ...defaultSettings(), ...(data.settings || {}) };
  for (const p of data.profiles) {
    p.look = p.look || { hat: null, glasses: null, cape: null };
    p.owned = p.owned || []; p.stars = p.stars || {}; p.stickers = p.stickers || {};
    p.learner = p.learner || newLearner(0.3);
    p.learner.conf = p.learner.conf || {}; p.learner.words = p.learner.words || {}; p.learner.recent = p.learner.recent || [];
    p.days = p.days || [];
  }
  return data;
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Welke levels zijn open? Een level gaat open als het vorige minstens één ster heeft.
export function isUnlocked(profile, levels, level, allOpen) {
  if (allOpen) return true;
  const i = levels.findIndex(l => l.id === level.id);
  return i <= 0 || (profile.stars[levels[i - 1].id] || 0) > 0;
}
