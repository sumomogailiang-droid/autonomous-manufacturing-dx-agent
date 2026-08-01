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

/*
 * スナップショットはUMD形式なので require で読む。
 * 形式を変えたときに黙ってスキップされないよう、読めない場合はブロッカーにする。
 */
const snapshot = safe(() => require(resolve(ROOT, 'uxp-plugin/data/manual-snapshot.js')));

record({
  id: 'C1-05', category: CAT1, severity: 'blocker',
  name: 'UXPプラグインのデータが読み込める',
  pass: !!snapshot && Array.isArray(snapshot.checklist),
  detail: snapshot ? `提出前チェック${snapshot.checklist?.length ?? '?'}項目` : '読み込み失敗（形式が変わった可能性）',
  action: 'node tools/build-plugin-data.mjs を実行し、出力形式を確認してください'
});

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
  name: 'MCPサーバーが16ツール以上を提供している',
  pass: toolCount >= 16,
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

/*
 * UXPは <script type="module"> に対応していない。
 * ESモジュール構文が混ざるとPremiere内でパネルが真っ白になるため検査する。
 */
const pluginFiles = [
  'uxp-plugin/index.html',
  'uxp-plugin/app.js',
  'uxp-plugin/adapter.js',
  'uxp-plugin/telop.js',
  'uxp-plugin/timecode.js',
  'uxp-plugin/data/manual-snapshot.js'
];
const esmHits = [];
function stripComments(src, isHtml) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');       // ブロックコメント
  out = out.replace(/^\s*\/\/.*$/gm, '');                 // 行コメント
  if (isHtml) out = out.replace(/<!--[\s\S]*?-->/g, '');   // HTMLコメント
  return out;
}

for (const f of pluginFiles) {
  const raw = read(f);
  if (!raw) { esmHits.push(`${f}: 読めません`); continue; }
  /* 説明文での誤検出を避けるため、コメントを除いてから検査する */
  const t = stripComments(raw, f.endsWith('.html'));
  if (/type\s*=\s*["']module["']/.test(t)) esmHits.push(`${f}: type="module"`);
  if (/^\s*export\s+(default|const|function|\{)/m.test(t)) esmHits.push(`${f}: export`);
  if (/^\s*import\s+[\w{*]/m.test(t)) esmHits.push(`${f}: import`);
}
record({
  id: 'C7-09', category: CAT7, severity: 'blocker',
  name: 'UXPプラグインにESモジュール構文が混ざっていない',
  pass: esmHits.length === 0,
  detail: esmHits.length ? esmHits.join(' / ') : `${pluginFiles.length}ファイルすべて古典的スクリプト`,
  action: 'UXPは type="module" / import / export に対応していません。グローバル登録方式にしてください'
});

/*
 * フレーム計算の検証。
 * ここが狂うとテロップが必ずフレームずれするため、出荷ゲートに含める。
 */
const TCU = safe(() => require(resolve(ROOT, 'uxp-plugin/timecode.js')));

record({
  id: 'C7-10', category: CAT7, severity: 'blocker',
  name: 'フレーム計算モジュールが読み込める',
  pass: !!TCU && typeof TCU.snapToFrames === 'function',
  detail: TCU ? 'timecode.js OK' : '読み込み失敗',
  action: 'uxp-plugin/timecode.js を確認してください'
});

if (TCU) {
  /* 29.97DF の既知値。ここが合わないとタイムコード表示が全部ずれる */
  const df = TCU.RATES['29.97'];
  const knownOk =
    TCU.framesToTimecode(1800, df) === '00;01;00;02' &&
    TCU.framesToTimecode(17982, df) === '00;10;00;00' &&
    TCU.framesToTimecode(107892, df) === '01;00;00;00';
  record({
    id: 'C7-11', category: CAT7, severity: 'blocker',
    name: '29.97ドロップフレームの変換が正しい',
    pass: knownOk,
    detail: knownOk ? 'SMPTE既知値と一致' : `1800F→${TCU.framesToTimecode(1800, df)}（期待 00;01;00;02）`,
    action: 'node tools/test-timecode.mjs で詳細を確認してください'
  });

  /* 29.97を30fpsとして計算していないか（1分で約1.8フレームずれる） */
  const oneMin = TCU.secondsToFrames(60, df);
  record({
    id: 'C7-12', category: CAT7, severity: 'blocker',
    name: '29.97fps を30fpsとして計算していない',
    pass: oneMin === 1798,
    detail: `60秒 = ${oneMin}フレーム（30fps計算なら1800）`,
    action: 'timecode.js の secondsToFrames が rate.exact を使っているか確認してください'
  });

  /* 累積ずれが起きないこと */
  const many = [];
  for (let i = 0; i < 500; i++) many.push({ start: i * 2, end: i * 2 + 1.5, text: 'x' });
  const snapped = TCU.snapToFrames(many, { rate: df, leadFrames: 0, minFrames: 1 });
  const expected = TCU.secondsToFrames(499 * 2, df);
  const allInt = snapped.items.every((i) => Number.isInteger(i.inFrame) && Number.isInteger(i.outFrame));
  record({
    id: 'C7-13', category: CAT7, severity: 'blocker',
    name: 'テロップ500件で累積フレームずれが起きない',
    pass: snapped.items[499].inFrame === expected && allInt,
    detail: allInt
      ? `最終項目 ${snapped.items[499].inFrame}（期待 ${expected}）`
      : '整数でないフレーム番号があります',
    action: 'node tools/test-timecode.mjs を実行してください'
  });

  /* 配置検証が重なりを検出できること（検証機能自体の健全性） */
  const bad = [
    { index: 1, inFrame: 0, outFrame: 100 },
    { index: 2, inFrame: 50, outFrame: 150 }
  ];
  record({
    id: 'C7-14', category: CAT7, severity: 'warn',
    name: '配置検証が重なりを検出できる',
    pass: TCU.verifyPlacement(bad).ok === false,
    detail: '重なった入力を不合格と判定',
    action: 'verifyPlacement を確認してください'
  });
}

/*
 * 制作チームの役割が Codex からも使えるか。
 * .claude/agents/*.md を唯一の定義元とし、MCP経由で配る設計になっているか検査する。
 */
const roleDir = resolve(ROOT, '.claude/agents');
const roleFiles = existsSync(roleDir)
  ? readdirSync(roleDir).filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', ''))
  : [];
const REQUIRED_ROLES = ['common-manual', 'project-manual', 'director', 'cto', 'design', 'telop'];
const missingRoles = REQUIRED_ROLES.filter((r) => !roleFiles.includes(r));

record({
  id: 'C5-11', category: CAT5, severity: 'blocker',
  name: '制作チームの役割定義が6体そろっている',
  pass: missingRoles.length === 0,
  detail: missingRoles.length ? `不足: ${missingRoles.join(', ')}` : roleFiles.join(', '),
  action: '.claude/agents/ に不足している役割定義を追加してください'
});

/* mcpSrc は上で読み込んだものを再利用する */
record({
  id: 'C5-12', category: CAT5, severity: 'blocker',
  name: '役割定義がMCP経由でCodexへ配られる',
  pass: /list_agents/.test(mcpSrc) && /get_agent_role/.test(mcpSrc) && /handoff/.test(mcpSrc),
  detail: 'list_agents / get_agent_role / handoff',
  action: 'MCPサーバーに役割共有ツールを追加してください。Codexはサブエージェント機能を持ちません'
});

record({
  id: 'C5-13', category: CAT5, severity: 'blocker',
  name: '役割定義を二重に持っていない',
  pass: /ROLES_DIR = resolve\(ROOT, '\.claude\/agents'\)/.test(mcpSrc),
  detail: 'MCPは .claude/agents を直接読む（コピーを持たない）',
  action: '役割定義のコピーを作らないでください。片方だけが古くなります'
});

/* 全役割に description があるか（Codex側で選ぶ手がかりになる） */
const noDesc = [];
for (const r of roleFiles) {
  const t = read(`.claude/agents/${r}.md`);
  if (!/^description:\s*\S/m.test(t)) noDesc.push(r);
}
record({
  id: 'C5-14', category: CAT5, severity: 'warn',
  name: '全役割に description がある',
  pass: noDesc.length === 0,
  detail: noDesc.length ? `不足: ${noDesc.join(', ')}` : `${roleFiles.length}件すべてあり`,
  action: 'description がないと、どの役割へ渡すか判断できません'
});

/*
 * ブラウザのオフィス画面。
 *
 * office-data.js は .claude/agents から生成した「写し」なので、
 * 役割を足したのに再生成し忘れると、席のない役割が出て画面から消える。
 * 生成物が古いことに気づけないのが一番まずいので、件数で検査する。
 */
const officeSrc = read('video-manual-visualizer/office-data.js');

record({
  id: 'C5-15', category: CAT5, severity: 'blocker',
  name: 'オフィス画面のデータが生成済み',
  pass: officeSrc.length > 0,
  detail: officeSrc.length ? `${officeSrc.length} バイト` : 'office-data.js がありません',
  action: 'node tools/build-office-data.mjs を実行してください'
});

let officeAgents = [];
let officeParseError = '';
if (officeSrc) {
  try {
    officeAgents = require(resolve(ROOT, 'video-manual-visualizer/office-data.js')).agents || [];
  } catch (e) {
    officeParseError = String(e && e.message ? e.message : e);
  }
}

record({
  id: 'C5-16', category: CAT5, severity: 'blocker',
  name: 'オフィス画面のデータを読み取れる',
  pass: officeSrc.length > 0 && !officeParseError,
  detail: officeParseError || `${officeAgents.length}名`,
  action: '読めないと画面が白いまま原因が分かりません。再生成してください'
});

/* 役割ファイル + MCPサーバー（設備）= 席の数。ずれていたら再生成が必要。 */
const expectedSeats = roleFiles.length + 1;
record({
  id: 'C5-17', category: CAT5, severity: 'blocker',
  name: 'オフィスの席が役割定義と一致している',
  pass: officeAgents.length === expectedSeats,
  detail: officeAgents.length === expectedSeats
    ? `役割 ${roleFiles.length}件 + MCP = ${expectedSeats}席`
    : `席 ${officeAgents.length} / 期待 ${expectedSeats}（役割 ${roleFiles.length}件 + MCP）`,
  action: '役割を追加・削除したら node tools/build-office-data.mjs を再実行してください'
});

/* 生成物へURLが混入していないこと（URLの推測を禁止しているため） */
/*
 * 認証情報の混入。
 *
 * Codexチームのセットアップでアカウントを扱うが、
 * メールアドレス・トークン・パスワードがリポジトリへ入ると共有範囲を超える。
 * 手順書に「書かない」と記すだけでは、書かれたことに気づけない。
 */
const SECRET_PATTERNS = [
  { name: 'メールアドレス', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { name: 'OpenAI形式のキー', re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { name: 'Bearerトークン', re: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
  { name: 'password/token の代入', re: /\b(?:password|passwd|api[_-]?key|secret)\s*[:=]\s*["'][^"']{6,}/i }
];

const secretHits = [];
for (const f of [
  'AGENTS.md', 'agents/README.md', 'agents/codex-setup.md', 'agents/codex-config.toml',
  'agents/roadmap-frame-zero.md', 'video-manual-visualizer/office-data.js'
]) {
  const t = read(f);
  if (!t) continue;
  for (const p of SECRET_PATTERNS) {
    const m = t.match(p.re);
    if (m) secretHits.push(`${f}: ${p.name}`);
  }
}

record({
  id: 'C5-19', category: CAT5, severity: 'blocker',
  name: '認証情報・アカウントが混入していない',
  pass: secretHits.length === 0,
  detail: secretHits.length ? secretHits.join(' / ') : '検査対象6ファイルに混入なし',
  action: 'アカウント・鍵はリポジトリへ書かないでください。各自のローカル設定に置きます'
});

record({
  id: 'C5-18', category: CAT5, severity: 'blocker',
  name: 'オフィスデータにURLが混入していない',
  pass: !/https?:\/\//.test(officeSrc),
  detail: /https?:\/\//.test(officeSrc) ? 'URLが含まれています' : '混入なし',
  action: '原本で欠損しているURLがあります。推測で補わないでください'
});

/*
 * ターミナルの可視化と対話インターフェース。
 * ドット絵を二重に持っていないか、動作アニメーションがあるかを検査する。
 */
const spritesSrc = read('agents/sprites.mjs') || '';
const dashSrc = read('agents/dashboard.mjs') || '';
const consoleSrc = read('agents/console.mjs') || '';

record({
  id: 'C6-10', category: CAT6, severity: 'blocker',
  name: '対話コンソールが存在する',
  pass: !!consoleSrc && /createInterface/.test(consoleSrc),
  detail: consoleSrc ? 'agents/console.mjs' : 'なし',
  action: 'ターミナルから質問・指示できる入口が必要です'
});

record({
  id: 'C6-11', category: CAT6, severity: 'blocker',
  name: 'ドット絵を二重に持っていない',
  pass: /from '\.\/sprites\.mjs'/.test(dashSrc) && /from '\.\/sprites\.mjs'/.test(consoleSrc),
  detail: 'ダッシュボードとコンソールが sprites.mjs を参照',
  action: '絵をコピーすると片方だけ古くなります。sprites.mjs から取り込んでください'
});

record({
  id: 'C6-12', category: CAT6, severity: 'blocker',
  name: '全エージェントに idle と work の2フレームがある',
  pass: (() => {
    const names = ['cto', 'director', 'common-manual', 'project-manual', 'design', 'telop', 'mcp'];
    return names.every((n) => new RegExp(`${n.replace('-', '.')}[^\\n]*idle:`).test(spritesSrc)) &&
           (spritesSrc.match(/work:/g) || []).length >= names.length;
  })(),
  detail: `work: の定義 ${(spritesSrc.match(/work:/g) || []).length}件`,
  action: '作業中フレームがないと、どのエージェントが動いているか分かりません'
});

record({
  id: 'C6-13', category: CAT6, severity: 'blocker',
  name: 'コンソールがMCPのクライアントとして動く',
  pass: /mcp-server\.mjs/.test(consoleSrc) && /tools\/call/.test(consoleSrc),
  detail: 'Claude Code / Codex と同じツールを叩く',
  action: 'コンソール独自のロジックを持たせないでください。答えが食い違います'
});

record({
  id: 'C6-14', category: CAT6, severity: 'warn',
  name: 'コンソールが「文章を生成しない」ことを明示している',
  pass: /文章を生成しません/.test(consoleSrc),
  detail: 'LLMを呼ばないことをユーザーへ伝えている',
  action: '生成できると誤解させないでください'
});

record({
  id: 'C6-15', category: CAT6, severity: 'warn',
  name: 'アニメーションを自動再生していない',
  pass: /実際にツールを呼んでいる間だけ/.test(spritesSrc),
  detail: '意味のない点滅を出さない方針',
  action: '常時アニメーションは目障りなだけで情報を持ちません'
});

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

/* ------------------------------------------------------------------ */
/* C0. 監査自体の健全性                                                 */
/* ------------------------------------------------------------------ */

/*
 * 検査IDが重複していると、結果が混ざって見落としが起きる。
 * 実際に C5-07 / C5-08 を二重に使う取りこぼしがあったため、機械的に防ぐ。
 */
const idCounts = {};
for (const c of checks) idCounts[c.id] = (idCounts[c.id] || 0) + 1;
const dupIds = Object.keys(idCounts).filter((k) => idCounts[k] > 1);

record({
  id: 'C0-01', category: 'C0. 監査自体の健全性', severity: 'blocker',
  name: '検査IDが重複していない',
  pass: dupIds.length === 0,
  detail: dupIds.length ? `重複: ${dupIds.join(', ')}` : `${checks.length}件すべて一意`,
  action: '重複したIDを振り直してください'
});

/*
 * ドキュメントに書いた件数が、実態とずれていないか。
 * 数字が古いまま放置されると、読んだ人が誤った前提で動く。
 */
const readmeSrc = read('agents/README.md') || '';
const docToolCount = Number((/MCPツール一覧（(\d+)個）/.exec(readmeSrc) || [])[1] || 0);
record({
  id: 'C0-03', category: 'C0. 監査自体の健全性', severity: 'warn',
  name: 'READMEのツール数が実態と一致している',
  pass: docToolCount === toolCount,
  detail: `README ${docToolCount}個 / 実装 ${toolCount}個`,
  action: 'agents/README.md のツール数を更新してください'
});

/* 全検査に action がある（落ちたときに何をすればよいか分かるように） */
const noAction = checks.filter((c) => !c.action);
record({
  id: 'C0-02', category: 'C0. 監査自体の健全性', severity: 'warn',
  name: '全検査に対処方法が書かれている',
  pass: noAction.length === 0,
  detail: noAction.length ? `不足: ${noAction.map((c) => c.id).join(', ')}` : `${checks.length}件すべてあり`,
  action: '落ちたときに何をすればよいか分からない検査は、直しようがありません'
});

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
