#!/usr/bin/env node
/*
 * build-knowledge.mjs
 *
 * video-manual-visualizer/manual-data.js を唯一の情報源として、
 * 共通マニュアルエージェントが読む知識ベース（Markdown）を生成する。
 *
 * データを二重管理しないため、知識ベースは必ずこのスクリプトで生成する。
 * 手で編集しないこと。
 *
 * 実行: node agents/build-knowledge.mjs
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DATA = require(resolve(__dirname, '../video-manual-visualizer/manual-data.js'));

const RULE_LABEL = {
  official: '正式記載',
  project: '案件依存',
  conflict: '矛盾・要決定',
  improvement: '改善候補（正式ルールではない）'
};

const out = [];
const w = (s = '') => out.push(s);

w('<!-- このファイルは agents/build-knowledge.mjs が自動生成します。手で編集しないでください。 -->');
w('<!-- 情報源: video-manual-visualizer/manual-data.js -->');
w('');
w('# 動画編集者 全体マニュアル 知識ベース');
w('');
w('このファイルは共通マニュアルエージェントの参照元です。');
w('ここに書かれていないことを、推測で補ってはいけません。');
w('');
w('## ルール種別の読み方');
w('');
w('| 種別 | 意味 | 扱い |');
w('|---|---|---|');
w('| 正式記載 | 元マニュアルに明記されている | そのまま適用する |');
w('| 案件依存 | 案件マニュアル・チャンネルルール・ディレクター判断が優先 | 案件側の指定を先に確認する |');
w('| 矛盾・要決定 | マニュアル内で基準が衝突している | 独断で統一せず、両方を提示して確認を求める |');
w('| 改善候補 | 現行マニュアルに正式ルールとして存在しない | 正式ルールとして扱わない。指摘は「提案」として明示する |');
w('');

/* ---------------- 工程 ---------------- */
w('---');
w('');
w('## 1. 制作工程（全13工程）');
w('');
for (const p of DATA.processes) {
  w(`### 工程${p.no}: ${p.title}　[${RULE_LABEL[p.ruleType]}]`);
  w('');
  w(`**結論**: ${p.summary}`);
  w('');
  w('**何をするか**');
  p.what.forEach((x) => w(`- ${x}`));
  w('');
  w('**なぜ必要か**');
  p.why.forEach((x) => w(`- ${x}`));
  w('');
  w('**よくある失敗**');
  p.fails.forEach((x) => w(`- ${x}`));
  w('');
  w('**完了条件**');
  p.done.forEach((x) => w(`- ${x}`));
  w('');
  if (p.conflictNote) { w(`> ⚠ 矛盾・要決定: ${p.conflictNote}`); w(''); }
  if (p.improvementNote) { w(`> ＋ 改善候補（正式ルールではない）: ${p.improvementNote}`); w(''); }
  const rel = p.related
    .map((rid) => DATA.ledger.find((l) => l.id === rid))
    .filter(Boolean)
    .map((l) => `${l.no}. ${l.title}`);
  w(`**関連マニュアル**: ${rel.join(' / ')}`);
  w('');
}

/* ---------------- 数値基準 ---------------- */
w('---');
w('');
w('## 2. 数値基準（変更禁止。数字・単位・条件はこのとおり）');
w('');
for (const g of DATA.numericStandards) {
  w(`### ${g.group}`);
  w('');
  if (g.unitNote) { w(`${g.unitNote}`); w(''); }
  w('| 項目 | 基準値 | 種別 | 補足 |');
  w('|---|---|---|---|');
  for (const i of g.items) {
    const unit = i.unit && i.unit !== '—' ? ` ${i.unit}` : '';
    w(`| ${i.name} | ${i.value}${unit} | ${RULE_LABEL[i.ruleType]} | ${(i.note || '').replace(/\|/g, '\\|')} |`);
  }
  w('');
}

/* ---------------- 品質評価 ---------------- */
w('---');
w('');
w('## 3. 品質評価基準');
w('');
for (const q of DATA.qualityLevels) {
  w(`### ${q.label}（${q.score > 0 ? '+' : ''}${q.score}点・${q.caption}）`);
  w('');
  q.conditions.forEach((c) => w(`- ${c}`));
  w('');
}

/* ---------------- 素材確認・事故防止 ---------------- */
w('---');
w('');
w('## 4. 事故防止マップ（原因 → 事故 → 防止策 → 最終確認）');
w('');
for (const a of DATA.accidentMap) {
  w(`### ${a.title}　[${RULE_LABEL[a.ruleType]}]`);
  w('');
  w(`- **原因**: ${a.cause}`);
  w(`- **起きる事故**: ${a.accident}`);
  w(`- **防止策**: ${a.prevention}`);
  w(`- **最終確認**: ${a.finalCheck}`);
  w('');
}

/* ---------------- チェックリスト ---------------- */
w('---');
w('');
w('## 5. 提出前チェックリスト');
w('');
w('### 正式チェック（18項目）');
w('');
DATA.checklist.forEach((c, n) => {
  w(`${n + 1}. ${c.text}${c.note ? `　⚠ ${c.note}` : ''}`);
});
w('');
w('### 改善候補（12項目・正式チェックではない）');
w('');
w('次は現行の正式チェックに含まれていません。指摘する場合は「提案」と明示すること。');
w('');
DATA.checklistImprovements.forEach((c, n) => w(`${n + 1}. ${c.text}`));
w('');
w('### 切り抜き 納品前チェック（12項目）');
w('');
DATA.clipChecklist.forEach((c, n) => w(`${n + 1}. ${c.text}`));
w('');
w(`**提出物**: ${DATA.submissionTriad.items.join(' / ')}`);
w('');
w(`> ⚠ ${DATA.submissionTriad.conflict}`);
w('');
w(`**ディレクター提出時の文言**: 「${DATA.submissionTriad.directorPhrase}」`);
w('');

/* ---------------- 台帳27項目 ---------------- */
w('---');
w('');
w('## 6. マニュアル台帳（全27項目）');
w('');
for (const l of DATA.ledger) {
  w(`### ${l.no}. ${l.title}　[${RULE_LABEL[l.ruleType]}]`);
  w('');
  w(`**結論**: ${l.lead.replace(/^結論：/, '')}`);
  w('');
  for (const s of l.sections) {
    w(`#### ${s.heading}　[${RULE_LABEL[s.ruleType]}]`);
    w('');
    s.items.forEach((x) => w(`- ${x}`));
    w('');
  }
}

/* ---------------- 表記辞書 ---------------- */
w('---');
w('');
w('## 7. 表記揺れ・開く漢字辞書');
w('');
w('この一覧の表記を間違えた場合は重大ミスとして扱う記載がある。');
w('');
w('| 誤表記 | 正しい表記 | 読み | 分類 | 備考 |');
w('|---|---|---|---|---|');
for (const d of DATA.dictionary.concat(DATA.splitEditDictionary)) {
  w(`| ${d.wrong} | ${d.correct} | ${d.reading} | ${d.group} | ${d.note || ''} |`);
}
w('');

/* ---------------- 監査 ---------------- */
w('---');
w('');
w('## 8. マニュアル監査（矛盾・欠損・要確認）');
w('');
w('### 矛盾・要決定');
w('');
for (const c of DATA.audit.conflicts) {
  w(`#### ${c.title}`);
  w('');
  c.points.forEach((p) => w(`- ${p}`));
  w('');
  w(`- 状態: ${c.status}`);
  w(`- 対応: ${c.action}`);
  w('');
}
w('### 目次の問題');
w('');
DATA.audit.tocIssues.forEach((t) => w(`- ${t.text}`));
w('');
w('### 欠損リンク');
w('');
DATA.audit.missingLinks.forEach((m) => w(`- [${m.label}] ${m.text}`));
w('');
w(`> **${DATA.audit.missingLinkPolicy}** 欠損しているURLを推測して補ってはいけない。`);
w('');
w('### 要確認（ルールが記載されていない）');
w('');
DATA.audit.needsConfirmation.forEach((q) => w(`- [${q.label}] ${q.text}`));
w('');
w('### 改善候補（正式ルールではない）');
w('');
DATA.audit.improvements.forEach((i) => w(`- ${i.text}　（現状: ${i.reason}）`));
w('');
w('### 古い説明（正式ルールへ統合しない）');
w('');
DATA.audit.outdated.forEach((o) => w(`- ${o.text}　（理由: ${o.reason}）`));
w('');

/* ---------------- 連絡テンプレート ---------------- */
w('---');
w('');
w('## 9. 連絡テンプレート');
w('');
for (const t of DATA.templates) {
  w(`### ${t.title}（${t.category}）`);
  w('');
  if (t.purpose) { w(`用途: ${t.purpose}`); w(''); }
  w('```');
  w(t.body);
  w('```');
  w('');
  if (t.ng) { w(`NG例: ${t.ng.join(' / ')}`); w(''); }
  if (t.ok) { w(`OK例: ${t.ok.join(' / ')}`); w(''); }
  if (t.extra) { w(`補足: ${t.extra}`); w(''); }
}

/* ---------------- 切り抜き・育成 ---------------- */
w('---');
w('');
w('## 10. 切り抜き動画');
w('');
w('### 業務フロー');
w('');
DATA.clipWorkflow.flow.forEach((f, n) => w(`${n + 1}. ${f}`));
w('');
w('### 禁止');
w('');
DATA.clipWorkflow.prohibited.forEach((p) => w(`- ${p}`));
w('');
w('### 書き出し');
w('');
w('- 縦型: 9:16 / 1,080×1,920 / YouTube Shorts・TikTok・Instagramリール');
w('- 横型: 16:9 / 1,920×1,080');
w('- 形式: MP4 / H.264');
w(`- 命名: ${DATA.clipWorkflow.naming}（${DATA.clipWorkflow.namingNote}）`);
w('');
w('### タイトル4要素');
w('');
DATA.clipWorkflow.titleElements.forEach((t, n) => w(`${n + 1}. ${t}`));
w('');
w(DATA.clipWorkflow.titleNote);
w('');

w('---');
w('');
w('## 11. 中級編集者からディレクターへ');
w('');
w(DATA.directorPath.definition);
w('');
for (const s of DATA.directorPath.steps) {
  w(`### ${s.label}: ${s.title}`);
  w('');
  s.tasks.forEach((t) => w(`- ${t}`));
  if (s.skill) { w(''); w(`身に付く力: ${s.skill}`); }
  w('');
}
w(`> ＋ 改善候補: ${DATA.directorPath.improvementNote}`);
w('');

/* ---------------- 用語集 ---------------- */
w('---');
w('');
w('## 12. 用語集');
w('');
w('| 用語 | 読み | 説明 |');
w('|---|---|---|');
for (const g of DATA.glossary) {
  w(`| ${g.term} | ${g.reading} | ${g.desc.replace(/\|/g, '\\|')} |`);
}
w('');

const target = resolve(__dirname, 'knowledge/common-manual.md');
mkdirSync(dirname(target), { recursive: true });
const text = out.join('\n');
writeFileSync(target, text, 'utf8');

const counts = {
  '工程': DATA.processes.length,
  '台帳': DATA.ledger.length,
  '数値基準': DATA.numericStandards.reduce((n, g) => n + g.items.length, 0),
  '正式チェック': DATA.checklist.length,
  '改善候補チェック': DATA.checklistImprovements.length,
  'テンプレート': DATA.templates.length,
  '辞書': DATA.dictionary.length + DATA.splitEditDictionary.length,
  '事故防止': DATA.accidentMap.length,
  '用語集': DATA.glossary.length
};

console.log('生成: agents/knowledge/common-manual.md');
console.log(`  ${(text.length / 1024).toFixed(0)} KB / ${text.split('\n').length} 行`);
console.log('  ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / '));

/* 生成物にURLが混入していないことを確認（欠損リンクを推測しない方針の担保） */
const urls = text.match(/https?:\/\/[^\s)]+/g) || [];
if (urls.length) {
  console.error('エラー: 知識ベースにURLが含まれています:', urls.join(', '));
  process.exit(1);
}
console.log('  URL混入: 0件（欠損リンクを推測していない）');
