#!/usr/bin/env node
/*
 * build-plugin-data.mjs
 *
 * manual-data.js から、UXPプラグインが同梱で持つデータスナップショットを生成する。
 *
 * UXPプラグインはPremiere内で動くため、MCPサーバーへ常時接続できるとは限らない。
 * そこで必要なデータだけをJSONに切り出して同梱し、オフラインでも動くようにする。
 *
 * データを二重管理しないため、必ずこのスクリプトで生成する。手で編集しないこと。
 *
 * 実行: node tools/build-plugin-data.mjs
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = resolve(__dirname, '..');
const DATA = require(resolve(ROOT, 'video-manual-visualizer/manual-data.js'));

/* 素材確認の項目は台帳「素材確認」から取り出す */
const materialLedger = DATA.ledger.find((l) => l.title === '素材確認');
const materialItems = materialLedger.sections
  .filter((s) => s.heading === '確認項目')
  .flatMap((s) => s.items)
  .map((text, i) => ({ id: `M${String(i + 1).padStart(2, '0')}`, text, ruleType: 'official' }));

/* 音声設定の数値 */
const audioGroup = DATA.numericStandards.find((g) => g.group === '音量・音声処理');

/* テロップの数値 */
const telopGroup = DATA.numericStandards.find((g) => g.group === 'テロップ');

const snapshot = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'video-manual-visualizer/manual-data.js',
  note: 'このファイルは tools/build-plugin-data.mjs が生成します。手で編集しないでください。',

  ruleTypes: DATA.ruleTypes,

  /* 工程 */
  processes: DATA.processes.map((p) => ({
    id: p.id, no: p.no, title: p.title, summary: p.summary, ruleType: p.ruleType,
    what: p.what, why: p.why, fails: p.fails, done: p.done,
    conflictNote: p.conflictNote || null,
    improvementNote: p.improvementNote || null
  })),

  /* チェックリスト */
  checklist: DATA.checklist,
  checklistImprovements: DATA.checklistImprovements,
  clipChecklist: DATA.clipChecklist,
  materialChecklist: materialItems,

  /* 数値 */
  audioStandards: audioGroup.items,
  telopStandards: telopGroup.items,
  numericStandards: DATA.numericStandards,

  /* 表記辞書 */
  dictionary: DATA.dictionary.concat(DATA.splitEditDictionary),

  /* 矛盾・要確認 */
  conflicts: DATA.audit.conflicts,
  needsConfirmation: DATA.audit.needsConfirmation,

  /* 事故防止 */
  accidentMap: DATA.accidentMap,

  /* テンプレート */
  templates: DATA.templates,

  /* 提出物 */
  submissionTriad: DATA.submissionTriad,

  /* 用語 */
  glossary: DATA.glossary
};

/*
 * UMD形式で書き出す。
 *
 * UXPは <script type="module"> に対応していないため、ESモジュールにすると
 * Premiere内でパネルが真っ白になる。グローバルへ代入する古典的スクリプトにする。
 * Node から require/import しても使えるよう module.exports も付ける。
 */
const target = resolve(ROOT, 'uxp-plugin/data/manual-snapshot.js');
mkdirSync(dirname(target), { recursive: true });

const json = JSON.stringify(snapshot, null, 2);
const module_ = [
  '/*',
  ' * manual-snapshot.js',
  ' * このファイルは tools/build-plugin-data.mjs が生成します。手で編集しないでください。',
  ' * 情報源: video-manual-visualizer/manual-data.js',
  ' *',
  ' * UXPは ESモジュールに対応していないため、グローバルへ代入する形式にしている。',
  ' */',
  '',
  '(function (root, factory) {',
  '  var data = factory();',
  '  root.MANUAL_SNAPSHOT = data;',
  "  if (typeof module === 'object' && module.exports) { module.exports = data; }",
  "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {",
  '  return ' + json + ';',
  '});',
  ''
].join('\n');

writeFileSync(target, module_, 'utf8');

/* URL混入チェック（欠損リンクを推測しない方針の担保） */
const urls = json.match(/https?:\/\/[^\s")]+/g) || [];
if (urls.length) {
  console.error('エラー: スナップショットにURLが含まれています:', urls.join(', '));
  process.exit(1);
}

console.log('生成: uxp-plugin/data/manual-snapshot.js');
console.log(`  ${(json.length / 1024).toFixed(0)} KB`);
console.log(`  工程 ${snapshot.processes.length} / 素材確認 ${snapshot.materialChecklist.length}`);
console.log(`  提出前チェック ${snapshot.checklist.length}（改善候補 ${snapshot.checklistImprovements.length} は別管理）`);
console.log(`  切り抜きチェック ${snapshot.clipChecklist.length} / 辞書 ${snapshot.dictionary.length}`);
console.log(`  音声基準 ${snapshot.audioStandards.length} / テロップ基準 ${snapshot.telopStandards.length}`);
console.log(`  矛盾 ${snapshot.conflicts.length} / 事故防止 ${snapshot.accidentMap.length}`);
console.log('  URL混入: 0件');
