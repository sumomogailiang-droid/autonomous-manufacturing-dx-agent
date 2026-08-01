#!/usr/bin/env node
/*
 * build-speaker-worksheet.mjs
 *
 * 工程7「演者ごとにテロップの色を分ける」のための話者割当ワークシートを作る。
 *
 * === なぜこのツールが必要か ===
 *
 * 共通マニュアル 工程7 は「複数人いる場合は、人物ごとのテロップ色を統一します」と定め、
 * よくある失敗に「演者ごとのテロップ色切り替えを間違える」を挙げている。
 *
 * ところが文字起こしSRTには話者ラベルが無い。
 * 本文だけを読んで「この行は誰」と決めるのは推測であり、
 * AGENTS.md の「知識ベースにないことを推測で補わない」に反する。
 *
 * そこでこのツールは、テキストから機械的に確定できることだけを出す。
 *
 *   確定できる  : 同時発話（時間が重なる行）は必ず別の話者
 *   手がかり止まり: 語尾のレジスタ（敬語 / 〜っす / 関西弁 / タメ口）
 *   確定できない : 誰が何色か。これは映像を見て人が決める
 *
 * 出力は「映像を見ながら埋める用紙」であって、話者の答えではない。
 *
 * === 色を決めるのは誰か ===
 *
 * 共通マニュアル「8. 分割編集時のフロー」および「事前共有」より、
 * 冒頭担当者が演者テロップ色を決め、編集者とディレクターへ共有する。
 * 明記すべきは「演者名・テロップ色・ラベル色」の3つ。
 *
 * 案件マニュアル側の制約（CAMPチャンネル）:
 *   「トンマナにないテロップデザインを使用する」は絶対NG。
 *   色はチャンネルテンプレートの中から選ぶこと。
 *
 * === 使い方 ===
 *
 *   node tools/build-speaker-worksheet.mjs <文字起こし.srt> <出力.md> [--fps 29.97]
 *
 * 文字起こしはクライアント素材なので、出力をリポジトリへコミットしないこと。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* 既存モジュールを再利用する。パーサとフレーム計算を二重に持たないため。 */
const telop = require(resolve(ROOT, 'uxp-plugin/telop.js'));
const tc = require(resolve(ROOT, 'uxp-plugin/timecode.js'));

/* ------------------------------------------------------------------ *
 * 語尾レジスタ
 *
 * 話者そのものではなく「話し方の系統」を拾う。
 * 同じ系統でも別人のことがあるため、確定には使わない。
 * ------------------------------------------------------------------ */
const REGISTERS = [
  {
    id: 'ssu',
    label: '〜っす',
    /* 「っすか」「っすね」「っすよ」「っす。」と、その縮約形「んすか」 */
    re: /っす(?:か|ね|よ|わ)?(?:[。？！\s]|$)|っす(?:か|ね|よ)|んす(?:か|ね|よ)/
  },
  {
    id: 'kansai',
    label: '関西弁',
    /* 地域がはっきり出る語だけを拾う。
       「じゃん」「ちゃん」は関東でも使うため、直前が「じ」「ち」の「やん」は除外する。 */
    re: /ほんま|せや|ちゃうん|(?<![じち])やん(?=[、。！？\s]|$)|へんで|(?:ら|さ)ん(?:とい|とっ)|やな(?=[、。！？\s]|$)|やわ(?=[、。！？\s]|$)|おおきに/
  },
  {
    id: 'keigo',
    label: '敬語',
    /* 現在形「です・ます」だけでなく、過去形「ました」否定「ません」も拾う。
       「やってまいりました」は「ます」を含まないため、これが無いとタメ口に落ちる。 */
    re: /です|ます|ましょ|まし[たて]|ません|ございま|でしょうか|ください/
  }
];

function detectRegister(text) {
  for (const r of REGISTERS) {
    if (r.re.test(text)) return r;
  }
  return { id: 'tame', label: 'タメ口', re: null };
}

/* ------------------------------------------------------------------ *
 * 同時発話の検出
 *
 * 時間が重なる2行は、物理的に同じ人が同時に喋れないため別話者で確定する。
 * SRTから話者について確定できる唯一の情報。
 * ------------------------------------------------------------------ */
function findOverlaps(cues) {
  /* SRTの記載順が時間順とは限らないため、時間順の複製で走査する。
     行番号は元のまま持ち回るので、出力の番号はSRTと一致する。 */
  const sorted = [...cues].sort((a, b) => (a.inFrame - b.inFrame) || (a.outFrame - b.outFrame));
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].inFrame >= sorted[i].outFrame) break;
      if (sorted[i].inFrame < sorted[j].outFrame) {
        pairs.push([sorted[i], sorted[j]].sort((a, b) => a.no - b.no));
      }
    }
  }
  return pairs.sort((a, b) => a[0].no - b[0].no);
}

/** 同時に鳴っている行の最大数。話者数の下限になる。 */
function maxConcurrent(cues) {
  const events = [];
  for (const c of cues) {
    events.push({ f: c.inFrame, d: 1 });
    events.push({ f: c.outFrame, d: -1 });
  }
  events.sort((a, b) => (a.f - b.f) || (a.d - b.d));
  let cur = 0;
  let max = 0;
  for (const e of events) {
    cur += e.d;
    if (cur > max) max = cur;
  }
  return max;
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */
function build(srtText, fpsArg) {
  const rate = tc.resolveRate(fpsArg || '29.97');
  const parsed = telop.parseSubtitles(srtText);
  if (!parsed.length) throw new Error('字幕を1件も読み取れませんでした。SRT形式か確認してください。');

  /* parseSubtitles は start/end を「00:01:29.230」形式の文字列で返す。
     秒へ直してからフレームへ確定させる（文字列のまま渡すと全行0フレームになる）。 */
  const cues = parsed.map((c, i) => {
    const startSec = telop.tcToSeconds(c.start);
    const endSec = telop.tcToSeconds(c.end);
    if (!isFinite(startSec) || !isFinite(endSec)) {
      throw new Error(`${i + 1}行目のタイムコードを解釈できませんでした: ${c.start} → ${c.end}`);
    }
    const inFrame = tc.secondsToFrames(startSec, rate);
    const outFrame = tc.secondsToFrames(endSec, rate);
    const text = String(c.text || '').replace(/\s*\n\s*/g, ' ').trim();
    return {
      no: i + 1,
      inFrame,
      outFrame,
      inTc: tc.framesToTimecode(inFrame, rate),
      outTc: tc.framesToTimecode(outFrame, rate),
      frames: Math.max(0, outFrame - inFrame),
      text,
      chars: [...text].length,
      register: detectRegister(text)
    };
  });

  const overlaps = findOverlaps(cues);
  const overlapNos = new Set();
  for (const [a, b] of overlaps) {
    overlapNos.add(a.no);
    overlapNos.add(b.no);
  }

  const byRegister = new Map();
  for (const c of cues) {
    const k = c.register.label;
    byRegister.set(k, (byRegister.get(k) || 0) + 1);
  }

  return { rate, cues, overlaps, overlapNos, byRegister, floor: Math.max(1, maxConcurrent(cues)) };
}

/* ------------------------------------------------------------------ *
 * Markdown 出力
 * ------------------------------------------------------------------ */
function toMarkdown(r, srcName) {
  const L = [];
  const total = r.cues.length;

  L.push('# 工程7 話者割当ワークシート');
  L.push('');
  L.push(`- 元ファイル: \`${srcName}\``);
  L.push(`- フレームレート: ${r.rate.exact.toFixed(6)} fps（${r.rate.drop ? 'ドロップフレーム' : 'ノンドロップ'}）`);
  L.push(`- 字幕行数: ${total}行`);
  L.push('');
  L.push('> このファイルはクライアント素材の本文を含みます。リポジトリへコミットしないでください。');
  L.push('');

  L.push('## この用紙の使い方');
  L.push('');
  L.push('文字起こしには話者ラベルがありません。');
  L.push('本文だけを読んで話者を決めると推測になり、共通マニュアル 工程7 のよくある失敗');
  L.push('「演者ごとのテロップ色切り替えを間違える」に直結します。');
  L.push('');
  L.push('そのため、このツールは**機械的に確定できることだけ**を書いています。');
  L.push('「話者」欄は空欄です。映像を見ながら埋めてください。');
  L.push('');
  L.push('| 記号 | 意味 |');
  L.push('|---|---|');
  L.push('| ⧉ | 同時発話。直前後の行と時間が重なっており、**別話者で確定** |');
  L.push('| 敬語 / 〜っす / 関西弁 / タメ口 | 語尾から拾った話し方の系統。**手がかりであり確定ではない** |');
  L.push('');

  L.push('## 機械的に分かったこと');
  L.push('');
  L.push('| 項目 | 値 | 確度 |');
  L.push('|---|---|---|');
  L.push(`| 字幕行数 | ${total}行 | 確定 |`);
  L.push(`| 同時発話のペア | ${r.overlaps.length}組 | 確定 |`);
  L.push(`| 同時発話に関わる行 | ${r.overlapNos.size}行 | 確定 |`);
  L.push(`| 話者数の下限 | ${r.floor}人以上 | 確定（同時に鳴っている行の最大数） |`);
  for (const [label, n] of [...r.byRegister].sort((a, b) => b[1] - a[1])) {
    L.push(`| 語尾「${label}」 | ${n}行 | 手がかり |`);
  }
  L.push(`| 実際の演者数 | — | **要確認（映像を見る）** |`);
  L.push(`| 演者名 | — | **要確認（裏取りが必要）** |`);
  L.push(`| 各演者のテロップ色・ラベル色 | — | **未定（冒頭担当者が決める）** |`);
  L.push('');

  if (r.overlaps.length) {
    L.push('### 同時発話（別話者で確定）');
    L.push('');
    L.push('この行同士は必ず違う人です。色も必ず分かれます。');
    L.push('共通マニュアルの重なり処理により、後から来た発話は上のトラックへ乗ります。');
    L.push('');
    L.push('| 行 | IN | OUT | 本文 |');
    L.push('|---:|---|---|---|');
    for (const [a, b] of r.overlaps) {
      L.push(`| ${a.no} | ${a.inTc} | ${a.outTc} | ${md(a.text)} |`);
      L.push(`| ${b.no} | ${b.inTc} | ${b.outTc} | ${md(b.text)} |`);
    }
    L.push('');
  }

  L.push('## 割当表');
  L.push('');
  L.push('「話者」と「色」を埋めてください。埋めた表がそのまま次の工程の入力になります。');
  L.push('');
  L.push('| # | IN | OUT | F | 字 | 語尾 | 本文 | 話者 | 色 |');
  L.push('|---:|---|---|---:|---:|---|---|---|---|');
  for (const c of r.cues) {
    const mark = r.overlapNos.has(c.no) ? '⧉' : '';
    L.push(
      `| ${c.no}${mark} | ${c.inTc} | ${c.outTc} | ${c.frames} | ${c.chars} | ${c.register.label} | ${md(c.text)} |  |  |`
    );
  }
  L.push('');

  L.push('## 埋め終わったら送る「事前共有」');
  L.push('');
  L.push('共通マニュアル「事前共有」より、冒頭担当者が演者テロップ色を編集者とディレクターへ共有します。');
  L.push('明記が必要なのは **演者名・テロップ色・ラベル色** の3つです。');
  L.push('');
  L.push('```');
  L.push('【事前共有】演者テロップ色');
  L.push('');
  L.push('冒頭3分の担当分です。以下の色で統一します。');
  L.push('');
  L.push('演者名 / テロップ色 / ラベル色');
  L.push('（　　）/（　　）/（　　）');
  L.push('（　　）/（　　）/（　　）');
  L.push('');
  L.push('色はチャンネルテンプレートの中から選んでいます。');
  L.push('中盤・終盤の担当者で、ここに出ていない演者が追加で出た場合は追加共有をお願いします。');
  L.push('```');
  L.push('');
  L.push('## 色を選ぶときの制約');
  L.push('');
  L.push('| 制約 | 出典 |');
  L.push('|---|---|');
  L.push('| テンプレートに無いテロップデザインを使わない | 案件マニュアル（絶対NG項目） |');
  L.push('| 演者ごとに色を統一する | 共通マニュアル 工程7 |');
  L.push('| 演者名・テロップ色・ラベル色を明記して共有する | 共通マニュアル 事前共有 |');
  L.push('| 決めるのは冒頭担当者 | 共通マニュアル 8. 分割編集時のフロー |');
  L.push('| ラベル色が変更できない場合はスパナ →「ソースクリップ名とラベルを表示」のチェックを外す | 共通マニュアル |');
  L.push('');

  return L.join('\n');
}

/** Markdownの表を壊す文字を逃がす */
function md(s) {
  return String(s).replace(/\|/g, '\\|');
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
function main() {
  const args = process.argv.slice(2);
  const fpsIdx = args.indexOf('--fps');
  let fps = '29.97';
  if (fpsIdx !== -1) {
    fps = args[fpsIdx + 1];
    args.splice(fpsIdx, 2);
  }
  const [src, out] = args;
  if (!src || !out) {
    console.error('使い方: node tools/build-speaker-worksheet.mjs <文字起こし.srt> <出力.md> [--fps 29.97]');
    process.exit(2);
  }

  const r = build(readFileSync(src, 'utf8'), fps);
  const jsonPath = out.replace(/\.md$/, '.json');

  writeFileSync(out, toMarkdown(r, src.split('/').pop()), 'utf8');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        fps: r.rate.exact,
        drop: r.rate.drop,
        speakerFloor: r.floor,
        cues: r.cues.map((c) => ({
          no: c.no,
          inFrame: c.inFrame,
          outFrame: c.outFrame,
          text: c.text,
          register: c.register.id,
          overlapped: r.overlapNos.has(c.no),
          speaker: null,
          color: null
        }))
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`字幕行数        : ${r.cues.length}`);
  console.log(`同時発話ペア    : ${r.overlaps.length}（別話者で確定）`);
  console.log(`話者数の下限    : ${r.floor}人以上`);
  for (const [label, n] of [...r.byRegister].sort((a, b) => b[1] - a[1])) {
    console.log(`語尾 ${label.padEnd(6, '　')}: ${n}行（手がかり）`);
  }
  console.log('');
  console.log(`ワークシート    : ${out}`);
  console.log(`機械可読        : ${jsonPath}`);
  console.log('');
  console.log('話者名・色は埋めていません。映像を見て確定させてください。');
}

main();
