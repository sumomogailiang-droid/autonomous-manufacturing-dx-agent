#!/usr/bin/env node
/*
 * generate-project-agent.mjs
 *
 * 案件独自マニュアル（テキスト/Markdown/CSV）を読み込み、
 * 案件別エージェントが参照する知識ベースを生成する。
 *
 * 共通マニュアルをベースに、案件側の指定で上書きする構造を作る。
 * 共通マニュアルの値をコピーせず、「案件側に記載がある項目」だけを抽出して
 * 上書き表を作る。こうすることで、共通側が更新されても継承が自動で効く。
 *
 * 実行:
 *   node agents/generate-project-agent.mjs <案件マニュアルのパス> <案件ID> [案件名]
 *
 * 例:
 *   node agents/generate-project-agent.mjs ./manuals/camp-nagoya.md camp-nagoya "CAMPチャンネル 名古屋校"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const [, , srcPath, projectId, projectNameArg] = process.argv;

if (!srcPath || !projectId) {
  console.error('使い方: node agents/generate-project-agent.mjs <案件マニュアルのパス> <案件ID> [案件名]');
  console.error('例:     node agents/generate-project-agent.mjs ./manuals/camp.md camp-nagoya "CAMPチャンネル 名古屋校"');
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
  console.error(`案件IDは英小文字・数字・ハイフンのみにしてください: ${projectId}`);
  process.exit(1);
}

if (!existsSync(srcPath)) {
  console.error(`案件マニュアルが見つかりません: ${srcPath}`);
  process.exit(1);
}

const projectName = projectNameArg || projectId;
const raw = readFileSync(srcPath, 'utf8');

/* ------------------------------------------------------------------ */
/* 共通マニュアルの数値基準と突き合わせて、上書き候補を機械的に検出する   */
/* ------------------------------------------------------------------ */

/*
 * 検出は「候補の提示」までしか行わない。
 * 自動で確定させると、読み違えたまま案件ルールが確定してしまうため、
 * 必ず人が確認する前提の TODO 付きで出力する。
 */
const PROBES = [
  { key: '演出頻度',            re: /(\d+)\s*秒に\s*1\s*回/g,                     common: '6秒に1回 / 10秒に1回（共通側で矛盾・未決定）' },
  { key: 'テロップ1行の文字数',  re: /1行\s*(\d+)\s*[〜~-]\s*(\d+)\s*文字/g,        common: '15〜18文字' },
  { key: '装飾テロップのスケール', re: /スケール\s*(\d+)\s*以上/g,                   common: '150以上' },
  { key: '画角アップの増加量',   re: /(\d+)\s*%\s*ずつ/g,                          common: '30%ずつ' },
  { key: '演者音声の基準',       re: /-\s*(\d+(?:\.\d+)?)\s*dB/g,                  common: '-6.0dB（SE -20.0dB / BGM -29.0dB）' },
  { key: '切り抜きの本数',       re: /最低\s*(\d+)\s*本/g,                         common: '最低3本' },
  { key: '切り抜きの尺',         re: /(\d+)\s*秒\s*[〜~-]\s*(\d+)\s*分/g,          common: '30秒〜1分' },
  { key: 'タイトルの文字数',     re: /(\d+)\s*[〜~-]\s*(\d+)\s*文字/g,             common: '全角28〜40文字' },
  { key: '図解の使用色',         re: /(\d+)\s*色以内/g,                            common: '3色以内' }
];

const detected = [];
for (const p of PROBES) {
  const hits = [...raw.matchAll(p.re)].map((m) => m[0].trim());
  if (hits.length) {
    detected.push({ key: p.key, common: p.common, found: [...new Set(hits)] });
  }
}

/* 案件マニュアル内のURLは、原本に実在するものなのでそのまま残す（推測はしない） */
const urls = [...new Set(raw.match(/https?:\/\/[^\s)\]"'<>]+/g) || [])];

/* トンマナに関わるキーワードの抽出 */
const TONE_KEYWORDS = [
  'テロップ色', 'カラー', 'フォント', 'テンプレート', 'トンマナ',
  'BGM', 'SE', '効果音', 'サムネ', 'アイキャッチ', 'オープニング', 'エンディング'
];
const toneLines = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && TONE_KEYWORDS.some((k) => l.includes(k)))
  .slice(0, 40);

/* ------------------------------------------------------------------ */
/* 知識ベースの生成                                                     */
/* ------------------------------------------------------------------ */

const now = new Date().toISOString().slice(0, 10);
const out = [];
const w = (s = '') => out.push(s);

w('<!-- このファイルは agents/generate-project-agent.mjs が生成しました。 -->');
w(`<!-- 元ファイル: ${basename(srcPath)} / 生成日: ${now} -->`);
w('<!-- 「確認が必要」と書かれた箇所は、人が確認して確定させてください。 -->');
w('');
w(`# 案件マニュアル: ${projectName}`);
w('');
w(`- 案件ID: \`${projectId}\``);
w(`- 元ファイル: \`${basename(srcPath)}\``);
w(`- 取り込み日: ${now}`);
w('');
w('## 適用の優先順位');
w('');
w('```');
w('1. クライアント指定           ← 最優先');
w('2. この案件マニュアル');
w('3. チャンネル独自ルール');
w('4. 共通マニュアル             ← ベース（agents/knowledge/common-manual.md）');
w('5. 改善候補                   ← 正式ルールではない。適用しない');
w('```');
w('');
w('この案件マニュアルに記載がない項目は、共通マニュアルの値をそのまま継承します。');
w('共通マニュアルの値をここへコピーしないでください（共通側の更新が反映されなくなります）。');
w('');

w('---');
w('');
w('## 上書き候補（要確認）');
w('');
if (detected.length === 0) {
  w('数値の上書き候補は自動検出されませんでした。');
  w('共通マニュアルの数値基準をそのまま継承します。');
} else {
  w('案件マニュアル本文から、共通マニュアルと異なる可能性がある数値を機械的に抽出しました。');
  w('**自動で確定させていません。** 人が原文を確認して、採用する値を決めてください。');
  w('');
  w('| 項目 | 共通マニュアルの値 | 案件マニュアル内で検出した表現 | 採用値 |');
  w('|---|---|---|---|');
  for (const d of detected) {
    w(`| ${d.key} | ${d.common} | ${d.found.join(' , ')} | 確認が必要 |`);
  }
}
w('');

w('---');
w('');
w('## 共通マニュアルの未決定事項に対する、この案件の決定');
w('');
w('共通マニュアルで衝突している次の2点について、この案件での扱いを記入してください。');
w('未記入のままだと、案件別エージェントは「確認が必要」と回答します。');
w('');
w('| 未決定事項 | 共通マニュアルの状態 | この案件での決定 |');
w('|---|---|---|');
w('| 演出頻度 | 6秒に1回（演出・よくあるミス）vs 10秒に1回（提出前チェック） | 未記入 |');
w('| 提出方法 | Frame.io統一 vs YouTube限定公開（4箇所で衝突） | 未記入 |');
w('');

w('---');
w('');
w('## トンマナ関連の記述（本文から抽出）');
w('');
if (toneLines.length === 0) {
  w('トンマナに関する記述は検出されませんでした。ディレクターへ確認してください。');
} else {
  w('テロップ色・フォント・テンプレート・BGM・SEに関する記述を抽出しました。');
  w('**フォント・色・配置を勝手に変更してはいけません。**');
  w('');
  for (const l of toneLines) { w(`- ${l}`); }
}
w('');

if (urls.length) {
  w('---');
  w('');
  w('## 案件マニュアルに記載されているURL');
  w('');
  w('原本に実在するURLのみを転記しています。推測して補ったURLはありません。');
  w('');
  for (const u of urls) { w(`- ${u}`); }
  w('');
}

w('---');
w('');
w('## 案件マニュアル 原文');
w('');
w('以下は取り込んだ原文です。判断の根拠はここから引用してください。');
w('');
w('````');
w(raw.trimEnd());
w('````');
w('');

const target = resolve(__dirname, `knowledge/projects/${projectId}.md`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out.join('\n'), 'utf8');

/* ------------------------------------------------------------------ */
/* 結果表示                                                            */
/* ------------------------------------------------------------------ */

console.log(`生成: agents/knowledge/projects/${projectId}.md`);
console.log(`  案件名: ${projectName}`);
console.log(`  原文: ${(raw.length / 1024).toFixed(1)} KB`);
console.log('');

if (detected.length) {
  console.log(`  上書き候補 ${detected.length}件（要確認）:`);
  for (const d of detected) {
    console.log(`    - ${d.key}: ${d.found.join(' , ')}　（共通: ${d.common}）`);
  }
} else {
  console.log('  上書き候補: 検出なし（共通マニュアルを全面的に継承）');
}

console.log('');
console.log('  次の作業:');
console.log(`    1. agents/knowledge/projects/${projectId}.md を開く`);
console.log('    2. 「確認が必要」「未記入」の箇所を、原文を見ながら確定させる');
console.log(`    3. 案件別エージェントを使う: project-manual エージェントに案件ID「${projectId}」を伝える`);
