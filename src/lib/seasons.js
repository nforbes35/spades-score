// Season and holiday themes, picked by the date like Sunday Table does: a real photo on the table, the
// card backs and the home screen, a matching felt colour, an ornament and a well-known verse that changes daily (KJV, public domain).
// Names and verses stay English here: tr() shows them in Spanish where they're drawn (Reina-Valera 1909 in src/i18n/es-home.js).
// Photos are from Unsplash (Unsplash License), saved in public/decks so they work offline.

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const local = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = local(s); d.setDate(d.getDate() + n); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
export const todayISO = (d = new Date()) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return iso(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
}

/** nth (1-based) weekday (0 = Sunday) of a month; n = -1 is the last one. */
function nthWeekday(y, month, weekday, n) {
  if (n > 0) return iso(y, month, 1 + ((weekday - new Date(y, month - 1, 1).getDay() + 7) % 7) + (n - 1) * 7);
  const last = new Date(y, month, 0).getDate();
  return iso(y, month, last - ((new Date(y, month - 1, last).getDay() - weekday + 7) % 7));
}

export const thanksgiving = (y) => nthWeekday(y, 11, 4, 4);
export const memorialDay = (y) => nthWeekday(y, 5, 1, -1);
export const laborDay = (y) => nthWeekday(y, 9, 1, 1);

const W = 'rgba(255,255,255,';
const motifs = {
  leaf: `<g transform="rotate(-14) translate(0 1)"><path d="M0 -15 2.6 -9.5 5.2 -11 4.4 -4.2 9.6 -8.6 9.8 -5.4 13.6 -6.4 11.4 -1.8 13 0.2 6.8 3.6 7.8 6.6 1.9 5 0.9 6.4 0.7 12.5 -0.7 12.5 -0.9 6.4 -1.9 5 -7.8 6.6 -6.8 3.6 -13 0.2 -11.4 -1.8 -13.6 -6.4 -9.8 -5.4 -9.6 -8.6 -4.4 -4.2 -5.2 -11 -2.6 -9.5 0 -15Z" fill="${W}0.95)" stroke="${W}0.95)" stroke-width="0.8" stroke-linejoin="round"/><path d="M0 6V-12M0 3 11-4.5M0 3-11-4.5M0 5 6 4.6M0 5-6 4.6" stroke="rgba(0,0,0,0.14)" stroke-width="0.55" fill="none" stroke-linecap="round"/></g>`,
  wheat: `<g fill="${W}0.95)"><path d="M0 18V-14" stroke="${W}0.9)" stroke-width="1.3"/>${[-10, -4, 2, 8].map((d) => `<ellipse cx="-4" cy="${d}" rx="2.4" ry="5" transform="rotate(-30 -4 ${d})"/><ellipse cx="4" cy="${d}" rx="2.4" ry="5" transform="rotate(30 4 ${d})"/>`).join('')}<ellipse cx="0" cy="-16" rx="2.2" ry="4.5"/></g>`,
  star: `<path d="M0-12 3.5-3.8 12.4-3.7 5.6 2 8.2 10.6 0 5.5-8.2 10.6-5.6 2-12.4-3.7-3.5-3.8Z" fill="${W}0.97)"/>`,
  sparkle: `<path d="M0-13 2.5-2.5 13 0 2.5 2.5 0 13-2.5 2.5-13 0-2.5-2.5Z" fill="${W}0.97)"/>`,
  snow: `<g stroke="${W}0.97)" stroke-width="1.6" stroke-linecap="round">${[0, 60, 120].map((a) => `<g transform="rotate(${a})"><path d="M0-12V12M-4-9 0-5 4-9M-4 9 0 5 4 9"/></g>`).join('')}</g>`,
  heart: `<path d="M0 10C-9 3-12-1-12-5a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 4-3 8-12 15Z" fill="${W}0.97)"/>`,
  flower: `<g fill="${W}0.95)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-6.5" rx="4" ry="6" transform="rotate(${a})"/>`).join('')}<circle r="3" fill="rgba(245,197,66,0.95)"/></g>`,
  cross: `<path d="M-1.8-14h3.6v8h7v3.6h-7V14h-3.6V-2.4h-7V-6h7Z" fill="${W}0.97)"/>`,
  sun: `<g stroke="${W}0.97)" stroke-width="1.8" stroke-linecap="round" fill="none"><circle r="5.5"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0-9V-13" transform="rotate(${a})"/>`).join('')}</g>`,
};
const svgUrl = (svg) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

/** The ornament in a gold-ringed medallion: the middle of the card backs. */
const medallion = (kind, ring) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='-50 -50 100 100'><circle r='44' fill='rgba(0,0,0,0.42)' stroke='${ring}' stroke-width='4'/><circle r='37' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='1.2'/><g transform='scale(2.2)'>${motifs[kind]}</g></svg>`);
/** The ornament on its own, big and faint: the middle of the table. */
const emblem = (kind) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='-20 -20 40 40'>${motifs[kind]}</svg>`);

// felt: the dark-to-light colours behind the table, the top bar and your hand. button: [colour, text colour].
const THEMES = [
  { id: 'fall', name: 'Fall', ornament: 'leaf', ring: '#e9a23b', button: ['#c8641f', '#fff'], felt: ['#2a1206', '#5a2a0e', '#8a4316'],
    verses: [['To every thing there is a season, and a time to every purpose under the heaven.', 'Ecclesiastes 3:1'], ['The LORD is my shepherd; I shall not want.', 'Psalm 23:1']] },
  { id: 'thanksgiving', name: 'Thanksgiving', ornament: 'wheat', ring: '#e2b04a', button: ['#b5652a', '#fff'], felt: ['#2b1408', '#5c2e12', '#8b4a1e'],
    verses: [['In every thing give thanks: for this is the will of God in Christ Jesus concerning you.', '1 Thessalonians 5:18'], ['Enter into his gates with thanksgiving, and into his courts with praise.', 'Psalm 100:4']] },
  { id: 'christmas', name: 'Christmas', ornament: 'star', ring: '#e3c06a', button: ['#c62a36', '#fff'], felt: ['#06200f', '#0f3d22', '#1b5a35'],
    verses: [['For unto you is born this day in the city of David a Saviour, which is Christ the Lord.', 'Luke 2:11'], ['For unto us a child is born, unto us a son is given.', 'Isaiah 9:6'], ['Glory to God in the highest, and on earth peace, good will toward men.', 'Luke 2:14']] },
  { id: 'newyear', name: 'New Year', ornament: 'sparkle', ring: '#e8c76f', button: ['#e0b44c', '#241800'], felt: ['#070b1a', '#14213d', '#24365e'],
    verses: [['For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', 'Jeremiah 29:11'], ['If any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', '2 Corinthians 5:17']] },
  { id: 'winter', name: 'Winter', ornament: 'snow', ring: '#b9d6ea', button: ['#3f7aa6', '#fff'], felt: ['#0e2233', '#1d3b53', '#33618a'],
    verses: [['Be still, and know that I am God.', 'Psalm 46:10'], ['Though your sins be as scarlet, they shall be as white as snow.', 'Isaiah 1:18']] },
  { id: 'valentines', name: 'Valentine’s', ornament: 'heart', ring: '#f2a7b8', button: ['#c94466', '#fff'], felt: ['#2a0712', '#5a1428', '#86223e'],
    verses: [['This is my commandment, That ye love one another, as I have loved you.', 'John 15:12'], ['We love him, because he first loved us.', '1 John 4:19']] },
  { id: 'spring', name: 'Spring', ornament: 'flower', ring: '#f3b9c4', button: ['#d9708a', '#fff'], felt: ['#173018', '#2c5530', '#4c7c48'],
    verses: [['This is the day which the LORD hath made; we will rejoice and be glad in it.', 'Psalm 118:24'], ['The grass withereth, the flower fadeth: but the word of our God shall stand for ever.', 'Isaiah 40:8']] },
  { id: 'easter', name: 'Easter', ornament: 'cross', plainTable: true, ring: '#f0c46a', button: ['#e6a83a', '#2b1700'], felt: ['#1f1430', '#3c2a5c', '#5e4687'],
    verses: [['He is not here: for he is risen, as he said.', 'Matthew 28:6'], ['I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live.', 'John 11:25'], ['I am the way, the truth, and the life: no man cometh unto the Father, but by me.', 'John 14:6']] },
  { id: 'summer', name: 'Summer', ornament: 'sun', ring: '#f6c544', button: ['#f4ae2c', '#2e1800'], felt: ['#062e31', '#0f5257', '#1d7a7f'],
    verses: [['I can do all things through Christ which strengtheneth me.', 'Philippians 4:13'], ['Trust in the LORD with all thine heart; and lean not unto thine own understanding.', 'Proverbs 3:5']] },
  { id: 'patriotic', name: 'Red, White & Blue', ornament: 'star', ring: '#e8eef8', button: ['#c8323a', '#fff'], felt: ['#0b1630', '#15284f', '#25406f'],
    verses: [['Blessed is the nation whose God is the LORD.', 'Psalm 33:12'], ['Greater love hath no man than this, that a man lay down his life for his friends.', 'John 15:13'], ['Where the Spirit of the Lord is, there is liberty.', '2 Corinthians 3:17']] },
];

/** A different well-known verse each day. */
function verseOfTheDay(verses, now = new Date()) {
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const [verse, verseRef] = verses[day % verses.length];
  return { verse, verseRef };
}

export const SEASON_DECKS = THEMES.map((t) => ({
  // plainTable: the photo already has the ornament in it (the Easter cross), so the table goes without.
  id: `season-${t.id}`, name: t.name, group: 'Seasons & holidays', faces: 'classic', emblem: t.plainTable ? 'none' : 'ornament',
  back: `${medallion(t.ornament, t.ring)} center / 46% auto no-repeat, url(/decks/season-${t.id}-back.webp) center / cover`,
  table: `radial-gradient(75% 70% at 50% 45%, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.5)), url(/decks/season-${t.id}-table.webp) center / cover`,
  home: `url(/decks/season-${t.id}-table.webp)`,
  emblemImage: t.plainTable ? undefined : emblem(t.ornament),
  felt: t.felt, button: t.button, ...verseOfTheDay(t.verses),
}));

/** Which season or holiday it is. Holidays take over a week or two ahead, like Sunday Table. */
export function seasonFor(date = todayISO()) {
  const y = Number(date.slice(0, 4));
  const md = date.slice(5);
  const e = easter(y), tg = thanksgiving(y), mem = memorialDay(y), lab = laborDay(y);
  const near = (day, before, after) => date >= addDays(day, -before) && date <= addDays(day, after);
  let id;
  if (md >= '12-30' || md <= '01-03') id = 'newyear';
  else if (md >= '02-01' && md <= '02-14') id = 'valentines';
  else if (near(e, 14, 1)) id = 'easter';
  else if (near(mem, 5, 1) || (md >= '06-24' && md <= '07-05') || near(lab, 5, 1)) id = 'patriotic';
  else if (near(tg, 14, 3)) id = 'thanksgiving';
  else if (date > addDays(tg, 3) && md <= '12-29') id = 'christmas';
  else {
    const m = Number(date.slice(5, 7));
    id = m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
  }
  return SEASON_DECKS.find((d) => d.id === `season-${id}`);
}
