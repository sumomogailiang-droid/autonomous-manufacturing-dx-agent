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

/** 1行の分割候補として優先する助詞 */
const PARTICLES = ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'や', 'ね', 'よ'];

/**
 * 文字起こしをテロップ行へ整形する。
 *
 * @param {string} input 文字起こしテキスト
 * @param {{maxChars?:number, dictionary?:Array}} opts
 * @returns {{lines:string[], warnings:Array, notation:Array}}
 */
function formatTelop(input, opts = {}) {
  const MAX = clamp(opts.maxChars ?? 18, 8, 30);
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

  for (const paragraph of normalized.split('\n')) {
    const p = paragraph.trim();
    if (!p) continue;

    /* 2. 句読点で一次分割。句読点自体は落とす（半角スペース相当の区切り） */
    const units = p.split(/[、。]/).map((s) => s.trim()).filter(Boolean);

    let line = '';
    for (const unit of units) {
      const unitLen = [...unit].length;

      /* 現在行に収まるなら、半角スペースでつなぐ */
      if (len(line) + (line ? 1 : 0) + unitLen <= MAX) {
        line = line ? line + ' ' + unit : unit;
        continue;
      }

      if (line) { lines.push(line); line = ''; }

      /* 3. 単体でMAXを超える場合は、助詞の直後を優先して折る */
      let rest = unit;
      while (len(rest) > MAX) {
        const window = [...rest].slice(0, MAX).join('');
        let cut = -1;
        for (const particle of PARTICLES) {
          const idx = window.lastIndexOf(particle);
          /* 行頭すぎる位置で折ると読みにくいので、半分より後ろだけ採用する */
          if (idx > cut && idx >= Math.floor(MAX * 0.5)) cut = idx;
        }
        const at = cut > 0 ? cut + 1 : MAX;
        lines.push([...rest].slice(0, at).join(''));
        rest = [...rest].slice(at).join('');
      }
      line = rest;
    }
    if (line) lines.push(line);
  }

  /* 4. 検査 */
  const warnings = [];
  lines.forEach((l, i) => {
    const n = len(l);
    if (n > MAX) warnings.push({ line: i + 1, kind: '文字数超過', detail: `${n}文字（上限${MAX}）` });
  });

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
    formatSubtitles: formatSubtitles,
    toSrt: toSrt,
    tcToSeconds: tcToSeconds,
    secondsToTc: secondsToTc
  };
});
