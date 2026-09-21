// De Letterdief — vaste inhoud: klanken, werelden, levels en gesproken zinnen.
export const VERSION = '1.0.0';

// Lettervolgorde volgens Veilig Leren Lezen (kim-versie), één wereld per kern.
// Binnen wereld 0 eerst m en s: die klanken zijn te rekken en dus het best hoorbaar voor kleuters.
export const WORLD_LETTERS = [
  ['m', 's', 'i', 'k'],
  ['p', 'aa', 'r', 'e', 'v'],
  ['n', 't', 'ee', 'b', 'oo'],
  ['d', 'oe', 'z', 'ij', 'h'],
  ['w', 'o', 'a', 'u', 'j'],
  ['eu', 'ie', 'l', 'ou', 'uu'],
  ['g', 'au', 'ui', 'f', 'ei'],
  ['sch', 'ng', 'nk', 'ch'],
];

export const GRAPHEMES = WORLD_LETTERS.flat();
export const WORLD_OF = Object.fromEntries(WORLD_LETTERS.flatMap((list, w) => list.map(g => [g, w])));
const VOWELS = new Set(['i', 'aa', 'e', 'ee', 'oo', 'oe', 'ij', 'o', 'a', 'u', 'eu', 'ie', 'ou', 'uu', 'au', 'ui', 'ei']);
export const isVowel = g => VOWELS.has(g);

// Klinken hetzelfde: nooit samen als keuze aanbieden.
export const HOMOPHONES = [['ei', 'ij'], ['au', 'ou'], ['g', 'ch']];
// Lijken op elkaar (vorm of klank): pas als afleider wanneer het kind de letter goed kent.
export const CONFUSABLE = {
  b: ['d', 'p'], d: ['b', 't'], p: ['b', 'd'], m: ['n', 'w'], n: ['m', 'ng'], w: ['m', 'v'],
  v: ['f', 'w'], f: ['v'], s: ['z'], z: ['s'], k: ['t'], t: ['k', 'd'],
  a: ['aa', 'e'], aa: ['a'], e: ['ee', 'i'], ee: ['e'], o: ['oo', 'a'], oo: ['o'], i: ['ie', 'e'], ie: ['i'],
  u: ['uu', 'eu'], uu: ['u', 'ui'], eu: ['u', 'ui'], ui: ['uu', 'eu'], oe: ['o', 'oo'], ou: ['ui', 'oe'], au: ['aa', 'ui'],
  ei: ['ee', 'e'], ij: ['i', 'ie'], ng: ['nk', 'n'], nk: ['ng', 'k'], sch: ['s', 'ch'], ch: ['sch', 'g'], g: ['sch', 'k'],
  h: ['n'], j: ['i', 'ij'], l: ['i', 'r'], r: ['l'],
};

export const WORLDS = [
  { name: 'Het Letterbos', icon: '🌲', sky: ['#8fd3ff', '#e9f8ff'], ground: '#6cc24a', ground2: '#5fb13f', road: '#e0bf8c', road2: '#d4ae78', edge: '#b88c55',
    deco: ['🌲', '🌳', '🌲', '🍄', '🌷', '🌳'], obstacle: '🪵', hills: '#7fc6a0' },
  { name: 'Het Zonnestrand', icon: '🏖️', sky: ['#6fcfff', '#fff4c9'], ground: '#f6dfae', ground2: '#efd296', road: '#c99562', road2: '#b98452', edge: '#9c6a3d',
    deco: ['🌴', '⛱️', '🌴', '🐚', '🦀', '🌴'], obstacle: '🏰', hills: '#4fb5e8' },
  { name: 'De Boerderij', icon: '🚜', sky: ['#9edcff', '#f2fbff'], ground: '#8fd14f', ground2: '#82c243', road: '#cfa874', road2: '#c29a65', edge: '#9d7648',
    deco: ['🌻', '🏡', '🌾', '🐑', '🌻', '🌳'], obstacle: '🪣', hills: '#a6d86b' },
  { name: 'De Drukke Stad', icon: '🏙️', sky: ['#a9ddff', '#eef8ff'], ground: '#c7ced6', ground2: '#bcc4cd', road: '#6b7280', road2: '#646b78', edge: '#e8ecf0',
    deco: ['🏠', '🏢', '🌳', '🚦', '🏪', '🏠'], obstacle: '🚧', hills: '#9fb4c9' },
  { name: 'De Sneeuwberg', icon: '⛄', sky: ['#bfe3ff', '#f7fbff'], ground: '#f3f8fc', ground2: '#e6eef6', road: '#bfe0f0', road2: '#b0d6ea', edge: '#8fb9d3',
    deco: ['🌲', '⛄', '🌲', '🏔️', '❄️', '🌲'], obstacle: '🧊', hills: '#dbe9f5' },
  { name: 'De Jungle', icon: '🦜', sky: ['#7fd6a6', '#e6fff0'], ground: '#3f9b4f', ground2: '#378c46', road: '#b98b55', road2: '#ab7d48', edge: '#7c5a33',
    deco: ['🌴', '🌺', '🦜', '🌿', '🐒', '🌴'], obstacle: '🪨', hills: '#2f7d4a' },
  { name: 'Het Nachtbos', icon: '🌙', sky: ['#1b2757', '#57439a'], ground: '#2c4d52', ground2: '#264449', road: '#6f5cab', road2: '#65529f', edge: '#a894ff',
    deco: ['🍄', '🌲', '✨', '🦉', '🍄', '🌲'], obstacle: '🎃', hills: '#243a6b', night: true },
  { name: 'Het Kasteel van Snaai', icon: '🏰', sky: ['#ff9e6b', '#ffd3e2'], ground: '#9d8fb6', ground2: '#9083aa', road: '#a49a90', road2: '#968c82', edge: '#6f665e',
    deco: ['🏰', '🚩', '🔥', '🗝️', '🚩', '🏰'], obstacle: '🛢️', hills: '#b27aa5' },
];

// Elke wereld: 6 levels + eindbaas. Moeilijkheid loopt op binnen de wereld.
// kind: intro (nieuwe letters leren) · klank (welke letter mist er) · woord (hele woord terugpakken) · baas
export function levelsFor(world) {
  const letters = WORLD_LETTERS[world];
  const half = Math.ceil(letters.length / 2);
  const firstOnly = world === 0;
  return [
    { kind: 'intro', focus: letters.slice(0, half), words: 4, pos: 'first', speed: 0 },
    { kind: 'intro', focus: letters.slice(half), words: 4, pos: firstOnly ? 'first' : 'any', speed: 0.05 },
    { kind: 'klank', focus: letters, words: 5, pos: firstOnly ? 'first' : 'any', speed: 0.1 },
    { kind: 'klank', focus: letters, words: 5, pos: 'any', review: true, speed: 0.15, gaps: world >= 2 ? 2 : 1 },
    { kind: world === 0 ? 'klank' : 'woord', focus: letters, words: world === 0 ? 6 : 3, pos: 'any', review: true, speed: 0.2 },
    { kind: world === 0 ? 'klank' : 'mix', focus: letters, words: 5, pos: 'any', review: true, speed: 0.3, gaps: 2 },
    { kind: 'baas', focus: letters, words: 5, pos: 'any', review: true, speed: 0.25 },
  ].map((spec, i) => ({ ...spec, id: `w${world}l${i}`, world, idx: i }));
}
export const LEVELS = WORLDS.flatMap((_, w) => levelsFor(w));
export const levelById = id => LEVELS.find(l => l.id === id);

// Monster-uiterlijk en winkel.
export const COLORS = ['#ff7a59', '#4cc9f0', '#80d858', '#b388ff', '#ffc93c', '#ff6fb5'];
export const SHOP = [
  { id: 'pet', kind: 'hat', icon: '🧢', price: 15 },
  { id: 'strik', kind: 'hat', icon: '🎀', price: 15 },
  { id: 'bloem', kind: 'hat', icon: '🌼', price: 25 },
  { id: 'zonhoed', kind: 'hat', icon: '👒', price: 30 },
  { id: 'bril', kind: 'glasses', icon: '👓', price: 30 },
  { id: 'zonbril', kind: 'glasses', icon: '🕶️', price: 40 },
  { id: 'cape-rood', kind: 'cape', icon: '🟥', price: 35, color: '#ef4444' },
  { id: 'cape-blauw', kind: 'cape', icon: '🟦', price: 35, color: '#3b82f6' },
  { id: 'slim', kind: 'hat', icon: '🎓', price: 50 },
  { id: 'hoge', kind: 'hat', icon: '🎩', price: 60 },
  { id: 'cape-goud', kind: 'cape', icon: '🟨', price: 70, color: '#f5b400' },
  { id: 'kroon', kind: 'hat', icon: '👑', price: 90 },
  { id: 'cape-regenboog', kind: 'cape', icon: '🌈', price: 120, color: 'rainbow' },
];

// Gesproken zinnen. v = stem: n = verteller, s = Snaai.
export const PHRASES = {
  welkom: ['n', 'Hoi! Fijn dat je er bent.'],
  wie: ['n', 'Wie gaat er spelen? Tik op jouw monster.'],
  nieuw_monster: ['n', 'Kies een kleur voor jouw monster.'],
  kaart: ['n', 'Tik op een rondje om te spelen.'],
  intro1: ['n', 'Oh nee! Snaai de letterdief pikt letters uit de woorden.'],
  intro2: ['n', 'Snaai kan niet lezen. Hij vindt letters gewoon mooi en glimmend.'],
  intro3: ['n', 'Ren achter hem aan en pak de letters terug!'],
  oh_nee: ['n', 'Oh nee! Snaai heeft letters gepikt!'],
  uitleg_tik: ['n', 'Tik op de weg om naar links of rechts te gaan.'],
  uitleg_spring: ['n', 'Veeg omhoog om te springen.'],
  pak_de: ['n', 'Pak de'],
  welke_mist: ['n', 'Welke letter mist er?'],
  vooraan: ['n', 'Wat hoor je vooraan?'],
  achteraan: ['n', 'Wat hoor je achteraan?'],
  midden: ['n', 'Wat hoor je in het midden?'],
  pak_letters: ['n', 'Pak alle letters van'],
  eerst: ['n', 'Wat hoor je eerst?'],
  en_dan: ['n', 'En dan?'],
  laatste: ['n', 'En als laatste?'],
  goed1: ['n', 'Goed zo!'], goed2: ['n', 'Knap!'], goed3: ['n', 'Super!'], goed4: ['n', 'Ja, die is het!'],
  goed5: ['n', 'Top!'], goed6: ['n', 'Wauw!'], goed7: ['n', 'Heel goed!'], goed8: ['n', 'Precies!'],
  dat_is_de: ['n', 'Dat is de'],
  we_zoeken: ['n', 'We zoeken de'],
  nog_eens: ['n', 'Probeer het nog eens.'],
  woord_heel: ['n', 'Hoera! Het woord is weer heel!'],
  pak_hem: ['n', 'Tik op Snaai om hem te pakken!'],
  hebbes: ['n', 'Hebbes! Je hebt Snaai gepakt!'],
  ontsnapt: ['n', 'Oei, Snaai is ontsnapt. Probeer het nog een keer!'],
  nieuwe_letter: ['n', 'Een nieuwe letter!'],
  dit_is_de: ['n', 'Dit is de'],
  van: ['n', 'van'],
  pas_op: ['n', 'Pas op!'],
  sticker: ['n', 'Je hebt een nieuwe sticker!'],
  ster1: ['n', 'Goed gedaan!'], ster2: ['n', 'Heel knap!'], ster3: ['n', 'Fantastisch! Drie sterren!'],
  baas_intro: ['n', 'Snaai heeft een grote zak vol letters. Lees het woord en pak het goede plaatje!'],
  baas_klank: ['n', 'Snaai heeft een grote zak vol letters. Pak de goede letters!'],
  lees: ['n', 'Lees het woord.'],
  dat_is: ['n', 'Dat is'],
  hier_staat: ['n', 'Hier staat'],
  pauze: ['n', 'Tijd voor een pauze! Snaai gaat ook even slapen. Tot straks!'],
  wereld_open: ['n', 'Hoera, een nieuwe wereld!'],
  winkel: ['n', 'Kies iets moois voor je monster.'],
  te_duur: ['n', 'Nog niet genoeg muntjes. Verzamel er meer tijdens het rennen!'],
  gekocht: ['n', 'Wat mooi!'],
  boek: ['n', 'Dit zijn al jouw woorden. Tik erop om ze te horen.'],
  vrij: ['n', 'Hoe ver kom jij? Pak de goede letters!'],
  record: ['n', 'Nieuw record!'],
  welkom_terug: ['n', 'Welkom terug! Snaai heeft weer letters gepikt.'],
  klaar_vrij: ['n', 'Goed gerend!'],
  luister: ['n', 'Luister goed.'],
  einde: ['n', 'Het is je gelukt! Alle letters zijn terug!'],
  snaai_leert: ['n', 'En Snaai? Die gaat nu ook leren lezen!'],
  s_hihi: ['s', 'Hihihi! Mooie glimmende letters!'],
  s_vang: ['s', 'Vang me dan!'],
  s_mijn: ['s', 'Die zijn van mij!'],
  s_oei: ['s', 'Oei!'],
  s_he: ['s', 'Hé! Mijn letter!'],
  s_moe: ['s', 'Pff, ik ben moe.'],
  s_sorry: ['s', 'Oké, oké. Je mag ze terug hebben.'],
  s_haha: ['s', 'Hahaa! Te laat!'],
  s_leren: ['s', 'Wil jij mij leren lezen? Dan hoef ik nooit meer letters te pikken.'],
  s_wat: ['s', 'Wat staat hier nou? Ik snap er niks van!'],
  s_baas: ['s', 'Deze zak krijg je nooit!'],
  s_nee: ['s', 'Nee! Mijn letters!'],
};
export const PRAISE = ['goed1', 'goed2', 'goed3', 'goed4', 'goed5', 'goed6', 'goed7', 'goed8'];
