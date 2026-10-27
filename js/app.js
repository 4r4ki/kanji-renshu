'use strict';

// ───────── 小さな道具 ─────────
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kata2hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hira2kata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const isKanji = c => /[一-鿿々]/.test(c);
const LV_LABEL = { 1: '基本', 2: '標準', 3: '発展' };

// ───────── 保存データ ─────────
const STORE_KEY = 'kanji-renshu-v1';
let SAVE = { stats: {}, kanji: {}, weak: {}, total: { c: 0, w: 0 }, settings: { level: 3, count: 10, answer: 'choice', guide: true } };
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    const d = JSON.parse(raw);
    SAVE = { ...SAVE, ...d, settings: { ...SAVE.settings, ...(d.settings || {}) } };
  }
} catch (e) { /* 保存できない環境でも遊べる */ }
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignore */ }
}

// ───────── データの下ごしらえ ─────────
const BY_CHAR = new Map(KANJI.map(e => [e.k, e]));
const WORDS = [];
const WORD_MAP = new Map();
for (const e of KANJI) {
  for (const [w, r, m, s] of e.w) {
    if (WORD_MAP.has(w)) {
      const x = WORD_MAP.get(w);
      if (!x.ks.includes(e.k)) x.ks.push(e.k);
      if (!x.s && s) x.s = s;
      x.lv = Math.min(x.lv, e.lv);
      continue;
    }
    const chars = [...w];
    let segs = null, read;
    if (r.startsWith('*')) {
      read = r.slice(1);
    } else {
      const parts = r.split('.');
      let pi = 0;
      segs = chars.map(c => (isKanji(c) ? parts[pi++] : c));
      read = segs.join('');
    }
    const alt = [...m.matchAll(/「([ぁ-ん]+)」とも読む/g)].map(a => a[1]);
    const x = { w, chars, segs, read, alt, m, s: s || '', ks: [e.k], lv: e.lv };
    WORDS.push(x);
    WORD_MAP.set(w, x);
  }
}
// 各漢字が言葉の中でどう読まれているか（ことばの中の全漢字を対象）
const READ_IDX = new Map(); // 読み → Set(漢字)
const CHAR_ON = new Map();  // 漢字 → Set(音読み系)
const CHAR_KUN = new Map(); // 漢字 → Set(訓読み系)
function addRead(map, c, r) {
  if (!r) return;
  if (!map.has(c)) map.set(c, new Set());
  map.get(c).add(r);
  if (!READ_IDX.has(r)) READ_IDX.set(r, new Set());
  READ_IDX.get(r).add(c);
}
for (const e of KANJI) {
  e.on.forEach(o => addRead(CHAR_ON, e.k, kata2hira(o)));
  e.kun.forEach(k => addRead(CHAR_KUN, e.k, k.split('-')[0]));
}
for (const x of WORDS) {
  if (!x.segs) continue;
  const okuri = x.chars.some(c => !isKanji(c));
  x.chars.forEach((c, i) => {
    if (!isKanji(c)) return;
    const s = x.segs[i];
    const kun = (CHAR_KUN.get(c) && CHAR_KUN.get(c).has(s)) || (okuri && !(CHAR_ON.get(c) && CHAR_ON.get(c).has(s)));
    addRead(kun ? CHAR_KUN : CHAR_ON, c, s);
  });
}
const NITA_MAP = new Map();
for (const g of NITA) for (const c of g) {
  if (!NITA_MAP.has(c)) NITA_MAP.set(c, new Set());
  for (const d of g) if (d !== c) NITA_MAP.get(c).add(d);
}
const DOU_WORDS = new Set();
for (const [, list] of [...DOUON, ...DOUKUN]) for (const [w] of list) DOU_WORDS.add(w);
const isRealWord = w => WORD_MAP.has(w) || DOU_WORDS.has(w);

function kanaForm(x) {
  if (!x.segs) return hira2kata(x.read);
  return x.chars.map((c, i) => (isKanji(c) ? hira2kata(x.segs[i]) : c)).join('');
}
const level = () => SAVE.settings.level;
const poolKanji = () => KANJI.filter(e => e.lv <= level());
const poolWords = () => WORDS.filter(x => x.lv <= level());

// ───────── まちがいの選択肢づくり ─────────
const DAKU_PAIRS = 'かがきぎくぐけげこごさざしじすずせぜそぞただちぢつづてでとどはばひびふぶへべほぼ';
function dakuVariants(ch) {
  const out = [];
  for (let i = 0; i < DAKU_PAIRS.length; i += 2) {
    if (ch === DAKU_PAIRS[i]) out.push(DAKU_PAIRS[i + 1]);
    if (ch === DAKU_PAIRS[i + 1]) out.push(DAKU_PAIRS[i]);
  }
  const HA = 'はひふへほ', PA = 'ぱぴぷぺぽ', BA = 'ばびぶべぼ';
  let i;
  if ((i = HA.indexOf(ch)) >= 0) out.push(PA[i]);
  if ((i = PA.indexOf(ch)) >= 0) out.push(HA[i], BA[i]);
  if ((i = BA.indexOf(ch)) >= 0) out.push(PA[i]);
  return out.filter(c => c !== 'ぢ' && c !== 'づ');
}
// 読みを少しだけ変えた「ありがちなまちがい」
function perturb(s) {
  const out = new Set();
  for (const d of dakuVariants(s[0])) out.add(d + s.slice(1));
  const last = s[s.length - 1];
  if (s.length >= 2 && last === 'う' && /[おこそとのほもよろごぞどぼぽょゅ]/.test(s[s.length - 2])) out.add(s.slice(0, -1));
  if (/[ょゅ]$/.test(s) || (s.length === 1 && /[こそとほもろごぞど]/.test(s))) out.add(s + 'う');
  if (last === 'っ') { out.add(s.slice(0, -1) + 'つ'); out.add(s.slice(0, -1) + 'く'); }
  if (s.length >= 2 && /[つく]$/.test(s)) out.add(s.slice(0, -1) + 'っ');
  if (s.includes('ょ')) out.add(s.replace('ょ', 'ゅ'));
  if (s.includes('ゅ')) out.add(s.replace('ゅ', 'ょ'));
  out.delete(s);
  return [...out];
}
// 「とっい」「っ」で終わる、などの日本語にない並びをはじく
const validKana = r => !/っ($|[あいうえおなにぬねのまみむめもやゆよらりるれろわをんっ])/.test(r) && !/(^|[^きぎしじちぢにひびぴみりゃゅょ])[ゃゅょ]/.test(r);
function readingDistractors(x) {
  const good = new Set([x.read, ...x.alt]);
  const t1 = new Set(), t2 = new Set();
  if (x.segs) {
    x.chars.forEach((c, i) => {
      if (!isKanji(c)) return;
      const s = x.segs[i];
      const isKun = CHAR_KUN.get(c) && CHAR_KUN.get(c).has(s);
      const same = (isKun ? CHAR_KUN : CHAR_ON).get(c) || new Set();
      const other = (isKun ? CHAR_ON : CHAR_KUN).get(c) || new Set();
      const put = (set, a) => { if (a === s) return; const g = x.segs.slice(); g[i] = a; set.add(g.join('')); };
      perturb(s).forEach(a => put(t1, a));
      same.forEach(a => put(t1, a));
      // 形の似た漢字の読みとまちがえる（例：際→さつ）
      if (!isKun) for (const h of NITA_MAP.get(c) || []) (CHAR_ON.get(h) || []).forEach(a => put(t1, a));
      other.forEach(a => put(t2, a));
    });
  } else {
    [...x.read].forEach((ch, i) => dakuVariants(ch).forEach(d => t1.add(x.read.slice(0, i) + d + x.read.slice(i + 1))));
  }
  const fine = r => !good.has(r) && validKana(r);
  let out = shuffle([...t1].filter(fine));
  if (out.length < 3) out = out.concat(shuffle([...t2].filter(r => fine(r) && !out.includes(r))));
  if (out.length < 3) {
    // 同じ形（字数・送りがな）のことばの読みを借りる
    const tail = w => w.chars.filter((c, i) => i > w.chars.findLastIndex(isKanji)).join('');
    const similar = WORDS.filter(y => y !== x && y.chars.length === x.chars.length && tail(y) === tail(x));
    const near = WORDS.filter(y => y !== x && Math.abs(y.read.length - x.read.length) <= 1);
    const more = [...shuffle(similar), ...shuffle(near)].map(y => y.read);
    for (const r of more) { if (out.length >= 3) break; if (!good.has(r) && !out.includes(r)) out.push(r); }
  }
  return out.slice(0, 3);
}
const replaceAt = (chars, i, c) => chars.map((d, j) => (j === i ? c : d)).join('');
function writeDistractors(x) {
  const t1 = new Set(), t2 = new Set();
  x.chars.forEach((c, i) => {
    if (!isKanji(c)) return;
    if (x.segs) {
      const s = x.segs[i];
      const keys = [s];
      if (s.endsWith('っ')) ['つ', 'く', 'ち', 'き'].forEach(t => keys.push(s.slice(0, -1) + t));
      for (const r of keys) for (const h of READ_IDX.get(r) || []) if (h !== c) t1.add(replaceAt(x.chars, i, h));
    }
    for (const h of NITA_MAP.get(c) || []) t2.add(replaceAt(x.chars, i, h));
  });
  const ok = w => w !== x.w && !isRealWord(w);
  const a = shuffle([...t1].filter(ok)), b = shuffle([...t2].filter(ok));
  // 同じ読みの漢字（同音）を2つ、形の似た漢字を1つ、を目安にまぜる
  const out = [];
  const take = (arr, n) => { while (n-- > 0 && arr.length) { const w = arr.shift(); if (!out.includes(w)) out.push(w); else n++; } };
  take(a, 2); take(b, 3 - out.length); take(a, 3 - out.length);
  if (out.length < 3) {
    const ks = x.chars.map((c, i) => [c, i]).filter(([c]) => isKanji(c));
    const pool = shuffle(KANJI.map(e => e.k));
    for (const k of pool) {
      if (out.length >= 3) break;
      const [, i] = pick(ks);
      const w = replaceAt(x.chars, i, k);
      if (ok(w) && !out.includes(w)) out.push(w);
    }
  }
  return out.slice(0, 3);
}

// ───────── 問題づくり ─────────
const TYPE_LABEL = {
  yomi: '読み', kaki: '書き取り', imi: '意味', kakijun: '書き順・画数',
  yoji: '四字熟語', taigi: '対義語・類義語', douon: '同音異義語・同訓異字',
};
function sentenceHTML(s, inner) {
  if (!s) return '';
  const [a, b] = s.split('＊');
  return esc(a) + inner + esc(b || '');
}
function wordExplain(x) {
  return `<div class="ans">${esc(x.w)}<span class="muted">（${esc(x.read)}）</span></div>
    <div class="exp">${esc(x.m)}</div>${kanjiChips(x.chars)}`;
}
function kanjiChips(chars) {
  const ks = [...new Set(chars.filter(isKanji))];
  return `<div class="chips" style="margin-top:6px">${ks.map(c => BY_CHAR.has(c)
    ? `<a class="chip" href="#/kanji/${encodeURIComponent(c)}" title="くわしく見る">${c}</a>`
    : `<span class="chip">${c}</span>`).join('')}</div>`;
}
function mkChoices(answer, wrongs) {
  const choices = shuffle([answer, ...wrongs]);
  return { choices, answer: choices.indexOf(answer) };
}

const MAKERS = {
  yomi(id) {
    const x = WORD_MAP.get(id);
    const { choices, answer } = mkChoices(x.read, readingDistractors(x));
    const prompt = x.s
      ? `<div class="qtext">――線のことばの読みをえらぼう。</div><div class="qsent">${sentenceHTML(x.s, `<u>${esc(x.w)}</u>`)}</div>`
      : `<div class="qtext">読みをえらぼう。</div><div class="qbig">${esc(x.w)}</div>`;
    return { prompt, choices, answer, explain: wordExplain(x), kanji: x.chars.filter(isKanji), label: x.w };
  },
  kaki(id) {
    const x = WORD_MAP.get(id);
    const { choices, answer } = mkChoices(x.w, writeDistractors(x));
    const kata = kanaForm(x);
    const prompt = x.s
      ? `<div class="qtext">カタカナを漢字にしよう。</div><div class="qsent">${sentenceHTML(x.s, `<u class="kata">${esc(kata)}</u>`)}</div><div class="qhint">ヒント：${esc(x.m)}</div>`
      : `<div class="qtext">カタカナを漢字にしよう。</div><div class="qbig kata">${esc(kata)}</div><div class="qhint">ヒント：${esc(x.m)}</div>`;
    return { prompt, choices, answer, kfont: true, explain: wordExplain(x), kanji: x.chars.filter(isKanji), label: x.w, writable: x.w };
  },
  imi(id) {
    const x = WORD_MAP.get(id);
    const others = shuffle(WORDS.filter(y => y.m !== x.m && y.w !== x.w && !y.ks.some(k => x.ks.includes(k)))).slice(0, 3).map(y => y.m);
    const { choices, answer } = mkChoices(x.m, others);
    const prompt = `<div class="qtext">ことばの意味をえらぼう。</div><div class="qbig">${esc(x.w)}</div><div class="qhint" style="text-align:center">${esc(x.read)}</div>`;
    return { prompt, choices, answer, text: true, explain: wordExplain(x), kanji: x.chars.filter(isKanji), label: x.w };
  },
  kakijun(id) {
    const e = BY_CHAR.get(id);
    const n = STROKES[id].length;
    const near = (v, lo) => {
      const set = new Set();
      for (const d of shuffle([-2, -1, 1, 2, 3, -3])) { const t = v + d; if (t >= lo && t !== v) set.add(t); if (set.size >= 3) break; }
      return [...set];
    };
    if (Math.random() < 0.6 && n >= 3) {
      const i = 1 + Math.floor(Math.random() * n);
      const wrongs = near(i, 1).filter(t => t <= n);
      for (let t = 1; wrongs.length < 3 && t <= n; t++) if (t !== i && !wrongs.includes(t)) wrongs.push(t);
      const { choices, answer } = mkChoices(i, wrongs.slice(0, 3));
      const prompt = `<div class="qtext">赤いところは何画目に書くかな？</div>${kanjiSVG(id, { cls: 'qsvg', highlight: i - 1 })}`;
      return {
        prompt, choices: choices.map(v => `${v}画目`), answer,
        explain: `<div class="ans">${esc(id)}　${i}画目<span class="muted">（全部で${n}画）</span></div>${kanjiSVG(id, { numbers: true, highlight: i - 1 })}${kanjiChips([id])}`,
        kanji: [id], label: `${id}の${i}画目`,
      };
    }
    const { choices, answer } = mkChoices(n, near(n, 2));
    const prompt = `<div class="qtext">この漢字の総画数は？</div><div class="qbig" style="font-size:96px">${esc(id)}</div>`;
    return {
      prompt, choices: choices.map(v => `${v}画`), answer,
      explain: `<div class="ans">${esc(id)}　${n}画</div><div class="exp">${esc(e.m)}</div>${kanjiSVG(id, { numbers: true })}${kanjiChips([id])}`,
      kanji: [id], label: `${id}の画数`,
    };
  },
  yoji(id) {
    const [w, r, m, bi, wrongs] = YOJI[+id];
    const chars = [...w];
    const explain = `<div class="ans">${esc(w)}<span class="muted">（${esc(r)}）</span></div><div class="exp">${esc(m)}</div>${kanjiChips(chars)}`;
    if (Math.random() < 0.65) {
      const shown = chars.map((c, i) => (i === bi ? '<span style="color:var(--accent)">□</span>' : esc(c))).join('');
      const { choices, answer } = mkChoices(chars[bi], wrongs);
      const prompt = `<div class="qtext">□に入る漢字をえらぼう。</div><div class="qbig">${shown}</div><div class="qhint" style="text-align:center">${esc(r)}</div><div class="qhint">意味：${esc(m)}</div>`;
      return { prompt, choices, answer, kfont: true, explain, kanji: chars.filter(c => BY_CHAR.has(c)), label: w };
    }
    const others = shuffle(YOJI.filter(y => y[0] !== w)).slice(0, 3).map(y => y[0]);
    const { choices, answer } = mkChoices(w, others);
    const prompt = `<div class="qtext">次の意味の四字熟語をえらぼう。</div><div class="qsent" style="font-size:20px">「${esc(m)}」</div>`;
    return { prompt, choices, answer, kfont: true, explain, kanji: chars.filter(c => BY_CHAR.has(c)), label: w };
  },
  taigi(id) {
    const tai = id[0] === 't';
    const list = tai ? TAIGI : RUIGI;
    const [a, ar, b, br] = list[+id.slice(1)];
    const flip = Math.random() < 0.5;
    const [q, qr, ans, ansr] = flip ? [b, br, a, ar] : [a, ar, b, br];
    // 同じ字をふくむ言葉や、ペアになりうる言葉はまちがいの選択肢から外す
    const related = new Set([q, ans]);
    for (const [x, , y] of [...TAIGI, ...RUIGI]) {
      if (x === q || y === q) { related.add(x); related.add(y); }
    }
    const pool = [...new Set(list.flatMap(p => [p[0], p[2]]))]
      .filter(w => !related.has(w) && ![...w].some(c => ans.includes(c) || q.includes(c)));
    const { choices, answer } = mkChoices(ans, shuffle(pool).slice(0, 3));
    const kind = tai ? '対義語（反対の意味のことば）' : '類義語（似た意味のことば）';
    const prompt = `<div class="qtext">「${esc(q)}」の${kind}をえらぼう。</div><div class="qbig">${esc(q)}</div><div class="qhint" style="text-align:center">${esc(qr)}</div>`;
    return {
      prompt, choices, answer, kfont: true,
      explain: `<div class="ans">${esc(q)} ${tai ? '⇔' : '≒'} ${esc(ans)}<span class="muted">（${esc(ansr)}）</span></div>${kanjiChips([...q, ...ans])}`,
      kanji: [...q, ...ans].filter(c => BY_CHAR.has(c)), label: `${q}${tai ? '⇔' : '≒'}${ans}`,
    };
  },
  douon(id) {
    const kun = id[0] === 'k';
    const [si, mi] = id.slice(1).split('.').map(Number);
    const [reading, list] = (kun ? DOUKUN : DOUON)[si];
    const [w, s] = list[mi];
    let kata;
    if (kun) {
      const okuri = [...w].reverse().findIndex(c => isKanji(c));
      const tail = okuri > 0 ? w.slice(w.length - okuri) : '';
      kata = hira2kata(reading.slice(0, reading.length - tail.length)) + tail;
    } else {
      kata = hira2kata(reading);
    }
    const { choices, answer } = mkChoices(w, list.filter(([v]) => v !== w).map(([v]) => v));
    const prompt = `<div class="qtext">${kun ? '同訓異字' : '同音異義語'}：カタカナに合う漢字をえらぼう。</div><div class="qsent">${sentenceHTML(s, `<u class="kata">${esc(kata)}</u>`)}</div>`;
    const explain = `<div class="exp">${list.map(([v, t]) => `<div${v === w ? ' style="font-weight:800"' : ''}><span class="k" style="font-size:18px">${esc(v)}</span>　${sentenceHTML(t, `<b>${esc(v)}</b>`)}</div>`).join('')}</div>${kanjiChips([...w])}`;
    return { prompt, choices, answer, kfont: true, explain, kanji: [...w].filter(c => BY_CHAR.has(c)), label: w };
  },
};
function makeQuestion(key) {
  const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const q = MAKERS[type](id);
  q.key = key;
  q.type = type;
  return q;
}
function keysFor(type) {
  switch (type) {
    case 'yomi': case 'imi': return poolWords().map(x => `${type}:${x.w}`);
    case 'kaki': return poolWords().map(x => `kaki:${x.w}`);
    case 'kakijun': return poolKanji().map(e => `kakijun:${e.k}`);
    case 'yoji': return YOJI.map((_, i) => `yoji:${i}`);
    case 'taigi': return [...TAIGI.map((_, i) => `taigi:t${i}`), ...RUIGI.map((_, i) => `taigi:r${i}`)];
    case 'douon': {
      const out = [];
      DOUON.forEach(([, l], i) => l.forEach((_, j) => out.push(`douon:o${i}.${j}`)));
      DOUKUN.forEach(([, l], i) => l.forEach((_, j) => out.push(`douon:k${i}.${j}`)));
      return out;
    }
  }
  return [];
}
// まだ解いていない問題・まちがえた問題を優先して選ぶ
function choose(keys, n) {
  const score = k => {
    const s = SAVE.stats[k];
    const base = s ? s.c - s.w * 2 + 1 : 0;
    return base + Math.random() * 2.5 + (SAVE.weak[k] ? -3 : 0);
  };
  return keys.map(k => [k, score(k)]).sort((a, b) => a[1] - b[1]).slice(0, n).map(a => a[0]);
}
function buildKeys(mode) {
  const n = SAVE.settings.count;
  if (mode === 'weak') return shuffle(Object.keys(SAVE.weak)).slice(0, n);
  if (mode === 'mix') {
    const types = ['yomi', 'kaki', 'kaki', 'yomi', 'imi', 'kakijun', 'yoji', 'taigi', 'douon'];
    const used = new Set();
    const out = [];
    for (let i = 0; i < n * 4 && out.length < n; i++) {
      const t = pick(types);
      const [k] = choose(keysFor(t).filter(x => !used.has(x)), 1);
      if (k) { used.add(k); out.push(k); }
    }
    return out;
  }
  if (mode.startsWith('one:')) {
    const c = mode.slice(4);
    const e = BY_CHAR.get(c);
    const ks = [`kakijun:${c}`, `kakijun:${c}`];
    for (const [w] of e.w) ks.push(`yomi:${w}`, `kaki:${w}`, `imi:${w}`);
    return shuffle(ks).slice(0, Math.max(n, 6));
  }
  return choose(keysFor(mode), n);
}

// ───────── 記録 ─────────
function record(q, ok) {
  const s = SAVE.stats[q.key] || (SAVE.stats[q.key] = { c: 0, w: 0 });
  ok ? s.c++ : s.w++;
  for (const c of new Set(q.kanji)) {
    const k = SAVE.kanji[c] || (SAVE.kanji[c] = { c: 0, w: 0 });
    ok ? k.c++ : k.w++;
  }
  if (!ok) SAVE.weak[q.key] = 2;
  else if (SAVE.weak[q.key]) { if (--SAVE.weak[q.key] <= 0) delete SAVE.weak[q.key]; }
  ok ? SAVE.total.c++ : SAVE.total.w++;
  save();
}
function masteryClass(c) {
  const k = SAVE.kanji[c];
  if (!k || k.c + k.w === 0) return '';
  const rate = k.c / (k.c + k.w);
  if (rate >= 0.8 && k.c >= 3) return 'g';
  if (rate >= 0.5) return 'y';
  return 'r';
}

// ───────── 漢字のSVG ─────────
const GRID = '<rect class="frame" x="1" y="1" width="107" height="107" rx="6"/><path class="grid-l" d="M54.5,1V108M1,54.5H108"/>';
function kanjiSVG(c, { cls = '', numbers = false, highlight = -1, ghost = true, hideInk = false } = {}) {
  const st = STROKES[c];
  if (!st) return '';
  const paths = st.map((s, i) => `<path d="${s[0]}" data-i="${i}"${hideInk ? ' class="hide"' : ''}/>`).join('');
  return `<svg viewBox="0 0 109 109" class="ksvg ${cls}" aria-label="${esc(c)}">${GRID}
    ${ghost ? `<g class="ghost">${st.map(s => `<path d="${s[0]}"/>`).join('')}</g>` : ''}
    <g class="ink">${highlight >= 0 ? '' : paths}</g>
    ${highlight >= 0 ? `<g class="hl"><path d="${st[highlight][0]}"/></g>` : ''}
    <g class="hint"></g>
    ${numbers ? `<g class="nums">${st.map((s, i) => `<text x="${s[1]}" y="${s[2]}">${i + 1}</text>`).join('')}</g>` : ''}
  </svg>`;
}
// 書き順アニメーション
class StrokePlayer {
  constructor(svg) {
    this.svg = svg;
    this.paths = $$('.ink path', svg);
    this.lens = this.paths.map(p => p.getTotalLength());
    this.shown = this.paths.length;
    this.token = 0;
  }
  setShown(n, cur = -1) {
    this.shown = n;
    this.paths.forEach((p, i) => {
      p.getAnimations().forEach(a => a.cancel());
      p.style.strokeDasharray = '';
      p.style.strokeDashoffset = '';
      p.classList.toggle('hide', i >= n);
      p.classList.toggle('cur', i === cur);
    });
  }
  async drawOne(i, token) {
    const p = this.paths[i], L = this.lens[i];
    p.classList.remove('hide');
    p.classList.add('cur');
    p.style.strokeDasharray = `${L} ${L}`;
    p.style.strokeDashoffset = L;
    const anim = p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: Math.max(280, L * 11), easing: 'ease-in-out', fill: 'forwards' });
    try { await anim.finished; } catch (e) { return false; }
    if (token !== this.token) return false;
    p.style.strokeDashoffset = 0;
    return true;
  }
  async play() {
    const token = ++this.token;
    this.setShown(0);
    await sleep(200);
    for (let i = 0; i < this.paths.length; i++) {
      if (!(await this.drawOne(i, token))) return;
      this.paths[i].classList.remove('cur');
      await sleep(140);
      if (token !== this.token) return;
    }
  }
  async step() {
    const token = ++this.token;
    const n = this.shown >= this.paths.length ? 0 : this.shown;
    this.setShown(n);
    if (n < this.paths.length) {
      await this.drawOne(n, token);
      this.shown = n + 1;
    }
  }
  stop() { this.token++; this.setShown(this.paths.length); }
}

// ───────── 画面切りかえ ─────────
const app = $('#app');
const state = { quiz: null, player: null, cleanup: null };
function setBack(show) { $('#backBtn').hidden = !show; }
$('#backBtn').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  if (state.cleanup) { state.cleanup(); state.cleanup = null; }
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [p, arg] = [h.split('/')[0], h.split('/').slice(1).join('/')];
  window.scrollTo(0, 0);
  if (p === 'dict') return renderDict();
  if (p === 'kanji' && BY_CHAR.has(arg)) return renderKanji(arg);
  if (p === 'practice') return renderPractice(BY_CHAR.has(arg) ? arg : null);
  if (p === 'quiz' && state.quiz) return renderQuiz();
  if (p === 'result' && state.quiz) return renderResult();
  return renderHome();
}
window.addEventListener('hashchange', route);

// ───────── ホーム ─────────
const MENU = [
  ['dict', '辞', '#e2574c', '漢字じてん', '読み・意味・熟語・書き順アニメ'],
  ['practice', '筆', '#2f7dd1', '書き順れんしゅう', '指やペンでなぞって書き順チェック'],
  ['yomi', '読', '#e58a22', '読みクイズ', '熟語・送りがなの読み'],
  ['kaki', '書', '#2e9d5b', '書き取りクイズ', 'カタカナを漢字に'],
  ['imi', '意', '#8a5cc7', '意味クイズ', '熟語の意味をえらぶ'],
  ['kakijun', '画', '#d6453b', '書き順・画数クイズ', '赤い画は何画目？'],
  ['yoji', '四', '#1d9aa5', '四字熟語', '□をうめる・意味から選ぶ'],
  ['taigi', '対', '#b0752a', '対義語・類義語', '反対・似た意味のことば'],
  ['douon', '同', '#5b6dd1', '同音異義語・同訓異字', '対象・対照・対称 など'],
  ['mix', '総', '#2d2a26', 'ミックステスト', 'ぜんぶの問題をまぜて出題'],
];
function renderHome() {
  setBack(false);
  const learned = Object.keys(SAVE.kanji).filter(c => BY_CHAR.has(c)).length;
  const t = SAVE.total, rate = t.c + t.w ? Math.round((t.c / (t.c + t.w)) * 100) : 0;
  const weakN = Object.keys(SAVE.weak).length;
  const st = SAVE.settings;
  const seg = (name, opts) => `<div class="seg" data-set="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(st[name]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  app.innerHTML = `
    <div class="hero">
      <div class="big">漢字<span>れんしゅう</span></div>
      <p>中学入試によく出る漢字 ${KANJI.length}字・熟語 ${WORDS.length}語・四字熟語 ${YOJI.length}語</p>
    </div>
    <div class="stats">
      <div class="stat"><b>${learned}</b><small>学習した漢字</small></div>
      <div class="stat"><b>${rate}%</b><small>正答率（${t.c + t.w}問）</small></div>
      <div class="stat"><b>${weakN}</b><small>にがて</small></div>
    </div>
    <div class="menu">
      ${MENU.map(([id, ic, col, name, sub]) => `<button data-m="${id}"><span class="ic" style="background:${col}">${ic}</span><b>${name}</b><small>${sub}</small></button>`).join('')}
      <button data-m="weak" class="wide" ${weakN ? '' : 'disabled style="opacity:.5"'}><span class="ic" style="background:#d6453b">苦</span><b>にがて復習</b><small>${weakN ? `まちがえた問題 ${weakN}問をもう一度。2回続けて正解すると消えます` : 'まちがえた問題がここにたまります'}</small>${weakN ? `<span class="badge">${weakN}</span>` : ''}</button>
    </div>
    <div class="card" style="margin-top:14px">
      <h2>せってい</h2>
      <div class="setrow"><span>出題レベル</span>${seg('level', [[1, '★ 基本'], [2, '★★ 標準まで'], [3, '★★★ ぜんぶ']])}</div>
      <div class="setrow"><span>問題数</span>${seg('count', [[5, '5問'], [10, '10問'], [20, '20問']])}</div>
      <div class="setrow"><span>書き取りの答え方</span>${seg('answer', [['choice', 'えらぶ'], ['write', '書いて自己採点']])}</div>
      <div class="muted">レベルは中学入試での出やすさ・難しさの目安です（基本 ${KANJI.filter(e => e.lv === 1).length}字・標準 ${KANJI.filter(e => e.lv === 2).length}字・発展 ${KANJI.filter(e => e.lv === 3).length}字）。</div>
      <div style="margin-top:10px"><button class="btn small" id="resetBtn">記録をリセット</button></div>
    </div>`;
  $$('.menu button').forEach(b => b.onclick = () => {
    const m = b.dataset.m;
    if (m === 'dict') return go('#/dict');
    if (m === 'practice') return go('#/practice');
    startQuiz(m);
  });
  $$('.seg[data-set]').forEach(g => g.onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const name = g.dataset.set;
    st[name] = /^\d+$/.test(b.dataset.v) ? +b.dataset.v : b.dataset.v;
    save();
    renderHome();
  });
  $('#resetBtn').onclick = () => {
    if (!confirm('学習の記録をすべて消しますか？')) return;
    SAVE.stats = {}; SAVE.kanji = {}; SAVE.weak = {}; SAVE.total = { c: 0, w: 0 };
    save();
    renderHome();
  };
}

// ───────── じてん ─────────
let dictFilter = { lv: 0, q: '' };
function readingsHTML(e) {
  const on = e.on.map(o => `<span class="rd">${esc(o)}</span>`).join('') || '<span class="muted">なし</span>';
  const kun = e.kun.map(k => {
    const [a, b] = k.split('-');
    return `<span class="rd">${esc(a)}${b ? `<span class="okuri">（${esc(b)}）</span>` : ''}</span>`;
  }).join('') || '<span class="muted">なし</span>';
  return { on, kun };
}
function matchKanji(e, q) {
  if (!q) return true;
  const hq = kata2hira(q);
  return e.k.includes(q) || e.on.some(o => kata2hira(o).startsWith(hq)) || e.kun.some(k => k.replace('-', '').startsWith(hq)) || e.w.some(([w, r]) => w.includes(q) || r.replace(/[.*]/g, '').startsWith(hq));
}
function renderDict() {
  setBack(true);
  app.innerHTML = `
    <div class="card">
      <h2>漢字じてん</h2>
      <input class="search" id="q" placeholder="漢字・読み・熟語でさがす（例：けん、経験）" value="${esc(dictFilter.q)}">
      <div class="seg" id="lvSeg">${[[0, 'すべて'], [1, '★ 基本'], [2, '★★ 標準'], [3, '★★★ 発展']].map(([v, l]) => `<button data-v="${v}" class="${dictFilter.lv === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="muted" style="margin-top:8px">● の色：<span style="color:var(--ok)">●</span> よくできた <span style="color:var(--warn)">●</span> もう少し <span style="color:var(--ng)">●</span> にがて</div>
    </div>
    <div class="grid" id="kgrid"></div>`;
  const draw = () => {
    const list = KANJI.filter(e => (!dictFilter.lv || e.lv === dictFilter.lv) && matchKanji(e, dictFilter.q.trim()));
    $('#kgrid').innerHTML = list.length ? list.map(e => {
      const m = masteryClass(e.k);
      return `<a href="#/kanji/${encodeURIComponent(e.k)}">${e.k}<span class="lv">${'★'.repeat(e.lv)}</span>${m ? `<i class="dot ${m}"></i>` : ''}</a>`;
    }).join('') : '<div class="empty" style="grid-column:1/-1">見つかりませんでした</div>';
  };
  $('#q').oninput = ev => { dictFilter.q = ev.target.value; draw(); };
  $('#lvSeg').onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    dictFilter.lv = +b.dataset.v;
    $$('#lvSeg button').forEach(x => x.classList.toggle('on', x === b));
    draw();
  };
  draw();
}
function renderKanji(c) {
  setBack(true);
  const e = BY_CHAR.get(c);
  const n = STROKES[c].length;
  const { on, kun } = readingsHTML(e);
  const idx = KANJI.indexOf(e);
  const prev = KANJI[idx - 1], next = KANJI[idx + 1];
  const nita = [...(NITA_MAP.get(c) || [])];
  const k = SAVE.kanji[c];
  app.innerHTML = `
    <div class="card">
      <div class="detail">
        <div class="player">
          ${kanjiSVG(c, { cls: 'big' })}
          <div class="pbtns">
            <button class="btn small blue" id="pPlay">▶ 書き順</button>
            <button class="btn small" id="pStep">1画ずつ</button>
            <button class="btn small" id="pNum">番号</button>
          </div>
        </div>
        <div class="info">
          <h2 style="font-size:15px;color:var(--sub);margin-top:0">${'★'.repeat(e.lv)} ${LV_LABEL[e.lv]}${k ? `　<span class="muted">クイズ ${k.c}問正解 / ${k.c + k.w}問</span>` : ''}</h2>
          <dl>
            <dt>画数</dt><dd>${n}画</dd>
            <dt>音読み</dt><dd>${on}</dd>
            <dt>訓読み</dt><dd>${kun}</dd>
            <dt>意味</dt><dd>${esc(e.m)}</dd>
          </dl>
          ${nita.length ? `<h3>形の似た漢字に注意</h3>${kanjiChips(nita)}` : ''}
          <div class="pbtns" style="justify-content:flex-start;margin-top:14px">
            <a class="btn small pri" href="#/practice/${encodeURIComponent(c)}" style="text-decoration:none">✍ なぞって練習</a>
            <button class="btn small" id="oneQuiz">この漢字のクイズ</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>熟語・ことば</h2>
      <ul class="words">
        ${e.w.map(([w, r, m, s]) => {
          const x = WORD_MAP.get(w);
          return `<li><span class="w">${esc(w)}</span><span class="r">${esc(x.read)}</span><div class="m">${esc(m)}</div>${s ? `<div class="ex">例）${sentenceHTML(s, `<b>${esc(w)}</b>`)}</div>` : ''}</li>`;
        }).join('')}
      </ul>
    </div>
    <div class="navrow">
      ${prev ? `<a class="btn small" style="text-decoration:none" href="#/kanji/${encodeURIComponent(prev.k)}">← ${prev.k}</a>` : '<span></span>'}
      <a class="btn small" style="text-decoration:none" href="#/dict">一覧</a>
      ${next ? `<a class="btn small" style="text-decoration:none" href="#/kanji/${encodeURIComponent(next.k)}">${next.k} →</a>` : '<span></span>'}
    </div>`;
  const svg = $('.player .ksvg');
  const player = new StrokePlayer(svg);
  let showNum = false;
  $('#pPlay').onclick = () => player.play();
  $('#pStep').onclick = () => player.step();
  $('#pNum').onclick = () => {
    showNum = !showNum;
    const old = $('.nums', svg);
    if (old) old.remove();
    if (showNum) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'nums');
      g.innerHTML = STROKES[c].map((s, i) => `<text x="${s[1]}" y="${s[2]}">${i + 1}</text>`).join('');
      svg.appendChild(g);
    }
    $('#pNum').classList.toggle('blue', showNum);
  };
  $('#oneQuiz').onclick = () => startQuiz('one:' + c);
  state.cleanup = () => player.stop();
  setTimeout(() => player.play(), 250);
}

// ───────── 書き順れんしゅう（なぞり書き） ─────────
const SAMPLE_N = 24;
function samplePath(d) {
  const p = $('#samplerPath');
  p.setAttribute('d', d);
  const L = p.getTotalLength();
  const pts = [];
  for (let i = 0; i < SAMPLE_N; i++) {
    const q = p.getPointAtLength((L * i) / (SAMPLE_N - 1));
    pts.push([q.x, q.y]);
  }
  return { pts, len: L };
}
function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function resample(pts, n = SAMPLE_N) {
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0].slice());
  const total = polyLen(pts);
  if (total === 0) return Array.from({ length: n }, () => pts[0].slice());
  const out = [pts[0].slice()];
  const step = total / (n - 1);
  let acc = 0, i = 1, prev = pts[0].slice();
  while (out.length < n - 1 && i < pts.length) {
    const cur = pts[i];
    const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const np = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
      out.push(np);
      prev = np;
      acc = 0;
    } else {
      acc += d;
      prev = cur;
      i++;
    }
  }
  while (out.length < n) out.push(pts[pts.length - 1].slice());
  return out;
}
const meanDist = (a, b) => a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;
function judgeStroke(raw, samples, cur) {
  const u = resample(raw);
  const ulen = polyLen(raw);
  const T = 13;
  const fit = (s, pts) => {
    const lenOk = s.len < 18 ? ulen < 45 : ulen > s.len * 0.35 && ulen < s.len * 2.3;
    return { d: meanDist(u, pts), lenOk };
  };
  const e = samples[cur];
  const f = fit(e, e.pts);
  if (f.d < T && f.lenOk) return { ok: true };
  const r = fit(e, e.pts.slice().reverse());
  if (r.d < T && r.lenOk && r.d < f.d) return { ok: false, why: 'reverse' };
  for (let j = cur + 1; j < samples.length; j++) {
    const g = fit(samples[j], samples[j].pts);
    if (g.d < T * 0.9 && g.lenOk) return { ok: false, why: 'order', j };
  }
  return { ok: false, why: 'miss' };
}
function renderPractice(c) {
  setBack(true);
  const given = !!c;
  if (!c) c = pick(poolKanji()).k;
  const e = BY_CHAR.get(c);
  const st = STROKES[c];
  const samples = st.map(s => samplePath(s[0]));
  let cur = 0, miss = 0, missHere = 0;
  const guide = SAVE.settings.guide;
  app.innerHTML = `
    <div class="card">
      <h2 style="display:flex;align-items:center;gap:8px">書き順れんしゅう <span class="k" style="font-size:28px">${c}</span><span class="muted">${st.length}画　${esc(e.on.concat(e.kun.map(k => k.replace('-', ''))).join('・'))}</span></h2>
      <div class="setrow"><span>お手本</span><div class="seg" id="gSeg"><button data-v="1" class="${guide ? 'on' : ''}">うすく表示（なぞる）</button><button data-v="0" class="${guide ? '' : 'on'}">かくす（何も見ないで）</button></div></div>
      <div class="practice">
        ${kanjiSVG(c, { hideInk: true, cls: guide ? '' : 'noguide' })}
        <canvas id="pc"></canvas>
      </div>
      <div class="pmsg" id="pmsg">1画目から書いてみよう</div>
      <div class="pbtns">
        <button class="btn small" id="hintBtn">ヒント</button>
        <button class="btn small" id="againBtn">はじめから</button>
        <a class="btn small" style="text-decoration:none" href="#/kanji/${encodeURIComponent(c)}">じてんで見る</a>
        <button class="btn small blue" id="nextBtn">ほかの漢字 →</button>
      </div>
    </div>`;
  const svg = $('.practice .ksvg');
  const inkPaths = $$('.ink path', svg);
  const hintG = $('.hint', svg);
  const cv = $('#pc');
  const ctx = cv.getContext('2d');
  const msg = (t, cls = '') => { const m = $('#pmsg'); m.textContent = t; m.className = 'pmsg ' + cls; };
  const fitCanvas = () => {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fitCanvas();
  const showHint = async () => {
    if (cur >= st.length) return;
    hintG.innerHTML = `<path d="${st[cur][0]}"/>`;
    const p = hintG.firstChild, L = p.getTotalLength();
    p.style.strokeDasharray = `${L} ${L}`;
    try { await p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: Math.max(400, L * 14), fill: 'forwards' }).finished; } catch (err) { /* ignore */ }
    await sleep(500);
    hintG.innerHTML = '';
  };
  const reset = () => {
    cur = 0; miss = 0; missHere = 0;
    inkPaths.forEach(p => p.classList.add('hide'));
    msg('1画目から書いてみよう');
  };
  let pts = null;
  const toUnit = ev => {
    const r = cv.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * 109, ((ev.clientY - r.top) / r.height) * 109];
  };
  cv.onpointerdown = ev => {
    if (cur >= st.length) return;
    cv.setPointerCapture(ev.pointerId);
    pts = [toUnit(ev)];
    const r = cv.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(47,125,209,.75)';
    ctx.beginPath();
    ctx.moveTo(ev.clientX - r.left, ev.clientY - r.top);
    ev.preventDefault();
  };
  cv.onpointermove = ev => {
    if (!pts) return;
    const r = cv.getBoundingClientRect();
    pts.push(toUnit(ev));
    ctx.lineTo(ev.clientX - r.left, ev.clientY - r.top);
    ctx.stroke();
  };
  cv.onpointerup = cv.onpointercancel = () => {
    if (!pts) return;
    const raw = pts;
    pts = null;
    const r = cv.getBoundingClientRect();
    setTimeout(() => ctx.clearRect(0, 0, r.width, r.height), 120);
    const res = judgeStroke(raw, samples, cur);
    if (res.ok) {
      inkPaths[cur].classList.remove('hide');
      cur++;
      missHere = 0;
      if (cur >= st.length) {
        msg(miss === 0 ? `かんぺき！ ノーミスで書けたね 🎉` : `できた！（ミス ${miss}回）もう一度ノーミスに挑戦しよう`, 'ok');
        SAVE.kanji[c] = SAVE.kanji[c] || { c: 0, w: 0 };
        if (miss === 0) SAVE.kanji[c].c++;
        save();
      } else {
        msg(`${cur}画目 ○　つぎは${cur + 1}画目`, 'ok');
      }
      return;
    }
    miss++;
    missHere++;
    if (res.why === 'reverse') msg(`${cur + 1}画目：書く向きが逆だよ`, 'ng');
    else if (res.why === 'order') msg(`書き順がちがうよ！ それは${res.j + 1}画目。先に${cur + 1}画目を書こう`, 'ng');
    else msg(`${cur + 1}画目がちがうみたい。もう一度`, 'ng');
    if (missHere >= 2) showHint();
  };
  $('#hintBtn').onclick = () => { miss++; showHint(); };
  $('#againBtn').onclick = reset;
  $('#nextBtn').onclick = () => {
    const pool = poolKanji().filter(x => x.k !== c);
    go('#/practice/' + encodeURIComponent(pick(pool).k));
  };
  $('#gSeg').onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    SAVE.settings.guide = b.dataset.v === '1';
    save();
    svg.classList.toggle('noguide', !SAVE.settings.guide);
    $$('#gSeg button').forEach(x => x.classList.toggle('on', x === b));
  };
  window.addEventListener('resize', fitCanvas);
  state.cleanup = () => window.removeEventListener('resize', fitCanvas);
  if (!given) history.replaceState(null, '', '#/practice/' + encodeURIComponent(c));
}

// ───────── クイズ ─────────
function startQuiz(mode) {
  const keys = buildKeys(mode);
  if (!keys.length) { alert('問題がありません'); return; }
  const qs = [];
  for (const k of keys) {
    try { qs.push(makeQuestion(k)); } catch (err) { console.warn('skip', k, err); }
  }
  state.quiz = { mode, qs, idx: 0, answers: [] };
  go('#/quiz');
}
function modeTitle(mode) {
  if (mode === 'mix') return 'ミックステスト';
  if (mode === 'weak') return 'にがて復習';
  if (mode.startsWith('one:')) return `「${mode.slice(4)}」のクイズ`;
  return TYPE_LABEL[mode] + 'クイズ';
}
function renderQuiz() {
  setBack(true);
  const Q = state.quiz;
  if (Q.idx >= Q.qs.length) return go('#/result');
  const q = Q.qs[Q.idx];
  const done = Q.answers[Q.idx];
  const write = q.writable && SAVE.settings.answer === 'write';
  const cls = ['choices', q.kfont ? 'kfont' : '', q.text ? 'text one' : ''].join(' ');
  app.innerHTML = `
    <div class="qhead"><span class="qtype">${esc(modeTitle(Q.mode))}</span><div class="bar"><i style="width:${(Q.idx / Q.qs.length) * 100}%"></i></div><span class="qtype">${Q.idx + 1} / ${Q.qs.length}</span></div>
    <div class="card">
      <div class="qtype" style="margin-bottom:4px">【${TYPE_LABEL[q.type]}】</div>
      ${q.prompt}
      ${write ? `<div class="padwrap" id="padwrap"></div>` : `<div class="${cls}" id="choices">${q.choices.map((c, i) => `<button data-i="${i}"><span class="n">${i + 1}</span>${esc(c)}</button>`).join('')}</div>`}
      <div id="fb"></div>
    </div>`;
  if (write) setupWritePad(q, done);
  else {
    $$('#choices button').forEach(b => b.onclick = () => answer(+b.dataset.i));
    if (done) showFeedback(done.pick === q.answer, done.pick);
  }
  const onKey = ev => {
    if (ev.target.tagName === 'INPUT') return;
    if (/^[1-4]$/.test(ev.key) && !Q.answers[Q.idx] && !write) answer(+ev.key - 1);
    if ((ev.key === 'Enter' || ev.key === ' ') && Q.answers[Q.idx]) { ev.preventDefault(); nextQ(); }
  };
  document.addEventListener('keydown', onKey);
  state.cleanup = () => document.removeEventListener('keydown', onKey);
}
function answer(i) {
  const Q = state.quiz;
  if (Q.answers[Q.idx]) return;
  const q = Q.qs[Q.idx];
  const ok = i === q.answer;
  Q.answers[Q.idx] = { pick: i, ok };
  record(q, ok);
  showFeedback(ok, i);
}
function showFeedback(ok, i) {
  const Q = state.quiz;
  const q = Q.qs[Q.idx];
  $$('#choices button').forEach((b, j) => {
    b.disabled = true;
    if (j === q.answer) b.classList.add('ok');
    else if (j === i) b.classList.add('ng');
  });
  const last = Q.idx === Q.qs.length - 1;
  $('#fb').innerHTML = `<div class="fb"><div class="mark ${ok ? 'ok' : 'ng'}">${ok ? '◎ 正解！' : '× ざんねん'}</div>${ok ? '' : `<div class="muted">正しい答え：<b>${esc(q.choices[q.answer])}</b></div>`}${q.explain}</div>
    <div class="nextrow"><button class="btn pri" id="nextQ">${last ? '結果を見る' : 'つぎの問題 →'}</button></div>`;
  $('#nextQ').onclick = nextQ;
}
function nextQ() {
  const Q = state.quiz;
  Q.idx++;
  if (Q.idx >= Q.qs.length) go('#/result');
  else renderQuiz();
}
// 書いて自己採点
function setupWritePad(q, done) {
  const word = q.writable;
  const n = [...word].length;
  const wrap = $('#padwrap');
  const box = Math.min(130, Math.floor((Math.min(app.clientWidth, 720) - 40) / n));
  wrap.innerHTML = `<canvas class="pad" id="pad" style="width:${box * n}px;height:${box}px"></canvas>
    <div class="pbtns"><button class="btn small" id="clr">けす</button><button class="btn small blue" id="reveal">答えを見る</button></div><div id="selfj"></div>`;
  const cv = $('#pad');
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cv.width = box * n * dpr; cv.height = box * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const drawGrid = () => {
    ctx.clearRect(0, 0, box * n, box);
    ctx.strokeStyle = '#f0c9b8'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * box + box / 2, 4); ctx.lineTo(i * box + box / 2, box - 4);
      ctx.moveTo(i * box + 4, box / 2); ctx.lineTo(i * box + box - 4, box / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.strokeStyle = '#e8b7a2';
    for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * box, 0); ctx.lineTo(i * box, box); ctx.stroke(); }
  };
  drawGrid();
  let drawing = false;
  const pos = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  cv.onpointerdown = ev => {
    drawing = true; cv.setPointerCapture(ev.pointerId);
    ctx.strokeStyle = '#2d2a26'; ctx.lineWidth = Math.max(3, box / 22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(...pos(ev)); ev.preventDefault();
  };
  cv.onpointermove = ev => { if (!drawing) return; ctx.lineTo(...pos(ev)); ctx.stroke(); };
  cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
  $('#clr').onclick = drawGrid;
  const reveal = () => {
    $('#reveal').disabled = true;
    const Q = state.quiz;
    $('#selfj').innerHTML = `<div class="fb" style="text-align:left"><div class="muted">正しい答え</div><div class="qbig">${esc(word)}</div>${q.explain}</div>
      ${Q.answers[Q.idx] ? '' : `<div class="pbtns" style="margin-top:10px"><button class="btn pri" id="jOk">○ 書けた</button><button class="btn" id="jNg">× まちがえた</button></div>`}`;
    const judge = ok => {
      Q.answers[Q.idx] = { pick: ok ? q.answer : -1, ok };
      record(q, ok);
      $('#selfj .pbtns').outerHTML = `<div class="nextrow"><button class="btn pri" id="nextQ">${Q.idx === Q.qs.length - 1 ? '結果を見る' : 'つぎの問題 →'}</button></div>`;
      $('#nextQ').onclick = nextQ;
    };
    if (!Q.answers[Q.idx]) { $('#jOk').onclick = () => judge(true); $('#jNg').onclick = () => judge(false); }
    else { $('#selfj').insertAdjacentHTML('beforeend', `<div class="nextrow"><button class="btn pri" id="nextQ">つぎの問題 →</button></div>`); $('#nextQ').onclick = nextQ; }
  };
  $('#reveal').onclick = reveal;
  if (done) reveal();
}
function renderResult() {
  setBack(true);
  const Q = state.quiz;
  const total = Q.qs.length;
  const okN = Q.answers.filter(a => a && a.ok).length;
  const rate = Math.round((okN / total) * 100);
  const comment = rate === 100 ? 'パーフェクト！ すばらしい！' : rate >= 80 ? 'よくできました！' : rate >= 50 ? 'あと少し！ まちがえた問題を見直そう' : 'じてんで確認してから、もう一度挑戦しよう';
  const wrongKeys = Q.qs.filter((q, i) => !(Q.answers[i] && Q.answers[i].ok)).map(q => q.key);
  app.innerHTML = `
    <div class="card score">
      <div class="muted">${esc(modeTitle(Q.mode))}</div>
      <div><b>${okN}</b> / ${total} 問正解</div>
      <div>${comment}</div>
    </div>
    <div class="card">
      <h2>ふりかえり</h2>
      <ul class="rlist">
        ${Q.qs.map((q, i) => {
          const a = Q.answers[i];
          const ok = a && a.ok;
          return `<li><span class="m ${ok ? 'ok' : 'ng'}">${ok ? '○' : '×'}</span><span class="qtype" style="width:72px;flex:none">${TYPE_LABEL[q.type]}</span><span class="a">${esc(q.label)}</span><span class="muted" style="flex:1">${q.type === 'yomi' ? esc(q.choices[q.answer]) : ''}</span>${kanjiChips(q.kanji).replace('margin-top:6px', 'margin:0')}</li>`;
        }).join('')}
      </ul>
    </div>
    <div class="pbtns">
      ${wrongKeys.length ? '<button class="btn pri" id="retry">まちがえた問題をもう一度</button>' : ''}
      <button class="btn blue" id="again">新しい問題で続ける</button>
      <a class="btn" style="text-decoration:none" href="#/">ホームへ</a>
    </div>`;
  if ($('#retry')) $('#retry').onclick = () => {
    state.quiz = { mode: Q.mode, qs: wrongKeys.map(makeQuestion), idx: 0, answers: [] };
    go('#/quiz');
  };
  $('#again').onclick = () => startQuiz(Q.mode);
}

route();
