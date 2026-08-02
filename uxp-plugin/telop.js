/*
 * telop.js
 *
 * 文字起こしテキストを、マニュアルの表示ルールに沿ったテロップ行へ整形する。
 *
 * 方針（マニュアル準拠）:
 *  - 文章を綺麗に書き換えない。話し言葉はそのまま残す。
 *    （「回してます」を「回しています」に直さない）
 *  - 整えるのは改行位置と表記だけ。
 *  - 1行15〜18文字。基本は1行。
 *  - 「、」「。」は使わず半角スペースへ。
 *  - 「！」「？」は全角。
 *  - 意味のまとまりで改行する。
 *
 * このモジュールはブラウザ・UXP・Node のどれでも動く（依存なし）。
 * UXPは ESモジュールに対応していないため、グローバルへ代入するUMD形式にしている。
 */

(function (root, factory) {
  var api = factory();
  root.TelopUtils = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

/** 1行の下限。マニュアルは「1行15〜18文字」。 */
const MIN_CHARS = 15;

/* ------------------------------------------------------------------ *
 * 改行位置の決め方
 *
 * マニュアル（テロップ / 記号・改行・主語）:
 *   意味のまとまりで改行します。
 *     NG：～と／いうと      OK：～／というと
 *     NG：～／と言っていた  OK：～と／言っていた
 *
 * 辞書なしで形態素解析はできない。かわりに日本語の性質を使う。
 * 文は「自立語（漢字・カタカナ・英数字）＋付属語（ひらがな）」の繰り返しで
 * できているため、**ひらがな→漢字・カタカナ・英数字** の切り替わりが
 * 文節の頭になりやすい。そこだけを改行候補にすると、語の途中で切れなくなる。
 *
 * 上のNG例は、この方法だと自動的に避けられる。
 *   「という」   … と も いう も同じひらがな連なので、間に候補が立たない
 *   「と言っていた」… と（ひらがな）→ 言（漢字）で候補が立つ
 *
 * 以前は文字数だけで折っていたため「触らなかっ／たんです」のように
 * 語の途中で切れていた。上の規定に反するので候補位置を制限した。
 * ------------------------------------------------------------------ */

/** 行頭に置いてはいけない文字（拗促音・長音・閉じ括弧・句読点） */
const NO_LINE_HEAD =
  'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶーゝゞ々' +
  '」』）】〉》］｝)]、。，．！？!?…・';

/** 行末に置いてはいけない文字（開き括弧） */
const NO_LINE_TAIL = '「『（【〈《［｛([';

const RE_HIRA = /[ぁ-ゟ]/;
const RE_HEAD = /[゠-ヿ一-鿿々０-９0-9Ａ-Ｚａ-ｚA-Za-z]/;
const RE_DIGIT = /[0-9０-９]/;

/**
 * 文を「切ってよい単位」へ分ける。
 *
 * 各要素は次を持つ:
 *   text    本文
 *   sep     直前が読点・空白（同じ行に載せるときは半角スペースでつなぐ）
 *   pref    直前が読点（改行位置としてはここが最も自然）
 *   noBreak 直前で改行してはいけない（「3、4年」のような数字間の読点）
 */
function toChunks(paragraph) {
  const chars = [...paragraph];
  const chunks = [];
  let cur = '';
  let pending = { sep: false, pref: false, noBreak: false };

  function flush() {
    if (!cur) return;
    chunks.push({ text: cur, sep: pending.sep, pref: pending.pref, noBreak: pending.noBreak });
    cur = '';
    pending = { sep: false, pref: false, noBreak: false };
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    /* 句読点は落として半角スペース相当の区切りにする（句読点は使わない規定） */
    if (ch === '、' || ch === '。' || ch === '，' || ch === '．') {
      const prev = chars[i - 1] || '';
      const next = chars[i + 1] || '';
      flush();
      pending.sep = true;
      /* 数字にはさまれた読点は文の区切りではない。
         「3、4年くらい前で」を「3」と「4年くらい前で」の2行に割らない。 */
      if (RE_DIGIT.test(prev) && RE_DIGIT.test(next)) pending.noBreak = true;
      /* 読点のうしろが促音・拗音・長音だと、そこで折ると行頭禁則に反する。
         「…じゃないか、って思って」の「って」を行頭へ落とさない。 */
      else if (NO_LINE_HEAD.indexOf(next) !== -1) pending.noBreak = true;
      else pending.pref = true;
      continue;
    }

    /* 元から入っている空白も区切りとして扱う */
    if (/\s/.test(ch)) {
      const next = chars[i + 1] || '';
      flush();
      pending.sep = true;
      if (NO_LINE_HEAD.indexOf(next) !== -1) pending.noBreak = true;
      else pending.pref = true;
      continue;
    }

    /* 文節の頭で切る */
    const prev = chars[i - 1];
    if (cur && prev && RE_HIRA.test(prev) && RE_HEAD.test(ch) &&
        NO_LINE_HEAD.indexOf(ch) === -1 && NO_LINE_TAIL.indexOf(prev) === -1) {
      flush();
    }
    cur += ch;
  }
  flush();
  return chunks;
}

/*
 * 節の切れ目。
 *
 * 全部ひらがなの塊はMAXを超えても文節の候補が立たない
 * （ひらがな→漢字の切り替わりが無いため）。
 * そこで、節を終わらせる助詞・助動詞の直後を候補にする。
 * 「とらわれてるって／わけじゃないんですけど」のように折れる。
 *
 * ここに助詞1文字（は・が・を…）を入れてはいけない。
 * 「ないんで／すけど」のように、助動詞「です」の途中で切れる。
 */
const CLAUSE_ENDINGS = [
  'って', 'けど', 'けれど', 'から', 'ので', 'のに', 'ても', 'たら', 'なら', 'ながら',
  'ました', 'ません', 'ますが', 'ですが'
];

/** [start, limit] の範囲で、いちばん後ろの節の切れ目を返す。無ければ -1。 */
function findClauseBreak(chars, start, limit) {
  for (let k = limit; k > start + 1; k--) {
    if (NO_LINE_HEAD.indexOf(chars[k]) !== -1) continue;
    for (const end of CLAUSE_ENDINGS) {
      if (k - end.length < start) continue;
      if (chars.slice(k - end.length, k).join('') === end) return k;
    }
  }
  return -1;
}

/**
 * 単体でMAXを超える塊を折る。
 *
 * 節の切れ目が無いときは、語を壊すより数文字の超過を許す。
 * 超過は「文字数超過」として警告に出るので、人が気づける。
 * 許容を超えて長い場合だけ文字数で切り、強制であることを返す。
 */
function splitOversized(chunk, MAX) {
  const chars = [...chunk.text];
  if (chars.length <= MAX) return { parts: [chunk], forced: 0 };

  /* 語を壊さないために許す超過。これを超えたら切るしかない。 */
  const TOLERANCE = 3;

  const parts = [];
  let forced = 0;
  let start = 0;

  while (chars.length - start > MAX) {
    const at = findClauseBreak(chars, start, start + MAX);
    if (at > start) {
      parts.push(chars.slice(start, at).join(''));
      start = at;
      continue;
    }
    if (chars.length - start <= MAX + TOLERANCE) break;
    parts.push(chars.slice(start, start + MAX).join(''));
    start += MAX;
    forced++;
  }
  const tail = chars.slice(start).join('');
  if (tail) parts.push(tail);

  return {
    parts: parts.map((text, i) => ({
      text,
      sep: i === 0 ? chunk.sep : false,
      pref: i === 0 ? chunk.pref : false,
      noBreak: i === 0 ? chunk.noBreak : false
    })),
    forced
  };
}

/**
 * 1行の出来の悪さ。0が理想。
 *
 * @param {boolean} prefBreak   行末が読点の位置か
 * @param {boolean} shortTail   行末が2文字以下の塊で終わるか
 */
function lineCost(n, MIN, MAX, prefBreak, shortTail, isLast) {
  let c;
  if (n > MAX) c = (n - MAX) * 40;
  else if (n >= MIN) c = 0;
  else c = (MIN - n) * (MIN - n);
  /* 最後の行が短いのは自然なので軽く見る */
  if (isLast && n < MIN) c = Math.min(c, (MIN - n) * 2);
  /* 読点の位置で折れるならそちらを選ぶ */
  if (prefBreak) c -= 6;
  /* 「手に／職が欲しい」のように、短い塊で行を終えると
     まとまりが切れて読みにくい。読点の位置なら自然なので除く。 */
  if (shortTail && !prefBreak && !isLast) c += 12;
  return c;
}

/**
 * 塊を行へ詰める。貪欲だと短い塊が1行に取り残される
 * （「な」だけの行ができる）ため、全体の出来で選ぶ。
 */
function packLines(chunks, MIN, MAX, relax) {
  const n = chunks.length;
  if (!n) return [];

  const cost = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(0);
  cost[0] = 0;

  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue;
    let text = '';
    for (let j = i; j < n; j++) {
      text += (j > i && chunks[j].sep ? ' ' : '') + chunks[j].text;
      const L = len(text);
      if (L > MAX && j > i) break;
      /* 改行禁止の位置では行を終えられない */
      if (!relax && j < n - 1 && chunks[j + 1].noBreak) continue;
      const isLast = j === n - 1;
      const shortTail = j > i && len(chunks[j].text) <= 2;
      const c = cost[i] + lineCost(L, MIN, MAX, !isLast && chunks[j + 1].pref, shortTail, isLast);
      if (c < cost[j + 1]) { cost[j + 1] = c; from[j + 1] = i; }
    }
  }

  /* 改行禁止が厳しすぎて詰められないときは、その制約だけ外して再試行する */
  if (cost[n] === Infinity) {
    if (!relax) return packLines(chunks, MIN, MAX, true);
    return chunks.map((c) => c.text);
  }

  const out = [];
  let j = n;
  while (j > 0) {
    const i = from[j];
    let text = '';
    for (let k = i; k < j; k++) text += (k > i && chunks[k].sep ? ' ' : '') + chunks[k].text;
    out.unshift(text);
    j = i;
  }
  return out;
}

/**
 * 文字起こしをテロップ行へ整形する。
 *
 * @param {string} input 文字起こしテキスト
 * @param {{maxChars?:number, dictionary?:Array}} opts
 * @returns {{lines:string[], warnings:Array, notation:Array}}
 */
function formatTelop(input, opts = {}) {
  const MAX = clamp(opts.maxChars ?? 18, 8, 30);
  const MIN = Math.min(MIN_CHARS, MAX);
  const dictionary = opts.dictionary ?? [];

  if (!input || !input.trim()) {
    return { lines: [], warnings: [], notation: [] };
  }

  /* 1. 半角記号を全角へ。改行は保持。 */
  const normalized = input
    .replace(/\r\n?/g, '\n')
    .replace(/!/g, '！')
    .replace(/\?/g, '？');

  const lines = [];
  let forcedCount = 0;

  for (const paragraph of normalized.split('\n')) {
    const p = paragraph.trim();
    if (!p) continue;

    /* 2. 意味の切れ目で塊に分ける */
    let chunks = [];
    for (const c of toChunks(p)) {
      const r = splitOversized(c, MAX);
      forcedCount += r.forced;
      chunks = chunks.concat(r.parts);
    }

    /* 3. 塊を行へ詰める */
    for (const line of packLines(chunks, MIN, MAX, false)) {
      if (line) lines.push(line);
    }
  }

  /* 4. 検査 */
  const warnings = [];
  lines.forEach((l, i) => {
    const n = len(l);
    if (n > MAX) warnings.push({ line: i + 1, kind: '文字数超過', detail: `${n}文字（上限${MAX}）` });
  });
  if (forcedCount) {
    warnings.push({
      line: 0,
      kind: '強制改行',
      detail: `意味の切れ目が見つからず文字数で折った箇所が${forcedCount}件あります。目視で確認してください。`
    });
  }

  const notation = checkNotation(lines, dictionary);

  return { lines, warnings, notation };
}

/**
 * 表記揺れを検査する。
 * @param {string[]} lines
 * @param {Array<{wrong:string, correct:string, note?:string}>} dictionary
 */
function checkNotation(lines, dictionary) {
  const found = [];
  if (!dictionary || !dictionary.length) return found;

  lines.forEach((line, i) => {
    for (const d of dictionary) {
      /* 「A／B」形式の誤表記は分割して個別に照合する */
      for (const variant of d.wrong.split(/[／/]/).map((s) => s.trim()).filter(Boolean)) {
        /* 「～して下さい」のような接尾形は先頭の波ダッシュを外して照合 */
        const core = variant.replace(/^[～〜]/, '');
        if (!core) continue;
        if (line.includes(core)) {
          found.push({ line: i + 1, wrong: variant, correct: d.correct, note: d.note || '' });
          break;
        }
      }
    }
  });

  /* 同一行・同一指摘の重複を除く */
  const seen = new Set();
  return found.filter((f) => {
    const key = `${f.line}:${f.wrong}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * SRT / VTT を取り込み、タイムコード付きのブロックへ変換する。
 * タイムコードは保持する（カット点との同期に使うため）。
 *
 * @param {string} src SRTまたはVTTのテキスト
 * @returns {Array<{index:number, start:string, end:string, text:string}>}
 */
function parseSubtitles(src) {
  if (!src || !src.trim()) return [];

  const text = src.replace(/\r\n?/g, '\n').replace(/^WEBVTT.*\n/, '');
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    /* 先頭が連番なら落とす */
    if (/^\d+$/.test(lines[0].trim())) lines.shift();
    if (!lines.length) continue;

    const tc = /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/.exec(lines[0]);
    if (!tc) continue;

    const body = lines.slice(1).join(' ').trim();
    if (!body) continue;

    out.push({
      index: out.length + 1,
      start: tc[1].replace(',', '.'),
      end: tc[2].replace(',', '.'),
      text: body
    });
  }
  return out;
}

/**
 * 「開始TC 〜 終了TC  本文」が1行に並ぶ形式を読み取る。
 *
 * 文字起こしツール（Whisper系など）がよく出す形式に対応する:
 *   [00:02:51.430 → 00:02:54.990]   そのタイミングで、近くにいた人に声かけてた
 *   [00:02:51.430 --> 00:02:54.990] テキスト
 *   00:02:51.430 → 00:02:54.990  テキスト
 *   00:02:51,430 --> 00:02:54,990 テキスト
 *
 * 角括弧の有無、矢印の種類（→ / -> / --> / 〜 など）、
 * 区切りの半角/全角スペースを問わず読める。
 *
 * 本文が同じ行に無い場合は、次の行以降を本文として拾う（SRT風の書き方）。
 *
 * @param {string} src
 * @returns {Array<{index:number, start:string, end:string, text:string}>}
 */
function parseTimedText(src) {
  if (!src || !src.trim()) return [];

  /* タイムコード: HH:MM:SS(.|,)mmm / HH:MM:SS:FF / MM:SS.mmm */
  const TC = '\\d{1,2}[:;]\\d{1,2}(?:[:;]\\d{1,2})?(?:[.,]\\d{1,3})?';
  /* 矢印: → -> --> ⇒ 〜 ~ — など */
  const ARROW = '(?:-{1,2}>|→|⇒|—>|–>|〜|~|to)';

  const lineRe = new RegExp(
    '^\\s*[\\[\\(（【]?\\s*' +   // 開き括弧（任意）
    '(' + TC + ')' +                     // 開始
    '\\s*' + ARROW + '\\s*' +        // 矢印
    '(' + TC + ')' +                     // 終了
    '\\s*[\\]\\)）】]?' +          // 閉じ括弧（任意）
    '[\\s\u3000]*(.*)$'               // 本文（全角スペース区切りも許す）
  );

  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let pending = null;

  const flush = () => {
    if (pending && pending.text.trim()) {
      out.push({
        index: out.length + 1,
        start: pending.start,
        end: pending.end,
        text: pending.text.trim().replace(/\s+/g, ' ')
      });
    }
    pending = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\u3000/g, ' ');
    const m = lineRe.exec(line);

    if (m) {
      flush();
      pending = { start: normalizeTc(m[1]), end: normalizeTc(m[2]), text: m[3] || '' };
      continue;
    }

    const t = line.trim();
    if (!t) { flush(); continue; }

    /* SRTの連番行は無視する */
    if (/^\d+$/.test(t)) continue;

    /* 直前のタイムコード行に本文が無かった場合、この行を本文として拾う */
    if (pending) pending.text += (pending.text ? ' ' : '') + t;
  }
  flush();

  return out;
}

/** タイムコードの区切りを正規化する（; → : 、, → .） */
function normalizeTc(tc) {
  let s = String(tc).trim().replace(/;/g, ':').replace(/,/g, '.');
  const parts = s.split(':');
  /* MM:SS.mmm のように時が省略されている場合は補う */
  if (parts.length === 2) s = '00:' + s;
  return s;
}

/**
 * 字幕ブロックを、タイムコードを保ったままテロップ行へ整形する。
 * 1ブロックが複数行になった場合、表示時間を行数で等分する。
 *
 * @param {Array} blocks parseSubtitles の戻り値
 * @param {{maxChars?:number, dictionary?:Array}} opts
 */
function formatSubtitles(blocks, opts = {}) {
  const out = [];
  for (const b of blocks) {
    const { lines } = formatTelop(b.text, opts);
    if (!lines.length) continue;

    const startSec = tcToSeconds(b.start);
    const endSec = tcToSeconds(b.end);
    const span = Math.max(0, endSec - startSec);
    const per = lines.length ? span / lines.length : span;

    lines.forEach((text, i) => {
      out.push({
        index: out.length + 1,
        start: secondsToTc(startSec + per * i),
        end: secondsToTc(startSec + per * (i + 1)),
        text,
        chars: len(text),
        sourceIndex: b.index
      });
    });
  }
  return out;
}

/**
 * 整形済みテロップをSRTとして書き出す。
 * Premiereのキャプション取り込みに使える。
 */
function toSrt(items) {
  return items
    .map((it, i) => `${i + 1}\n${tcToSrt(it.start)} --> ${tcToSrt(it.end)}\n${it.text}\n`)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* ヘルパー                                                            */
/* ------------------------------------------------------------------ */

function len(s) { return [...String(s)].length; }

function clamp(n, lo, hi) { return Math.max(lo, Math.min(Number(n) || lo, hi)); }

function tcToSeconds(tc) {
  const m = /(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(tc);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

function secondsToTc(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const ss = Math.floor(s) % 60;
  const ms = Math.round((s % 1) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(ss)}.${p(ms, 3)}`;
}

function tcToSrt(tc) {
  return tc.replace('.', ',');
}

  return {
    formatTelop: formatTelop,
    checkNotation: checkNotation,
    parseSubtitles: parseSubtitles,
    parseTimedText: parseTimedText,
    formatSubtitles: formatSubtitles,
    toSrt: toSrt,
    tcToSeconds: tcToSeconds,
    secondsToTc: secondsToTc
  };
});
