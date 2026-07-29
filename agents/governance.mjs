#!/usr/bin/env node
/*
 * governance.mjs
 *
 * CTOエージェントの「実体」。
 * 全エージェント・全成果物を機械的に監査し、GO / NO-GO を判定する。
 *
 * 人格プロンプトだけでは取り締まれない。ここで実際に検査する。
 *
 * 実行:
 *   node agents/governance.mjs           監査を実行して結果を表示
 *   node agents/governance.mjs --json    JSONで出力（CI用）
 *   node agents/governance.mjs --quiet   失敗した項目だけ表示
 *
 * 終了コード: 0 = GO / 1 = NO-GO（blocker あり）
 */

import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const QUIET = args.includes('--quiet');

const checks = [];

/**
 * @param {object} o
 * @param {string} o.id       C1-01 など
 * @param {string} o.category カテゴリ名
 * @param {string} o.name     検査名
 * @param {'blocker'|'warn'|'info'} o.severity 失敗時の重大度
 * @param {boolean} o.pass
 * @param {string} [o.detail]
 * @param {string} [o.action] 失敗時にやること
 */
function record(o) {
  checks.push({ detail: '', action: '', ...o });
}

function safe(fn, fallback = null) {
  try { return fn(); } catch (e) { return fallback; }
}

function read(p) {
  const full = resolve(ROOT, p);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

/* ================================================================== */
/* C1. データ整合性（唯一の情報源と生成物が同期しているか）              */
/* ================================================================== */

const CAT1 = 'データ整合性';

const manualDataPath = resolve(ROOT, 'video-manual-visualizer/manual-data.js');
const DATA = safe(() => require(manualDataPath));

record({
  id: 'C1-01', category: CAT1, severity: 'blocker',
  name: 'manual-data.js が読み込める（唯一の情報源）',
  pass: !!DATA,
  detail: DATA ? `工程${DATA.processes.length} / 台帳${DATA.ledger.length}` : '読み込み失敗',
  action: 'video-manual-visualizer/manual-data.js を修復してください'
});

/*
 * 生成物が最新かを確かめる。
 * 生成スクリプトを実際に走らせ、ディスク上の内容と一致するか比較する。
 * 「生成し忘れ」を機械的に検出できる唯一の方法。
 */
function checkGenerated(scriptRel, outputRel, id, label) {
  const before = read(outputRel);
  if (before === null) {
    record({
      id, category: CAT1, severity: 'blocker',
      name: `${label} が生成されている`,
      pass: false, detail: `${outputRel} が存在しません`,
      action: `node ${scriptRel} を実行してください`
    });
    return;
  }
  const ok = safe(() => {
    execFileSync(process.execPath, [resolve(ROOT, scriptRel)], { cwd: ROOT, stdio: 'pipe' });
    return true;
  }, false);

  if (!ok) {
    record({
      id, category: CAT1, severity: 'blocker',
      name: `${label} の生成が成功する`,
      pass: false, detail: '生成スクリプトが異常終了しました',
      action: `node ${scriptRel} を実行してエラーを確認してください`
    });
    return;
  }
  const after = read(outputRel);
  record({
    id, category: CAT1, severity: 'blocker',
    name: `${label} が manual-data.js と同期している`,
    pass: before === after,
    detail: before === after ? '同期済み' : '内容が古いままです（再生成が必要）',
    action: `node ${scriptRel} を実行してコミットしてください`
  });
}

checkGenerated('agents/build-knowledge.mjs', 'agents/knowledge/common-manual.md', 'C1-02', '共通マニュアル知識ベース');
checkGenerated('tools/build-plugin-data.mjs', 'uxp-plugin/data/manual-snapshot.js', 'C1-03', 'UXPプラグインのデータ');

/* 件数の一致 */
const knowledge = read('agents/knowledge/common-manual.md');
const snapshotSrc = read('uxp-plugin/data/manual-snapshot.js');
const snapshot = safe(() => JSON.parse(snapshotSrc.replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, '')));

if (DATA && snapshot) {
  const pairs = [
    ['提出前チェック', DATA.checklist.length, snapshot.checklist.length],
    ['改善候補', DATA.checklistImprovements.length, snapshot.checklistImprovements.length],
    ['切り抜きチェック', DATA.clipChecklist.length, snapshot.clipChecklist.length],
    ['工程', DATA.processes.length, snapshot.processes.length],
    ['表記辞書', DATA.dictionary.length + DATA.splitEditDictionary.length, snapshot.dictionary.length],
    ['事故防止', DATA.accidentMap.length, snapshot.accidentMap.length]
  ];
  const mismatch = pairs.filter(([, a, b]) => a !== b);
  record({
    id: 'C1-04', category: CAT1, severity: 'blocker',
    name: '本体とプラグインの件数が一致している',
    pass: mismatch.length === 0,
    detail: mismatch.length
      ? mismatch.map(([n, a, b]) => `${n}: 本体${a} vs プラグイン${b}`).join(' / ')
      : pairs.map(([n, a]) => `${n}${a}`).join(' / '),
    action: 'node tools/build-plugin-data.mjs を実行してください'
  });
}

/* ================================================================== */
/* C2. ルール分離（改善候補が正式ルールへ混入していないか）              */
/* ================================================================== */

const CAT2 = 'ルール分離';

if (DATA) {
  record({
    id: 'C2-01', category: CAT2, severity: 'blocker',
    name: '正式チェック18項目に改善候補が混ざっていない',
    pass: DATA.checklist.length === 18 && DATA.checklist.every((c) => c.ruleType !== 'improvement'),
    detail: `正式${DATA.checklist.length}項目 / improvement混入 ${DATA.checklist.filter((c) => c.ruleType === 'improvement').length}件`,
    action: 'manual-data.js の checklist から improvement を除いてください'
  });

  record({
    id: 'C2-02', category: CAT2, severity: 'blocker',
    name: '改善候補が別配列で保持されている',
    pass: Array.isArray(DATA.checklistImprovements)
      && DATA.checklistImprovements.length === 12
      && DATA.checklistImprovements.every((c) => c.ruleType === 'improvement'),
    detail: `改善候補${DATA.checklistImprovements?.length ?? 0}項目`,
    action: 'checklistImprovements を正式チェックと分けて保持してください'
  });

  const validTypes = ['official', 'project', 'conflict', 'improvement'];
  const badLedger = DATA.ledger.filter((l) =>
    !validTypes.includes(l.ruleType) || l.sections.some((s) => !validTypes.includes(s.ruleType)));
  record({
    id: 'C2-03', category: CAT2, severity: 'blocker',
    name: '全台帳セクションのルール種別が定義済み4種のいずれか',
    pass: badLedger.length === 0,
    detail: badLedger.length ? badLedger.map((l) => l.title).join(', ') : '27項目すべて適正',
    action: 'ruleType を official / project / conflict / improvement のいずれかにしてください'
  });
}

/* プラグイン側でも分離されているか */
if (snapshot) {
  record({
    id: 'C2-04', category: CAT2, severity: 'blocker',
    name: 'プラグインでも改善候補が正式と分離されている',
    pass: snapshot.checklist.every((c) => c.ruleType !== 'improvement')
      && snapshot.checklistImprovements.every((c) => c.ruleType === 'improvement'),
    detail: `正式${snapshot.checklist.length} / 改善候補${snapshot.checklistImprovements.length}`,
    action: 'tools/build-plugin-data.mjs の出力を確認してください'
  });
}

const appJs = read('uxp-plugin/app.js');
record({
  id: 'C2-05', category: CAT2, severity: 'blocker',
  name: 'プラグインUIが改善候補を「正式ではない」と明示している',
  pass: !!appJs && appJs.includes('正式チェックではありません'),
  detail: appJs ? '明示あり' : 'app.js が読めません',
  action: 'app.js の提出前タブに改善候補の注意書きを入れてください'
});

/* ================================================================== */
/* C3. 情報の正確性（URLを推測していないか）                            */
/* ================================================================== */

const CAT3 = '情報の正確性';

function urlsIn(text) {
  return text ? (text.match(/https?:\/\/[^\s")\]'<>]+/g) || []) : [];
}

for (const [id, path, label] of [
  ['C3-01', 'agents/knowledge/common-manual.md', '共通マニュアル知識ベース'],
  ['C3-02', 'uxp-plugin/data/manual-snapshot.js', 'UXPプラグインのデータ']
]) {
  const text = read(path);
  const found = urlsIn(text);
  record({
    id, category: CAT3, severity: 'blocker',
    name: `${label} にURLが混入していない`,
    pass: found.length === 0,
    detail: found.length ? `検出: ${found.slice(0, 3).join(', ')}` : 'URL 0件',
    action: '欠損しているURLを推測して補わないでください'
  });
}

if (DATA) {
  record({
    id: 'C3-03', category: CAT3, severity: 'blocker',
    name: '欠損リンク5件が「参照先欠損」として登録されている',
    pass: DATA.audit.missingLinks.length === 5
      && /推測しないでください/.test(DATA.audit.missingLinkPolicy),
    detail: `欠損${DATA.audit.missingLinks.length}件 / 方針: ${DATA.audit.missingLinkPolicy}`,
    action: '欠損リンクと推測禁止方針を維持してください'
  });
}

/* ================================================================== */
/* C4. 検証スイート                                                    */
/* ================================================================== */

const CAT4 = '検証スイート';

function runSuite(id, name, script, expectPattern) {
  /*
   * 子プロセスへ「監査の中で動いている」ことを伝える。
   * これがないと test-mcp -> governance_audit -> test-mcp の無限再帰になる。
   */
  const out = safe(() => execFileSync(process.execPath, [resolve(ROOT, script)], {
    cwd: ROOT, stdio: 'pipe', encoding: 'utf8',
    env: { ...process.env, VM_GOVERNANCE_DEPTH: String(Number(process.env.VM_GOVERNANCE_DEPTH || 0) + 1) }
  }), null);

  if (out === null) {
    record({
      id, category: CAT4, severity: 'blocker', name,
      pass: false, detail: '異常終了しました',
      action: `node ${script} を実行して失敗内容を確認してください`
    });
    return;
  }
  const m = expectPattern.exec(out);
  const failed = m ? Number(m[1]) : -1;
  record({
    id, category: CAT4, severity: 'blocker', name,
    pass: failed === 0,
    detail: failed === 0 ? '全項目合格' : `失敗 ${failed === -1 ? '不明' : failed}件`,
    action: `node ${script} を実行して失敗内容を確認してください`
  });
}

runSuite('C4-01', 'データ検証（validate-data.js）',
  'video-manual-visualizer/validate-data.js', /失敗:\s*(\d+)\s*件/);
runSuite('C4-02', 'MCP疎通テスト（test-mcp.mjs）',
  'agents/test-mcp.mjs', /失敗:\s*(\d+)\s*件/);

/* JS構文チェック */
const jsFiles = [
  'video-manual-visualizer/manual-data.js',
  'video-manual-visualizer/app.js',
  'video-manual-visualizer/validate-data.js',
  'agents/mcp-server.mjs',
  'agents/build-knowledge.mjs',
  'agents/generate-project-agent.mjs',
  'agents/dashboard.mjs',
  'agents/test-mcp.mjs',
  'tools/build-plugin-data.mjs',
  'uxp-plugin/telop.js'
];
const badSyntax = jsFiles.filter((f) => {
  if (!existsSync(resolve(ROOT, f))) return true;
  return !safe(() => {
    execFileSync(process.execPath, ['--check', resolve(ROOT, f)], { cwd: ROOT, stdio: 'pipe' });
    return true;
  }, false);
});
record({
  id: 'C4-03', category: CAT4, severity: 'blocker',
  name: `主要JSファイル${jsFiles.length}件の構文が正しい`,
  pass: badSyntax.length === 0,
  detail: badSyntax.length ? badSyntax.join(', ') : '全ファイル構文OK',
  action: 'node --check <file> でエラーを確認してください'
});

/* ================================================================== */
/* C5. エージェント登録                                                */
/* ================================================================== */

const CAT5 = 'エージェント登録';

const AGENT_DIR = resolve(ROOT, '.claude/agents');

/* CTO は制作チームの外。それ以外は制作チームのメンバー。 */
const EXPECTED_AGENTS = [
  ['cto', 'CTO'],
  ['director', 'ディレクター（制作チーム）'],
  ['common-manual', '共通マニュアル（制作チーム）'],
  ['project-manual', '案件別マニュアル（制作チーム）']
];
const TEAM_MEMBERS = ['director', 'common-manual', 'project-manual'];

for (const [i, [file, label]] of EXPECTED_AGENTS.entries()) {
  const p = resolve(AGENT_DIR, `${file}.md`);
  const text = existsSync(p) ? readFileSync(p, 'utf8') : null;
  const hasFm = text && /^---\n[\s\S]*?name:\s*\S+[\s\S]*?description:\s*\S+[\s\S]*?\n---/m.test(text);
  record({
    id: `C5-0${i + 1}`, category: CAT5, severity: 'blocker',
    name: `${label} が登録されている`,
    pass: !!hasFm,
    detail: text ? (hasFm ? `${(text.length / 1024).toFixed(1)}KB` : 'フロントマターが不正') : '未登録',
    action: `.claude/agents/${file}.md を作成してください`
  });
}

/* 制作チームのメンバーが連携方法を持っているか */
const noTeamDoc = TEAM_MEMBERS.filter((f) => {
  const t = read(`.claude/agents/${f}.md`);
  return !t || !t.includes('制作チームとの連携');
});
record({
  id: 'C5-05', category: CAT5, severity: 'blocker',
  name: '制作チーム全員に連携の指示がある',
  pass: noTeamDoc.length === 0,
  detail: noTeamDoc.length ? `不足: ${noTeamDoc.join(', ')}` : `${TEAM_MEMBERS.length}名すべてに記載あり`,
  action: '各エージェント定義へ「制作チームとの連携」を追加してください'
});

/* CTO が制作チームの外から監査する立場になっているか */
const ctoText = read('.claude/agents/cto.md');
record({
  id: 'C5-06', category: CAT5, severity: 'blocker',
  name: 'CTOが制作チームを統括する立場として定義されている',
  pass: !!ctoText && ctoText.includes('制作チーム') && ctoText.includes('governance.mjs'),
  detail: ctoText ? 'CTO / 制作チームの区別あり' : 'cto.md が読めません',
  action: 'cto.md に制作チームの統括と監査手順を明記してください'
});

/* MCPサーバーのツール数 */
const mcpSrc = read('agents/mcp-server.mjs');
const toolCount = mcpSrc ? (mcpSrc.match(/^\s{4}name:\s*'/gm) || []).length : 0;
record({
  id: 'C5-07', category: CAT5, severity: 'warn',
  name: 'MCPサーバーが13ツール以上を提供している',
  pass: toolCount >= 13,
  detail: `${toolCount}ツール`,
  action: 'agents/mcp-server.mjs の TOOLS を確認してください'
});

record({
  id: 'C5-08', category: CAT5, severity: 'blocker',
  name: 'Claude Code / Codex 両方の接続設定がある',
  pass: !!read('.mcp.json') && !!read('agents/codex-config.toml') && !!read('AGENTS.md'),
  detail: [
    read('.mcp.json') ? '.mcp.json ✓' : '.mcp.json ✗',
    read('agents/codex-config.toml') ? 'codex-config.toml ✓' : 'codex-config.toml ✗',
    read('AGENTS.md') ? 'AGENTS.md ✓' : 'AGENTS.md ✗'
  ].join(' / '),
  action: '不足している設定ファイルを作成してください'
});

/* ================================================================== */
/* C6. 未解決事項の追跡                                                */
/* ================================================================== */

const CAT6 = '未解決事項';

if (DATA) {
  /* 矛盾は「解決されていないこと」ではなく「表示されていること」を検査する */
  const conflictBlob = JSON.stringify(DATA.audit.conflicts);
  record({
    id: 'C6-01', category: CAT6, severity: 'blocker',
    name: '演出頻度の矛盾（6秒/10秒）が未決定として表示されている',
    pass: /6秒に1回/.test(conflictBlob) && /10秒に1回/.test(conflictBlob) && /未決定/.test(conflictBlob),
    detail: '独断で統一していない',
    action: '矛盾を勝手に解決せず、両方を提示してください'
  });

  record({
    id: 'C6-02', category: CAT6, severity: 'blocker',
    name: '提出方法の矛盾（Frame.io/限定公開）が4箇所すべて列挙されている',
    pass: DATA.audit.conflicts.some((c) => c.title.includes('提出方法') && c.points.length === 4),
    detail: '独断で統一していない',
    action: '4箇所すべてを列挙してください'
  });

  record({
    id: 'C6-03', category: CAT6, severity: 'info',
    name: '未解決事項の件数',
    pass: true,
    detail: `矛盾${DATA.audit.conflicts.length}件 / 目次問題${DATA.audit.tocIssues.length}件 / `
      + `欠損リンク${DATA.audit.missingLinks.length}件 / 要確認${DATA.audit.needsConfirmation.length}件`,
    action: 'ディレクター判断が必要です'
  });
}

/* 案件マニュアルの未確定 */
const PROJECTS_DIR = resolve(ROOT, 'agents/knowledge/projects');
const projects = existsSync(PROJECTS_DIR)
  ? readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')
  : [];
const pendingByProject = projects.map((f) => {
  const md = readFileSync(resolve(PROJECTS_DIR, f), 'utf8');
  return { id: basename(f, '.md'), pending: (md.match(/確認が必要|未記入/g) || []).length };
});
const totalPending = pendingByProject.reduce((n, p) => n + p.pending, 0);

record({
  id: 'C6-04', category: CAT6, severity: 'warn',
  name: '案件マニュアルの未確定項目が残っていない',
  pass: projects.length === 0 || totalPending === 0,
  detail: projects.length === 0
    ? '登録案件なし'
    : pendingByProject.map((p) => `${p.id}: ${p.pending}件`).join(' / '),
  action: '生成された案件マニュアルの「確認が必要」を人が確定させてください'
});

/* ================================================================== */
/* C7. 成果物の完全性                                                  */
/* ================================================================== */

const CAT7 = '成果物';

const DELIVERABLES = [
  ['C7-01', 'video-manual-visualizer/index.html', 'ビジュアライザー'],
  ['C7-02', 'agents/mcp-server.mjs', 'MCPサーバー'],
  ['C7-03', 'agents/dashboard.mjs', 'ドット絵ダッシュボード'],
  ['C7-04', 'uxp-plugin/manifest.json', 'UXPプラグイン'],
  ['C7-05', 'uxp-plugin/adapter.js', 'Premiereアダプター'],
  ['C7-06', 'uxp-plugin/telop.js', 'テロップ整形モジュール']
];
for (const [id, path, label] of DELIVERABLES) {
  record({
    id, category: CAT7, severity: 'blocker',
    name: `${label} が存在する`,
    pass: existsSync(resolve(ROOT, path)),
    detail: path,
    action: `${path} を作成してください`
  });
}

/* Premiere API の未検証を隠していないか */
const adapterSrc = read('uxp-plugin/adapter.js');
record({
  id: 'C7-07', category: CAT7, severity: 'blocker',
  name: 'Premiere API が未検証であることを明示している',
  pass: !!adapterSrc && adapterSrc.includes('未検証'),
  detail: adapterSrc ? '明示あり' : 'adapter.js が読めません',
  action: '実機未検証であることを隠さず明記してください'
});

/* README の有無 */
const readmes = ['video-manual-visualizer/README.md', 'agents/README.md', 'uxp-plugin/README.md'];
const missingReadme = readmes.filter((r) => !existsSync(resolve(ROOT, r)));
record({
  id: 'C7-08', category: CAT7, severity: 'warn',
  name: '各モジュールにREADMEがある',
  pass: missingReadme.length === 0,
  detail: missingReadme.length ? `不足: ${missingReadme.join(', ')}` : `${readmes.length}件すべてあり`,
  action: '不足しているREADMEを作成してください'
});

/* ================================================================== */
/* 判定                                                               */
/* ================================================================== */

const failed = checks.filter((c) => !c.pass);
const blockers = failed.filter((c) => c.severity === 'blocker');
const warns = failed.filter((c) => c.severity === 'warn');
const verdict = blockers.length === 0 ? 'GO' : 'NO-GO';

const result = {
  verdict,
  checkedAt: new Date().toISOString(),
  total: checks.length,
  passed: checks.length - failed.length,
  blockers: blockers.length,
  warnings: warns.length,
  checks
};

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(blockers.length ? 1 : 0);
}

/* ------------------------------------------------------------------ */

const C = process.stdout.isTTY;
const g = (s) => (C ? `\x1b[32m${s}\x1b[0m` : s);
const r = (s) => (C ? `\x1b[31m${s}\x1b[0m` : s);
const y = (s) => (C ? `\x1b[33m${s}\x1b[0m` : s);
const d = (s) => (C ? `\x1b[2m${s}\x1b[0m` : s);
const b = (s) => (C ? `\x1b[1m${s}\x1b[0m` : s);

console.log('');
console.log(b('  ガバナンス監査 — CTOエージェント'));
console.log(d(`  ${result.checkedAt.slice(0, 19).replace('T', ' ')}`));
console.log('');

let lastCat = '';
for (const c of checks) {
  if (QUIET && c.pass) continue;
  if (c.category !== lastCat) {
    console.log('');
    console.log(d(`  ── ${c.category} ` + '─'.repeat(Math.max(0, 56 - c.category.length))));
    lastCat = c.category;
  }
  const mark = c.pass ? g('PASS') : (c.severity === 'blocker' ? r('BLOCK') : y('WARN '));
  console.log(`  ${mark}  ${c.id}  ${c.name}`);
  if (c.detail) console.log(d(`               ${c.detail}`));
  if (!c.pass && c.action) console.log(y(`               → ${c.action}`));
}

console.log('');
console.log(d('  ' + '═'.repeat(62)));
console.log('');
console.log(`  検査 ${result.total} 件   ${g(`合格 ${result.passed}`)}   `
  + `${blockers.length ? r(`ブロッカー ${blockers.length}`) : `ブロッカー 0`}   `
  + `${warns.length ? y(`警告 ${warns.length}`) : `警告 0`}`);
console.log('');
console.log(`  判定: ${verdict === 'GO' ? g(b('GO — 出荷可')) : r(b('NO-GO — 出荷不可'))}`);

if (blockers.length) {
  console.log('');
  console.log(r('  解消すべきブロッカー:'));
  for (const c of blockers) console.log(r(`    - ${c.id} ${c.name}`));
  console.log('');
  console.log(y('  対応:'));
  for (const c of blockers) console.log(y(`    - ${c.action}`));
}

if (warns.length && !blockers.length) {
  console.log('');
  console.log(y('  警告（出荷は可能だが対応推奨）:'));
  for (const c of warns) console.log(y(`    - ${c.id} ${c.name}: ${c.detail}`));
}

console.log('');
process.exit(blockers.length ? 1 : 0);
