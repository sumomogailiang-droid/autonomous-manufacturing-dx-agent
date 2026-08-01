#!/usr/bin/env node
/*
 * segment-kit.mjs
 *
 * 尺（セグメント）単位の制作キット。FRAME ZERO の工程4〜7を一括で流す。
 *
 * === 2つのコマンド ===
 *
 *   analyze <srt>
 *     完成済みの尺（冒頭3分など）の文字起こしを分析し、
 *     基準値（テンポ・相槌率・重なり・文字数）を baseline.json へ書く。
 *     「冒頭の完成見本 3分」を全体の基準にするというマニュアルの
 *     仕組みを、数値として持ち運べるようにする。
 *
 *   produce <srt> --in <TC> --out <TC> [--baseline <json>]
 *     次の尺の文字起こしから、工程ごとの成果物を一括生成する。
 *       工程4・5  カット候補（cutter）      … フレーム番号・種類・根拠つき
 *       工程6・7  テロップ配置案（telop）   … 整形・フレーム確定・レイヤー割当
 *       表記検査  （common-manual）        … 辞書との照合結果
 *       基準比較  （observer）             … baseline との差分
 *     カット候補は候補であり確定ではない（工程4「自動ツールも必ず目視確認」）。
 *
 * === どのエージェントが動いているか ===
 *
 * 各工程の実行時に、担当エージェントのドット絵（作業中フレーム）を
 * バナーとして表示する。agents/sprites.mjs の絵をそのまま使うため、
 * コンソール・ダッシュボード・ブラウザのオフィスと同じ姿で出る。
 *
 * === 出力先について ===
 *
 * 文字起こしはクライアント素材。出力もコミットしないこと。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITES, frame, renderSprite, paint, bold, dim, PALETTE } from '../agents/sprites.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const telop = require(join(ROOT, 'uxp-plugin/telop.js'));
const tc = require(join(ROOT, 'uxp-plugin/timecode.js'));

const NO_COLOR = !process.stdout.isTTY || 'NO_COLOR' in process.env;

/* ------------------------------------------------------------------ *
 * エージェントバナー
 * ------------------------------------------------------------------ */

const AGENT_COLOR = {
  cutter: PALETTE.a, telop: PALETTE.e, 'common-manual': PALETTE.b,
  'project-manual': PALETTE.o, observer: PALETTE.u, director: PALETTE.m
};

function banner(agent, title, detail) {
  const art = renderSprite(frame(agent, 'work'), NO_COLOR);
  const color = AGENT_COLOR[agent] || '#888888';
  const lines = [
    '',
    bold(paint(color, `▶ ${title}`, NO_COLOR), NO_COLOR) + '  ' + dim(`担当: ${agent}`, NO_COLOR),
    ...(detail ? [dim('  ' + detail, NO_COLOR)] : [])
  ];
  /* 絵と文字を横に並べる */
  const width = 18;
  const out = [];
  const rows = Math.max(art.length, lines.length);
  for (let i = 0; i < rows; i++) {
    const left = art[i] || ' '.repeat(width);
    const right = lines[i] || '';
    out.push('  ' + left + '  ' + right);
  }
  console.log(out.join('\n'));
}

/* ------------------------------------------------------------------ *
 * 文字起こしの読み込み
 * ------------------------------------------------------------------ */

/*
 * 話者ラベルの取り出し。
 *
 * 文字起こしに話者が入っていれば、工程7（演者ごとのテロップ色分け）を
 * 映像を見ずに埋められる。入っていなければ従来どおり空欄になる。
 *
 * 受け付ける書き方（どれでも可）:
 *   あおさん: 本文
 *   あおさん：本文        （全角コロン）
 *   [あおさん] 本文
 *   【あおさん】本文
 *
 * ラベルは本文から取り除く。残すとテロップに話者名が焼き込まれてしまう。
 */
function parseSpeaker(text) {
  var m = text.match(/^\s*[\[【]\s*([^\]】\n]{1,20})\s*[\]】]\s*(.*)$/);
  if (m) return { speaker: m[1].trim(), text: m[2].trim() };
  /* コロン形式。時刻（12:34）を話者と誤認しないよう、数字だけの名前は除く。 */
  m = text.match(/^\s*([^\s:：]{1,20})\s*[:：]\s*(.+)$/);
  if (m && !/^[\d.:;]+$/.test(m[1])) return { speaker: m[1].trim(), text: m[2].trim() };
  return { speaker: '', text: text };
}

function loadCues(path, rate) {
  const parsed = telop.parseSubtitles(readFileSync(path, 'utf8'));
  if (!parsed.length) throw new Error('字幕を読み取れませんでした: ' + path);
  return parsed.map((c, i) => {
    const startSec = telop.tcToSeconds(c.start);
    const endSec = telop.tcToSeconds(c.end);
    const raw = String(c.text || '').replace(/\s*\n\s*/g, ' ').trim();
    const sp = parseSpeaker(raw);
    return {
      no: i + 1,
      inFrame: tc.secondsToFrames(startSec, rate),
      outFrame: tc.secondsToFrames(endSec, rate),
      startSec, endSec,
      speaker: sp.speaker,
      text: sp.text,
      chars: [...sp.text].length
    };
  });
}

/* ------------------------------------------------------------------ *
 * 検出器（cutter の判断基準。確定はしない）
 * ------------------------------------------------------------------ */

/* 相槌。単体で1キューを占める場合だけ候補にする（文中の同語は対象外） */
const AIZUCHI = [
  'はい', 'うん', 'ええ', 'あー', 'おー', 'へー', 'ほう', 'なるほど', 'なるほどね',
  'そうですね', 'そうそう', 'そうそうそう', 'そっか', 'そっかそっか', 'たしかに', '確かに',
  'ですよね', 'うんうん', 'はいはい', 'そうだね', 'そう'
];

/* ケバ。単体キューまたは冒頭に付くもの */
const KEBA = ['えーと', 'えっと', 'あのー', 'そのー', 'えー', 'まあまあ'];

function normalize(t) {
  return t.replace(/[、。！？!?\s（）()「」]/g, '');
}

function detectCandidates(cues, rate) {
  const out = [];
  const gapThresholdF = tc.secondsToFrames(0.8, rate);

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const n = normalize(c.text);

    /* 相槌のみのキュー */
    if (AIZUCHI.includes(n)) {
      out.push({ type: '相槌', cue: c, conf: '高', evidence: c.text });
      continue;
    }
    /* 相槌の連結（「そうそうそう。」「はい、はい」） */
    if (n.length <= 10 && AIZUCHI.some((a) => n === a + a || n === a + a + a)) {
      out.push({ type: '相槌', cue: c, conf: '高', evidence: c.text });
      continue;
    }

    /* ケバのみのキュー */
    if (KEBA.includes(n)) {
      out.push({ type: 'ケバ', cue: c, conf: '高', evidence: c.text });
      continue;
    }
    /* 冒頭ケバ（キュー全体ではなく頭のトリム候補） */
    const lead = KEBA.find((k) => n.startsWith(k) && n.length > k.length + 2);
    if (lead) {
      out.push({ type: 'ケバ(頭)', cue: c, conf: '中', evidence: lead + '…で始まる' });
    }

    /* 復唱：直前キューとの重複 */
    if (i > 0) {
      const prev = normalize(cues[i - 1].text);
      if (n.length >= 4 && prev.length >= 4 && (n === prev || (prev.includes(n) && n.length >= 5))) {
        out.push({ type: '復唱', cue: c, conf: '中', evidence: '直前と同内容' });
      }
    }

    /* 息・間：直前キューとの間隔 */
    if (i > 0) {
      const gap = c.inFrame - cues[i - 1].outFrame;
      if (gap >= gapThresholdF) {
        out.push({
          type: '間(無音)',
          cue: { no: `${cues[i - 1].no}→${c.no}`, inFrame: cues[i - 1].outFrame, outFrame: c.inFrame },
          conf: '中',
          evidence: (gap / rate.exact).toFixed(2) + '秒の無音'
        });
      }
    }
  }
  return out;
}

/** 同時発話（重なり）を数える。話者分けとレイヤーの根拠になる。 */
function countOverlaps(cues) {
  const sorted = [...cues].sort((a, b) => a.inFrame - b.inFrame);
  let n = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].inFrame >= sorted[i].outFrame) break;
      n++;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * 分析（observer の仕事）
 * ------------------------------------------------------------------ */

function analyze(cues, rate) {
  const first = cues[0].inFrame;
  const last = cues[cues.length - 1].outFrame;
  const durSec = (last - first) / rate.exact;
  const spoken = cues.reduce((s, c) => s + (c.outFrame - c.inFrame), 0) / rate.exact;
  const cands = detectCandidates(cues, rate);
  const byType = {};
  for (const c of cands) byType[c.type] = (byType[c.type] || 0) + 1;
  const overLimit = cues.filter((c) => c.chars > 18).length;

  return {
    cueCount: cues.length,
    durationSec: Math.round(durSec * 10) / 10,
    cuesPerMin: Math.round((cues.length / durSec) * 600) / 10,
    avgCueSec: Math.round((spoken / cues.length) * 100) / 100,
    silenceSec: Math.round((durSec - spoken) * 10) / 10,
    overlapPairs: countOverlaps(cues),
    over18chars: overLimit,
    candidates: byType
  };
}

/* ------------------------------------------------------------------ *
 * 出力
 * ------------------------------------------------------------------ */

function fTC(f, rate) { return tc.framesToTimecode(f, rate); }

function writeCandidatesMd(path, cands, rate, projectNote) {
  const L = ['# カット候補（工程4・5）', ''];
  L.push('> **候補であり確定ではありません。** 自動ツールの出力も必ず目視確認する（工程4）。');
  L.push('> ケバは取りすぎると不自然になる（用語集）。採否の記録は observer が学習に使います。');
  L.push('');
  if (projectNote) { L.push(projectNote); L.push(''); }
  L.push('| # | 種類 | IN | OUT | 確度 | 根拠 |');
  L.push('|---|---|---|---|---|---|');
  for (const c of cands) {
    L.push(`| ${c.cue.no} | ${c.type} | ${fTC(c.cue.inFrame, rate)} | ${fTC(c.cue.outFrame, rate)} | ${c.conf} | ${c.evidence.replace(/\|/g, '\\|')} |`);
  }
  writeFileSync(path, L.join('\n'), 'utf8');
}

function writeTelopMd(path, rows, rate) {
  const L = ['# テロップ配置案（工程6・7）', ''];
  L.push('> 文章は書き換えていません。整えたのは改行位置と表記だけです。');
  L.push('> IN/OUTはフレーム確定済み。重なりはレイヤーで上のトラックへ逃がします。');
  L.push('');
  L.push('| # | IN | OUT | L | 演者 | 本文 |');
  L.push('|---|---|---|---|---|---|');
  for (const r of rows) {
    L.push(`| ${r.no} | ${r.inTc} | ${r.outTc} | V${(r.layer || 0) + 1} | ${r.speaker || ''} | ${r.lines.join(' ⏎ ').replace(/\|/g, '\\|')} |`);
  }
  writeFileSync(path, L.join('\n'), 'utf8');
}

/** 話者ごとの発話数・初出。工程7の色割当の入力になる。 */
function speakerStats(cues, rate) {
  const map = new Map();
  for (const c of cues) {
    const k = c.speaker || '(未ラベル)';
    if (!map.has(k)) map.set(k, { name: k, lines: 0, firstFrame: c.inFrame, frames: 0 });
    const e = map.get(k);
    e.lines++;
    e.frames += Math.max(0, c.outFrame - c.inFrame);
  }
  return [...map.values()].sort((a, b) => b.lines - a.lines);
}

function writeSpeakersMd(path, stats, rate, labelled, total) {
  const L = ['# 演者と色の割当（工程7）', ''];
  if (!labelled) {
    L.push('> 文字起こしに話者ラベルがありません。');
    L.push('> 本文だけで話者を決めるのは推測になり、工程7のよくある失敗');
    L.push('> 「演者ごとのテロップ色切り替えを間違える」に直結します。');
    L.push('> 映像を見て埋めるか、話者つきで文字起こしをやり直してください。');
    L.push('');
  } else {
    L.push(`> 話者ラベルつき: ${labelled} / ${total}行（${Math.round(labelled / total * 100)}%）`);
    L.push('> 色はチャンネルテンプレートの中から選びます（トンマナ外のデザインは使用禁止）。');
    L.push('> 決めるのは冒頭担当者で、演者名・テロップ色・ラベル色を編集者とディレクターへ共有します。');
    L.push('');
  }
  L.push('| 演者 | 発話数 | 初出 | 発話尺 | テロップ色 | ラベル色 |');
  L.push('|---|---:|---|---:|---|---|');
  for (const s of stats) {
    L.push(`| ${s.name} | ${s.lines} | ${fTC(s.firstFrame, rate)} | ${(s.frames / rate.exact).toFixed(1)}秒 |  |  |`);
  }
  L.push('');
  L.push('「テロップ色」「ラベル色」の欄を埋めたら、そのまま事前共有に使えます。');
  writeFileSync(path, L.join('\n'), 'utf8');
}

/* ------------------------------------------------------------------ *
 * コマンド: analyze
 * ------------------------------------------------------------------ */

function cmdAnalyze(srtPath, outDir, rate) {
  banner('observer', '完成尺の分析', basename(srtPath));
  const cues = loadCues(srtPath, rate);
  const stats = analyze(cues, rate);

  mkdirSync(outDir, { recursive: true });
  const baselinePath = join(outDir, 'baseline.json');
  writeFileSync(baselinePath, JSON.stringify({
    source: basename(srtPath),
    generatedAt: new Date().toISOString().slice(0, 10),
    fps: rate.exact, stats
  }, null, 2), 'utf8');

  console.log(`\n  尺           : ${stats.durationSec}秒 / ${stats.cueCount}キュー`);
  console.log(`  テンポ        : ${stats.cuesPerMin} キュー/分（平均 ${stats.avgCueSec}秒/キュー）`);
  console.log(`  無音合計      : ${stats.silenceSec}秒`);
  console.log(`  同時発話      : ${stats.overlapPairs}組`);
  console.log(`  18文字超の行  : ${stats.over18chars}行（整形前の素材値）`);
  console.log(`  カット候補内訳: ${Object.entries(stats.candidates).map(([k, v]) => `${k} ${v}`).join(' / ') || 'なし'}`);
  console.log(`\n  基準値を保存 : ${baselinePath}`);
  return { cues, stats };
}

/* ------------------------------------------------------------------ *
 * コマンド: produce
 * ------------------------------------------------------------------ */

function projectCutNote() {
  /* 登録済み案件のカット対象を確認する。knowledge はコミット対象外なので
     ローカルにある場合だけ読む。無ければ確認を促す（推測で補わない）。 */
  const dir = join(ROOT, 'agents/knowledge/projects');
  if (!existsSync(dir)) return '> 案件マニュアル未登録。カット対象は project-manual で確認してください。';
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  for (const f of files) {
    const t = readFileSync(join(dir, f), 'utf8');
    const hits = ['息の吸い込み', '相槌', '復唱'].filter((k) => t.includes(k));
    if (hits.length) {
      return `> 登録済み案件マニュアルにカット対象の記載あり: **${hits.join('・')}**（該当候補は案件対象）。`;
    }
  }
  return '> 登録済み案件マニュアルにカット対象の明記が見つかりません。project-manual で確認してください。';
}

function cmdProduce(srtPath, inTC, outTC, outDir, baselinePath, rate) {
  const inF = tc.timecodeToFrames(inTC, rate);
  const outF = tc.timecodeToFrames(outTC, rate);
  if (!(outF > inF)) throw new Error('範囲が不正です: ' + inTC + ' 〜 ' + outTC);

  console.log(bold(`\n━━ 次尺の制作キット ${inTC} 〜 ${outTC}（${((outF - inF) / rate.exact).toFixed(1)}秒） ━━`, NO_COLOR));

  const all = loadCues(srtPath, rate);
  const cues = all.filter((c) => c.inFrame < outF && c.outFrame > inF);
  if (!cues.length) {
    throw new Error(
      `指定範囲にキューがありません（ファイル内は ${fTC(all[0].inFrame, rate)} 〜 ${fTC(all[all.length - 1].outFrame, rate)}）。\n` +
      'この範囲の文字起こしがまだ無い可能性があります。'
    );
  }
  mkdirSync(outDir, { recursive: true });

  /* --- 工程4・5: カット候補（cutter） ------------------------------ */
  banner('cutter', '工程4・5 カット候補の検出', `${cues.length}キューを走査`);
  const cands = detectCandidates(cues, rate);
  const candPath = join(outDir, 'cut-candidates.md');
  writeCandidatesMd(candPath, cands, rate, projectCutNote());
  const byType = {};
  for (const c of cands) byType[c.type] = (byType[c.type] || 0) + 1;
  console.log(`\n  候補 ${cands.length}件: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' / ') || 'なし'}`);
  console.log(`  → ${candPath}`);

  /* --- 工程6・7: テロップ整形と配置（telop） ------------------------ */
  banner('telop', '工程6・7 テロップ整形とフレーム配置', '文章は書き換えない');
  /* formatSubtitles は parseSubtitles 形式のブロック（TC文字列）を受ける */
  const blocks = cues.map((c, i) => ({
    index: i + 1,
    start: telop.secondsToTc(c.startSec),
    end: telop.secondsToTc(c.endSec),
    text: c.text
  }));
  const formatted = telop.formatSubtitles(blocks, {});
  /* snapToFrames は秒を受けてフレーム確定とレイヤー割当を行う */
  const snapped = tc.snapToFrames(
    formatted.map((r) => ({
      start: telop.tcToSeconds(r.start),
      end: telop.tcToSeconds(r.end),
      text: r.text,
      sourceIndex: r.sourceIndex
    })),
    { rate: rate }
  );
  const items = (snapped.items || snapped.out || snapped).map ? (snapped.items || snapped.out || snapped) : snapped;
  /* 整形で1キューが複数行に割れるので、元キュー番号から話者を引き直す */
  const speakerBySource = new Map(cues.map((c, i) => [i + 1, c.speaker]));
  const rows = (Array.isArray(items) ? items : []).map((r) => ({
    no: r.index,
    inTc: fTC(r.inFrame, rate),
    outTc: fTC(r.outFrame, rate),
    layer: r.layer || 0,
    speaker: speakerBySource.get(r.sourceIndex) || '',
    lines: [r.text]
  }));
  const telopPath = join(outDir, 'telop-plan.md');
  writeTelopMd(telopPath, rows, rate);
  const layered = rows.filter((r) => r.layer > 0).length;
  console.log(`\n  配置 ${rows.length}行 / 上トラック行き ${layered}行（同時発話）`);
  console.log(`  → ${telopPath}`);

  /* --- 表記検査（common-manual） ----------------------------------- */
  const snapshot = require(join(ROOT, 'uxp-plugin/data/manual-snapshot.js'));
  const dict = (snapshot.dictionary || []).concat(snapshot.splitEditDictionary || []);
  banner('common-manual', '表記揺れ辞書との照合', dict.length + '件の辞書');
  const found = telop.checkNotation(rows.map((r) => r.lines.join(' ')), dict);
  const notes = (found || []).slice(0, 3).map((f) =>
    `行${f.line}: ${f.wrong} → ${f.correct}`);
  const notationPath = join(outDir, 'notation.md');
  const NL = ['# 表記揺れの指摘（工程7）', ''];
  NL.push('> 辞書 ' + dict.length + '件との照合結果です。');
  NL.push('> この一覧の表記を間違えた場合は重大ミスとして扱う記載があります。');
  NL.push('');
  if ((found || []).length) {
    NL.push('| 行 | 誤表記 | 正しい表記 |');
    NL.push('|---|---|---|');
    for (const f of found) NL.push(`| ${f.line} | ${f.wrong} | ${f.correct} |`);
  } else {
    NL.push('指摘はありません。');
  }
  writeFileSync(notationPath, NL.join('\n'), 'utf8');
  console.log(`\n  指摘 ${(found || []).length}件${notes.length ? '（例: ' + notes.join(' / ') + '）' : ''}`);
  console.log(`  → ${notationPath}`);

  /* --- 工程7: 演者ごとの色分け（telop + project-manual） ------------ */
  const labelled = cues.filter((c) => c.speaker).length;
  banner('project-manual', '工程7 演者と色の割当',
    labelled ? `話者ラベル ${labelled}/${cues.length}行` : '話者ラベルなし');
  const spStats = speakerStats(cues, rate);
  const speakersPath = join(outDir, 'speakers.md');
  writeSpeakersMd(speakersPath, spStats, rate, labelled, cues.length);
  console.log('\n  ' + (labelled
    ? `演者 ${spStats.length}名: ` + spStats.map((s) => `${s.name}(${s.lines})`).join(' / ')
    : '話者ラベルがないため色分けできません（映像を見て確定してください）'));
  console.log(`  → ${speakersPath}`);

  /* --- 基準比較（observer） ---------------------------------------- */
  banner('observer', '冒頭3分の基準値と比較', baselinePath ? basename(baselinePath) : '基準なし');
  const stats = analyze(cues, rate);
  const statsPath = join(outDir, 'stats.md');
  const L = ['# 基準比較（observer）', ''];
  if (baselinePath && existsSync(baselinePath)) {
    const base = JSON.parse(readFileSync(baselinePath, 'utf8')).stats;
    L.push('| 指標 | 冒頭3分（基準） | この尺 | 差 |');
    L.push('|---|---|---|---|');
    const rows = [
      ['テンポ（キュー/分）', base.cuesPerMin, stats.cuesPerMin],
      ['平均キュー長（秒）', base.avgCueSec, stats.avgCueSec],
      ['無音合計（秒）', base.silenceSec, stats.silenceSec],
      ['同時発話（組）', base.overlapPairs, stats.overlapPairs],
      ['18文字超（行）', base.over18chars, stats.over18chars]
    ];
    for (const [name, b, s] of rows) {
      const d = Math.round((s - b) * 10) / 10;
      L.push(`| ${name} | ${b} | ${s} | ${d > 0 ? '+' : ''}${d} |`);
      console.log(`  ${name.padEnd(14, '　')}: 基準 ${b} → ${s} (${d > 0 ? '+' : ''}${d})`);
    }
    L.push('');
    L.push('> テンポが基準から大きく外れる場合、カットの強さを冒頭に合わせて調整してください。');
  } else {
    L.push('基準ファイルなし。`analyze` を先に実行すると比較できます。');
    console.log('  基準ファイルなし（analyze を先に実行してください）');
  }
  writeFileSync(statsPath, L.join('\n'), 'utf8');

  /* --- 残り工程の指示書 -------------------------------------------- */
  const runbookPath = join(outDir, 'runbook.md');
  writeFileSync(runbookPath, [
    `# この尺の残り工程（${inTC} 〜 ${outTC}）`,
    '',
    '上の成果物を使って、Premiere側で次の順に進める。担当と根拠つき。',
    '',
    '| 順 | 工程 | 担当 | 使うもの |',
    '|---|---|---|---|',
    '| 1 | カット確定（目視） | 人 + cutter | cut-candidates.md（候補の採否を記録） |',
    '| 2 | テロップ流し込み | telop + UXPプラグイン | telop-plan.md（フレーム確定済み） |',
    '| 3 | 演者色の適用 | 人 | 冒頭3分の割当表を流用（色は変えない） |',
    '| 4 | 演出・画像 | design (Codex) | 冒頭の頻度・トンマナをそのまま。3色以内 |',
    '| 5 | SE | mixer (Codex) | 演出とセット。-20.0dB。同じSE連続NG |',
    '| 6 | 表記最終確認 | common-manual | 上の照合結果 + 誤字脱字ツール |',
    '',
    '> BGMは全尺のカット・テロップ・演出が確定してから（工程15）。',
    '> 演出頻度が未確定のままなら、着手前にディレクターへ（6秒/10秒の矛盾）。'
  ].join('\n'), 'utf8');

  console.log(`\n  指示書: ${runbookPath}`);
  console.log(bold('\n━━ 完了。カット候補は目視確認を経て確定してください ━━\n', NO_COLOR));
}

function secToSrt(s) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = Math.floor(s) % 60;
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${p(h)}:${p(m)}:${p(ss)},${p(ms, 3)}`;
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  const cmd = args.shift();

  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    if (i === -1) return fallback;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };

  const fpsArg = get('--fps', '29.97');
  const outDir = get('--dir', join(ROOT, 'segment-out'));
  const baseline = get('--baseline', join(outDir, 'baseline.json'));
  const inTC = get('--in', null);
  const outTC = get('--out', null);

  /* フレームレートはシーケンス設定と必ず一致させる。
     29.97 のフレーム番号は 00-29 までなので、それを超える値を含む
     タイムコードを渡された場合は 59.94 などを疑うこと。 */
  const rate = tc.resolveRate(fpsArg);

  if (cmd === 'analyze' && args[0]) {
    cmdAnalyze(args[0], outDir, rate);
  } else if (cmd === 'produce' && args[0] && inTC && outTC) {
    cmdProduce(args[0], inTC, outTC, outDir, baseline, rate);
  } else {
    console.log('使い方:');
    console.log('  node tools/segment-kit.mjs analyze <srt> [--dir 出力先]');
    console.log('  node tools/segment-kit.mjs produce <srt> --in 00;03;10;03 --out 00;06;10;29 [--dir 出力先] [--baseline baseline.json] [--fps 29.97]');
    process.exit(2);
  }
}

try {
  main();
} catch (e) {
  console.error('\n  ✗ ' + String(e && e.message ? e.message : e) + '\n');
  process.exit(1);
}
