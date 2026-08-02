#!/usr/bin/env node
/*
 * build-brief.mjs
 *
 * 他のAIへ渡す引き継ぎ資料を1枚のMarkdownで生成する。
 *
 * === なぜ必要か ===
 *
 * ブラウザ用の共有リンクは、人は開けるがAIは開けない（ログインが要る）。
 * 別のAIへENGULFの体制とルールを渡すには、貼り付けられる文章が要る。
 *
 * 手で書くと必ず古くなる。役割は .claude/agents/*.md、数値と工程は
 * manual-data.js にあるので、そこから生成する。
 *
 * === 何を入れて、何を入れないか ===
 *
 * 入れる: 体制・役割・絶対ルール・数値基準・未決定の矛盾・13工程
 * 入れない: URL（原本で5件欠損しており推測を禁じている）
 *           取引先の実名（--public のとき伏せる）
 *           案件マニュアルの中身（クライアント情報のため）
 *
 * === 使い方 ===
 *
 *   node tools/build-brief.mjs                → dist/engulf-brief.md
 *   node tools/build-brief.mjs --public       → 取引先名を伏せる
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const D = require(join(ROOT, 'video-manual-visualizer/manual-data.js'));
const O = require(join(ROOT, 'video-manual-visualizer/office-data.js'));

const REDACTIONS = [
  { from: /株式会社ヒルウラ/g, to: 'クライアントA社' },
  { from: /ヒルウラ/g, to: 'クライアントA' }
];

const PII = [
  { name: 'メールアドレス', re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/ },
  { name: 'URL', re: /https?:\/\// },
  { name: 'APIキー', re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { name: '18桁以上の数値ID', re: /\b\d{18,}\b/ }
];

const TEAM_ORDER = ['audit', 'claude', 'codex', 'sales', 'infra'];

/* 実在するファイルだけを載せる。手で書くと消えたファイルが残る。 */
const TREE_DIRS = ['agents', 'tools', 'uxp-plugin', 'video-manual-visualizer', '.claude/agents'];

function scanTree() {
  const out = [];
  for (const dir of TREE_DIRS) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) continue;
    out.push(dir + '/');
    const names = readdirSync(full)
      .filter((n) => !n.startsWith('.') && statSync(join(full, n)).isFile())
      .filter((n) => /\.(mjs|js|md|json|toml)$/.test(n))
      .sort();
    for (const n of names) out.push('  ' + n);
    /* 生成物の入るサブディレクトリは名前だけ示す（中身は環境依存） */
    const subs = readdirSync(full)
      .filter((n) => !n.startsWith('.') && statSync(join(full, n)).isDirectory())
      .sort();
    for (const sd of subs) out.push('  ' + sd + '/');
  }
  return out;
}

function build() {
  const L = [];
  const co = O.company;

  L.push(`# ${co.name}（${co.reading}） 引き継ぎ資料`);
  L.push('');
  L.push('> このファイルは他のAIへ渡すためのものです。');
  L.push('> 全部読んでから作業してください。**推測で補わないこと**が最優先のルールです。');
  L.push('');

  /* --- 1. 何をしている会社か --- */
  L.push('## 1. これは何か');
  L.push('');
  L.push(`**${co.name}** は動画編集を行う組織です。プロジェクト名は **${co.project}**。`);
  L.push('');
  L.push(`> ${co.mission}`);
  L.push('');
  L.push('動画編集の共通マニュアルを機械可読にし、複数のAIが**同じ根拠**を参照して');
  L.push('作業できるようにしています。片方だけが知っているルールを作らないことが構造上の要です。');
  L.push('');

  /* --- 2. 体制 --- */
  L.push('## 2. 体制');
  L.push('');
  L.push(`在籍 ${O.agents.length}名（設備を含む）。4部門。`);
  L.push('');
  for (const key of TEAM_ORDER) {
    const team = O.teams[key];
    if (!team) continue;
    const members = O.agents.filter((a) => a.team === key);
    if (!members.length) continue;
    L.push(`### ${team.label}`);
    L.push('');
    L.push('| 役割 | 担当 | 実行環境 |');
    L.push('|---|---|---|');
    for (const a of members) {
      const d = (a.description || '').split('。')[0] + '。';
      L.push(`| \`${a.id}\` | ${d} | ${a.runtime} |`);
    }
    L.push('');
  }
  L.push('**担当外の判断を自分で決めないでください。** 担当へ渡すときは');
  L.push('「何を・なぜ・どの根拠で」を必ず明示します。');
  L.push('');

  /* --- 3. 絶対ルール --- */
  L.push('## 3. 絶対に守ること');
  L.push('');
  L.push('1. **知識ベースにないことを推測で補わない。** 記載がなければ「マニュアルに記載がありません」と明示する。');
  L.push('2. **URLを推測しない。** 原本で5件のURLが欠損している。それらしいURLを生成してはいけない。');
  L.push('3. **数字・単位・条件を変更しない。** `-6.0dB` を「約-6dB」に丸めない。`15〜18文字` を「16文字」にしない。');
  L.push(`4. **改善候補を正式ルールとして出さない。** 提出前チェックの正式項目は${D.checklist.length}個。` +
    `改善候補${D.checklistImprovements.length}件は正式ではない。指摘するときは必ず \`[改善候補]\` と明示する。`);
  L.push('5. **矛盾を勝手に解決しない。** 未決定のものは両方を提示して確認を促す（次章）。');
  L.push('6. **文字起こしの文章を綺麗に書き換えない。** 話し言葉はそのまま残す（「回してます」を「回しています」に直さない）。');
  L.push('7. **案件独自ルールが共通マニュアルより優先。** 順位は クライアント指定 → 案件マニュアル → チャンネル独自 → 共通マニュアル → 改善候補（適用しない）。');
  L.push('8. **トンマナを勝手に変えない。** チャンネルテンプレートのフォント・色・配置を変更しない。');
  L.push('');

  /* --- 4. 未決定 --- */
  const conflicts = (D.audit && D.audit.conflicts) || [];
  L.push('## 4. 未決定の矛盾（勝手に決めないこと）');
  L.push('');
  L.push(`原本の中で ${conflicts.length}件 の矛盾が未解決のままです。**どちらかへ寄せてはいけません。**`);
  L.push('');
  /*
   * 両論（points）を必ず出す。ここが空だと、読んだAIは
   * 「矛盾が5件ある」ことしか分からず、どちらの記載も知らないまま作業する。
   * 未決定を保持するには、両方の記載そのものが渡っていなければならない。
   */
  for (const c of conflicts) {
    L.push(`### ${c.title || c.id}`);
    L.push('');
    for (const pt of (c.points || [])) L.push(`- ${pt}`);
    if (!(c.points || []).length) L.push('- （原本に併記された記載を読み取れませんでした）');
    L.push('');
    if (c.status) L.push(`**状態**: ${c.status}`);
    if (c.action) L.push(`**対処**: ${c.action}`);
    L.push('');
  }
  L.push('確定できるのはディレクター（演出頻度・提出方法）と経営者だけです。');
  L.push('**未決定が残っていること自体を、作業を止める理由にしないでください。**');
  L.push('両方を提示したまま進め、確定が要る箇所だけ担当へ渡します。');
  L.push('');

  /* --- 5. 制作工程 --- */
  L.push('## 5. 制作工程');
  L.push('');
  L.push('| 工程 | 内容 | 結論 |');
  L.push('|---:|---|---|');
  for (const p of D.processes) {
    const mark = p.ruleType === 'conflict' ? ' ⚠' : '';
    L.push(`| ${p.no}${mark} | ${p.title} | ${p.summary.replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('⚠ の工程には未決定の矛盾が含まれます。');
  L.push('');

  /* --- 6. 数値基準 --- */
  const total = D.numericStandards.reduce((n, g) => n + g.items.length, 0);
  L.push('## 6. 数値基準');
  L.push('');
  L.push(`${total}件。**すべて変更禁止です。**`);
  L.push('');
  for (const g of D.numericStandards) {
    L.push(`**${g.group}**`);
    L.push('');
    L.push('| 項目 | 基準値 | 補足 |');
    L.push('|---|---|---|');
    for (const it of g.items) {
      L.push(`| ${it.name} | ${it.value}${it.unit ? ' ' + it.unit : ''} | ${(it.note || '').replace(/\|/g, '\\|')} |`);
    }
    L.push('');
  }

  /* --- 7. 品質評価 --- */
  if (D.qualityLevels && D.qualityLevels.length) {
    L.push('## 7. 品質評価レベル');
    L.push('');
    L.push('| 点 | 内容 |');
    L.push('|---|---|');
    for (const q of D.qualityLevels) {
      L.push(`| ${q.score != null ? q.score : ''} | ${(q.label || q.name || '')}${q.detail ? ' — ' + q.detail : ''} |`);
    }
    L.push('');
  }

  /* --- 8. バックエンド構成 --- */
  L.push('## 8. バックエンド構成');
  L.push('');
  L.push('### 単一情報源');
  L.push('');
  L.push('**すべてのデータは `video-manual-visualizer/manual-data.js` の1箇所から出ます。**');
  L.push('生成物を手で編集してはいけません。次回の生成で消えます。');
  L.push('');
  L.push('```');
  L.push('manual-data.js  ★唯一の情報源');
  L.push('  ├─ agents/build-knowledge.mjs   → agents/knowledge/common-manual.md');
  L.push('  ├─ tools/build-plugin-data.mjs  → uxp-plugin/data/manual-snapshot.js');
  L.push('  ├─ agents/mcp-server.mjs        → MCPツール（16個）');
  L.push('  └─ tools/build-webapp.mjs       → dist/index.html（1ファイル配布版）');
  L.push('');
  L.push('.claude/agents/*.md  ★役割定義の唯一の情報源');
  L.push('  ├─ Claude Code : サブエージェントとして直接読む');
  L.push('  ├─ Codex       : MCP の get_agent_role で受け取る');
  L.push('  └─ tools/build-office-data.mjs → video-manual-visualizer/office-data.js');
  L.push('```');
  L.push('');
  L.push('**定義のコピーを作らないでください。** 片方だけが古くなり、判断が食い違います。');
  L.push('監査 C5-13 と C5-17 がこれを検査しています。');
  L.push('');

  L.push('### ディレクトリ構成');
  L.push('');
  L.push('```');
  for (const line of scanTree()) L.push(line);
  L.push('```');
  L.push('');

  L.push('### 主要モジュールの責務');
  L.push('');
  L.push('| ファイル | 責務 | 依存 |');
  L.push('|---|---|---|');
  L.push('| `agents/mcp-server.mjs` | MCPサーバー（stdio / JSON-RPC 2.0）。16ツール | 外部依存なし |');
  L.push('| `agents/governance.mjs` | 全体監査。GO / NO-GO を返す | 各テストを子プロセスで実行 |');
  L.push('| `agents/console.mjs` | 対話コンソール。MCPクライアント | mcp-server |');
  L.push('| `agents/sprites.mjs` | ドット絵とパレット。**色の唯一の定義元** | なし |');
  L.push('| `uxp-plugin/timecode.js` | フレーム計算。**フレームずれ防止の中核** | なし |');
  L.push('| `uxp-plugin/telop.js` | 文字起こし → テロップ整形 | なし |');
  L.push('| `tools/segment-kit.mjs` | 尺単位の制作キット（工程4〜7を一括） | telop + timecode |');
  L.push('| `video-manual-visualizer/office.js` | 等角投影の描画 | なし |');
  L.push('');
  L.push('すべて **外部依存ゼロ**（Node.js 18以降のみ）。npm install は不要です。');
  L.push('');

  L.push('### フレーム計算（ここが一番壊してはいけない）');
  L.push('');
  L.push('SRTのタイムコードは実時間の秒だが、Premiereはフレームでしか位置を持てない。');
  L.push('秒のまま渡すと丸めがどう行われるか分からず、1フレームずれる。');
  L.push('**品質評価では、フレームずれ5箇所以上で-5点**になる。');
  L.push('');
  L.push('```js');
  L.push('// 29.97fps は 30000/1001 で厳密に扱う（29.97 と書くとずれる）');
  L.push("const RATES = { '29.97': { exact: 30000 / 1001, nominal: 30, drop: true } };");
  L.push('');
  L.push('// 秒 → フレームは四捨五入。切り捨てると必ず前へずれる');
  L.push('function secondsToFrames(seconds, rate) {');
  L.push('  return Math.max(0, Math.round(seconds * rate.exact));');
  L.push('}');
  L.push('```');
  L.push('');
  L.push('**同時発話の扱い**: 発言が重なったとき、前のテロップを削って重なりを消してはいけない。');
  L.push('発言が終わる前にテロップが消えるため。重なった側を上のトラックへ逃がす（レイヤー割り当て）。');
  L.push('ただし前倒し（子音の1フレーム前）で生じた1フレームの重なりは、');
  L.push('同時発話ではないので前を詰める。この2つを取り違えると事故になる。');
  L.push('');

  L.push('### 検証と出荷判定');
  L.push('');
  L.push('```bash');
  L.push('node video-manual-visualizer/validate-data.js   # データ検証');
  L.push('node agents/test-mcp.mjs                        # MCP疎通');
  L.push('node agents/test-console.mjs                    # コンソール');
  L.push('node tools/test-timecode.mjs                    # フレーム計算');
  L.push('node agents/governance.mjs                      # 全体監査（GO / NO-GO）');
  L.push('```');
  L.push('');
  L.push('**リリース前は必ず `governance.mjs` を実行してください。**');
  L.push('ブロッカーが1件でもあれば NO-GO です。印象で「問題ありません」と判断してはいけません。');
  L.push('監査は上記のテストを子プロセスとして実行するため、これ1本で全部通ります。');
  L.push('');

  L.push('### 設計上の制約（変えるときは理由を確認すること）');
  L.push('');
  L.push('| 制約 | 理由 |');
  L.push('|---|---|');
  L.push('| 知識ベースにURLを一切含めない | 原本で5件のURLが欠損しており、推測での補完を禁じているため。生成時に混入チェックあり |');
  L.push('| 改善候補を別配列で保持 | 正式項目へ混ざるのを防ぐ |');
  L.push('| 矛盾を解決しない | 演出頻度と提出方法は未決定。両方を提示する |');
  L.push('| 案件の数値を自動確定しない | 誤検出のまま運用に入るのを防ぐ |');
  L.push('| 案件マニュアルをGitへ入れない | クライアント情報を含むため（.gitignore で除外） |');
  L.push('| UXPプラグインはESモジュール不可 | Premiere の UXP が対応していない。UMD形式で書く |');
  L.push('| ブラウザからMCPへ直接繋がない | stdio のため。画面に映るのはページ自身の処理だけ |');
  L.push('');

  /* --- 9. 接続 --- */
  L.push('## 9. この仕組みへ接続する');
  L.push('');
  L.push('ENGULF の根拠はすべて MCP サーバー経由で引けます。');
  L.push('リポジトリを取得して、次を設定してください。');
  L.push('');
  L.push('```toml');
  L.push('[mcp_servers.video-manual]');
  L.push('command = "node"');
  L.push('args = ["<リポジトリの絶対パス>/agents/mcp-server.mjs"]');
  L.push('```');
  L.push('');
  L.push('主なツール:');
  L.push('');
  L.push('| ツール | 用途 |');
  L.push('|---|---|');
  L.push('| `manual_search` | 全文検索。**まずこれを使う** |');
  L.push('| `get_process` | 工程の詳細 |');
  L.push('| `get_numeric_standards` | 数値基準 |');
  L.push('| `check_notation` | 表記揺れ辞書との照合 |');
  L.push('| `get_checklist` | 提出前チェック / 改善候補 |');
  L.push('| `list_conflicts` | 未決定の矛盾 |');
  L.push('| `get_design_rules` | 図解・画像の制約。**生成前に必須** |');
  L.push('| `list_agents` / `get_agent_role` | 役割の一覧と定義 |');
  L.push('| `handoff` | 担当外の判断を渡す |');
  L.push('');
  L.push('接続できない場合は、リポジトリの `AGENTS.md` を読んでください。');
  L.push('ルールはそこに集約されています。');
  L.push('');

  /* --- 9. 依頼するときの注意 --- */
  L.push('## 10. あなたに期待すること');
  L.push('');
  L.push('- 根拠を引いてから答える。記憶や一般論で答えない');
  L.push('- 分からないことは「マニュアルに記載がありません」と書く。埋めない');
  L.push('- 数値はそのまま写す。丸めない・言い換えない');
  L.push('- できないことを「できた」と書かない');
  L.push('- 担当外の判断は、担当へ渡す形で返す');
  L.push('');
  L.push('---');
  L.push('');
  L.push(`生成: \`node tools/build-brief.mjs\`　情報源: manual-data.js + .claude/agents/*.md`);
  L.push('');

  return L.join('\n');
}

/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const isPublic = args.includes('--public');
const out = args.filter((a) => !a.startsWith('--'))[0] || join(ROOT, 'dist/engulf-brief.md');

let text = build();
if (isPublic) {
  for (const r of REDACTIONS) text = text.replace(r.from, r.to);
}

/* 出してはいけないものが残っていないか検査する。
   共有は取り消せないので、目視ではなく検査で止める。 */
const leaks = [];
if (isPublic) {
  for (const r of REDACTIONS) {
    const m = text.match(r.from);
    if (m) leaks.push(`伏せ字が残っています: ${m[0]}`);
  }
}
for (const p of PII) {
  const m = text.match(p.re);
  if (m) leaks.push(`${p.name}: ${m[0]}`);
}
if (leaks.length) {
  console.error('引き継ぎ資料に出してはいけないものが含まれています:');
  for (const l of leaks) console.error('  ' + l);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text, 'utf8');

const chars = [...text].length;
console.log(`共有用      : ${isPublic ? 'はい（取引先名を伏せた）' : 'いいえ（社内用）'}`);
console.log(`URL混入     : なし`);
console.log(`個人情報    : なし`);
console.log(`分量        : ${chars.toLocaleString()}文字 / 約${Math.ceil(chars / 1.6 / 1000)}kトークン相当`);
console.log(`出力        : ${out.replace(ROOT + '/', '')}`);
