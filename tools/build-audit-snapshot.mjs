#!/usr/bin/env node
/*
 * build-audit-snapshot.mjs
 *
 * ガバナンス監査を実行し、その結果をブラウザが読める形で書き出す。
 *
 * === なぜスナップショットなのか ===
 *
 * ブラウザは stdio の MCP サーバーへ直接つながらない。つなげてもいけない。
 * かといって画面に GO / NO-GO を出さないと、出荷判定がどこにも見えない。
 *
 * そこで「実際に governance.mjs を走らせた結果を、生成時刻つきで固定する」
 * という読み取り専用の経路にする。Node 側の既存構成のままで、
 * 新しいサーバーもポートも要らない。
 *
 * === 偽のリアルタイムにしないこと ===
 *
 * これはスナップショットであって、今この瞬間の状態ではない。
 * 生成時刻を必ず一緒に持たせ、画面にもそう表示させる。
 * 「実行中」「稼働中」と読める言葉を使わない。
 *
 * === 使い方 ===
 *
 *   node tools/build-audit-snapshot.mjs
 *     → video-manual-visualizer/audit-snapshot.js
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'video-manual-visualizer/audit-snapshot.js');

/* 監査を実行する。NO-GO でも非ゼロ終了するので、出力は例外側からも拾う。 */
function runGovernance() {
  try {
    return execFileSync(process.execPath, [resolve(ROOT, 'agents/governance.mjs')], {
      cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, NO_COLOR: '1' }
    });
  } catch (e) {
    /* ブロッカーがあると非ゼロ終了する。それも正しい結果なので読む。 */
    return String(e.stdout || '');
  }
}

const out = runGovernance();
if (!out) {
  console.error('監査を実行できませんでした。node agents/governance.mjs で確認してください。');
  process.exit(1);
}

/* 集計行と判定を読む。書式が変わったら気づけるよう、読めない場合は落とす。 */
const counts = out.match(/検査\s*(\d+)\s*件\s+合格\s*(\d+)\s+ブロッカー\s*(\d+)\s+警告\s*(\d+)/);
const verdict = out.match(/判定:\s*(GO|NO-GO)/);
if (!counts || !verdict) {
  console.error('監査の出力を読み取れませんでした。governance.mjs の書式が変わった可能性があります。');
  process.exit(1);
}

/* 各項目の結果。ブロッカーと警告だけを載せる（全件だと画面が読めない）。 */
const items = [];
const re = /^\s*(PASS|BLOCK|WARN)\s+(\S+)\s+(.+)$/gm;
let m;
while ((m = re.exec(out)) !== null) {
  items.push({ result: m[1], id: m[2], name: m[3].trim() });
}

const failing = items.filter((i) => i.result !== 'PASS');

const data = {
  /* 生成時刻。これがないとスナップショットが現在値に見えてしまう。 */
  generatedAt: new Date().toISOString(),
  kind: 'snapshot',
  note: 'これは生成時点の監査結果です。実行中の状態ではありません。最新の判定は node agents/governance.mjs で確認してください。',
  source: 'agents/governance.mjs',
  total: Number(counts[1]),
  passed: Number(counts[2]),
  blockers: Number(counts[3]),
  warnings: Number(counts[4]),
  verdict: verdict[1],
  failing
};

const body = `/*
 * audit-snapshot.js
 *
 * このファイルは tools/build-audit-snapshot.mjs が生成します。手で編集しないでください。
 * 内容は「生成時点の監査結果」です。実行中の状態ではありません。
 */
(function (root, factory) {
  var data = factory();
  root.AUDIT_SNAPSHOT = data;
  if (typeof module === 'object' && module.exports) { module.exports = data; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return ${JSON.stringify(data, null, 2).split('\n').join('\n  ')};
});
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body, 'utf8');

console.log(`判定        : ${data.verdict}`);
console.log(`検査        : ${data.total}件（合格 ${data.passed} / ブロッカー ${data.blockers} / 警告 ${data.warnings}）`);
console.log(`未合格      : ${failing.length}件${failing.length ? ' — ' + failing.map((f) => f.id).join(', ') : ''}`);
console.log(`生成時刻    : ${data.generatedAt}`);
console.log(`出力        : ${OUT.replace(ROOT + '/', '')}`);
