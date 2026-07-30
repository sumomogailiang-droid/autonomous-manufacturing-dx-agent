#!/usr/bin/env node
/*
 * dashboard.mjs
 *
 * エージェント構成をドット絵で可視化するダッシュボード。
 * Claude Code / Codex のターミナル内でそのまま表示できる。
 *
 * 実行:
 *   node agents/dashboard.mjs           ターミナルへドット絵で表示
 *   node agents/dashboard.mjs --html    HTML版を書き出す
 *   node agents/dashboard.mjs --no-color  色なし（ログ保存用）
 *
 * スプライトは 16x16。ターミナルでは上下半分ブロック（▀）を使い、
 * 1文字で縦2ピクセルを描画する。
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PALETTE,
  SPRITES,
  frame,
  renderSprite as renderSpriteRaw,
  paint as paintRaw,
  bold as boldRaw,
  dim as dimRaw
} from './sprites.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = resolve(__dirname, '..');
const DATA = require(resolve(ROOT, 'video-manual-visualizer/manual-data.js'));

const args = process.argv.slice(2);
const WANT_HTML = args.includes('--html');
const WANT_AUDIT = args.includes('--audit');
const NO_COLOR = args.includes('--no-color') || process.env.NO_COLOR;

/* ------------------------------------------------------------------ */
/* ドット絵（agents/sprites.mjs が唯一の定義元）                          */
/* ------------------------------------------------------------------ */

/* スプライトと描画はコンソールと共有する。ここでコピーを持たない。 */
/* 静止フレームを使う。作業中アニメーションはコンソール側の担当。 */
const SPR_CTO = frame('cto');
const SPR_DIRECTOR = frame('director');
const SPR_COMMON = frame('common-manual');
const SPR_PROJECT = frame('project-manual');
const SPR_DESIGN = frame('design');
const SPR_TELOP = frame('telop');
const SPR_MCP = frame('mcp');

const renderSprite = (rows) => renderSpriteRaw(rows, NO_COLOR);
const paint = (hex, s) => paintRaw(hex, s, NO_COLOR);
const bold = (s) => boldRaw(s, NO_COLOR);
const dim = (s) => dimRaw(s, NO_COLOR);


/* ------------------------------------------------------------------ */
/* 状態の収集                                                          */
/* ------------------------------------------------------------------ */

const KNOWLEDGE = resolve(__dirname, 'knowledge/common-manual.md');
const PROJECTS_DIR = resolve(__dirname, 'knowledge/projects');

/* ガバナンス監査を実行して結果を取り込む */
function safeAudit() {
  try {
    const out = execFileSync(process.execPath, [resolve(__dirname, 'governance.mjs'), '--json'], {
      cwd: ROOT, stdio: 'pipe', encoding: 'utf8'
    });
    return JSON.parse(out);
  } catch (e) {
    /* ブロッカーがあると非ゼロ終了するが、stdout にはJSONが出ている */
    try { return JSON.parse(e.stdout || ''); } catch (_) { return null; }
  }
}

function collectState() {
  const knowledgeExists = existsSync(KNOWLEDGE);
  const knowledgeSize = knowledgeExists ? readFileSync(KNOWLEDGE, 'utf8').length : 0;

  let projects = [];
  if (existsSync(PROJECTS_DIR)) {
    projects = readdirSync(PROJECTS_DIR)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => {
        const md = readFileSync(resolve(PROJECTS_DIR, f), 'utf8');
        const name = /^#\s*案件マニュアル:\s*(.+)$/m.exec(md);
        const pending = (md.match(/確認が必要|未記入/g) || []).length;
        return { id: basename(f, '.md'), name: name ? name[1] : basename(f, '.md'), pending };
      });
  }

  /* ガバナンス監査の結果を取り込む（重いので --audit 指定時のみ） */
  let governance = null;
  if (WANT_AUDIT) {
    governance = safeAudit();
  }

  return {
    governance,
    knowledgeExists,
    knowledgeSize,
    projects,
    processes: DATA.processes.length,
    ledger: DATA.ledger.length,
    numeric: DATA.numericStandards.reduce((n, g) => n + g.items.length, 0),
    checklist: DATA.checklist.length,
    improvements: DATA.checklistImprovements.length,
    templates: DATA.templates.length,
    dictionary: DATA.dictionary.length + DATA.splitEditDictionary.length,
    accidents: DATA.accidentMap.length,
    conflicts: DATA.audit.conflicts.length,
    missingLinks: DATA.audit.missingLinks.length,
    needsConfirm: DATA.audit.needsConfirmation.length,
    glossary: DATA.glossary.length
  };
}

/* ------------------------------------------------------------------ */
/* エージェント定義                                                     */
/* ------------------------------------------------------------------ */

function buildAgents(st) {
  const pendingTotal = st.projects.reduce((n, p) => n + p.pending, 0);

  return [
    {
      sprite: SPR_CTO,
      color: '#e8c76a',
      tier: 'CTO',
      name: 'CTO',
      id: 'cto',
      host: 'Claude Code',
      role: '制作チーム統括・出荷可否の判定',
      status: st.governance ? st.governance.verdict : 'UNKNOWN',
      ok: st.governance ? st.governance.verdict === 'GO' : false,
      stats: st.governance
        ? [
            `監査 ${st.governance.total}件 / 合格 ${st.governance.passed}件`,
            `ブロッカー ${st.governance.blockers} / 警告 ${st.governance.warnings}`,
            'node agents/governance.mjs で実行',
            '印象で判断せず監査結果に基づく'
          ]
        : ['未監査', 'node agents/governance.mjs を実行してください']
    },
    {
      sprite: SPR_DIRECTOR,
      color: '#e06b60',
      tier: '制作チーム',
      name: 'ディレクター',
      id: 'director',
      host: 'Claude Code',
      role: 'UXPプラグイン管轄・編集品質と提出可否',
      status: 'READY',
      ok: true,
      stats: [
        '品質評価 -5 / 0 / 3 / 5点で採点',
        '演出頻度と提出方法の決定権を持つ',
        '指摘には必ずTC・行番号を添える',
        '怖がらせず具体的な行動へ変換する'
      ]
    },
    {
      sprite: SPR_COMMON,
      color: '#1d4ed8',
      tier: '制作チーム',
      name: '共通マニュアル',
      id: 'common-manual',
      host: 'Claude Code',
      role: 'ルール判定・素材確認・提出前チェック',
      status: st.knowledgeExists ? 'READY' : 'NO DATA',
      ok: st.knowledgeExists,
      stats: [
        `知識ベース ${(st.knowledgeSize / 1024).toFixed(0)}KB`,
        `工程 ${st.processes} / 台帳 ${st.ledger}`,
        `数値基準 ${st.numeric} / 辞書 ${st.dictionary}`,
        `チェック ${st.checklist}（改善候補 ${st.improvements} は別管理）`
      ]
    },
    {
      sprite: SPR_PROJECT,
      color: '#e0a02a',
      tier: '制作チーム',
      name: '案件別マニュアル',
      id: 'project-manual',
      host: 'Claude Code',
      role: '案件独自ルールを共通へ上書きして判断',
      status: st.projects.length === 0 ? 'NO PROJECT' : (pendingTotal ? 'PENDING' : 'READY'),
      ok: st.projects.length > 0 && pendingTotal === 0,
      stats:
        st.projects.length === 0
          ? ['登録案件なし', 'generate-project-agent.mjs で登録']
          : st.projects.map((p) => `${p.id} — ${p.pending ? `未確定 ${p.pending}件` : '確定済み'}`)
    },
    {
      sprite: SPR_DESIGN,
      color: '#a689f0',
      tier: '制作チーム',
      name: '図解・画像',
      id: 'get_design_rules',
      host: 'Codex',
      role: '図解と画像の生成（Claude Codeは画像を作れない）',
      status: 'READY',
      ok: true,
      stats: [
        '生成前に get_design_rules を必須',
        '使用色 3色以内 / 全画面 1,920×1,080以上',
        '完了条件: 音量0でも内容が分かる',
        'AI入力可否は要確認（マニュアル未記載）'
      ]
    },
    {
      sprite: SPR_TELOP,
      color: '#3fc47c',
      tier: '制作チーム',
      name: 'テロップ',
      id: 'format_telop',
      host: 'Codex',
      role: '文字起こし → テロップ行（ニュアンスを残す）',
      status: 'READY',
      ok: true,
      stats: [
        '1行15〜18文字 / 句読点は半角スペース',
        '文章を綺麗に書き換えない',
        '話し言葉はそのまま残す',
        '子音発声の1フレーム前に表示'
      ]
    },
    {
      sprite: SPR_MCP,
      color: '#9aa4b2',
      tier: '制作チーム',
      name: 'MCPサーバー（video-manual）',
      id: 'mcp-server.mjs',
      host: '共通',
      role: 'Claude Code / Codex 共通の接続口',
      status: st.knowledgeExists ? 'SERVING' : 'NO DATA',
      ok: st.knowledgeExists,
      stats: [
        'ツール 12個 / stdio JSON-RPC 2.0',
        '外部依存なし（Node.js 18+）',
        'Claude Code: .mcp.json で自動接続',
        'Codex: config.toml へ追記'
      ]
    }
  ];
}

/* ------------------------------------------------------------------ */
/* ターミナル出力                                                       */
/* ------------------------------------------------------------------ */

function printTerminal(st) {
  const agents = buildAgents(st);
  const W = 78;
  const line = (ch = '─') => dim(ch.repeat(W));

  console.log('');
  console.log(bold('  動画編集マニュアル エージェント構成'));
  console.log(dim('  video-manual MCP / Claude Code + Codex'));
  console.log('');
  console.log(line('═'));

  let lastTier = '';
  for (const a of agents) {
    const art = renderSprite(a.sprite);
    const status = a.ok ? paint('#3fc47c', `● ${a.status}`) : paint('#f0c46b', `▲ ${a.status}`);

    if (a.tier !== lastTier) {
      console.log('');
      console.log('  ' + bold(a.tier === 'CTO' ? 'CTO（制作チームの外から監査）' : '制作チーム（お互いに連携できる）'));
      lastTier = a.tier;
    }

    console.log('');
    /* スプライト8行 と 情報を横並びにする */
    const info = [
      bold(paint(a.color, a.name)),
      dim(`${a.host}  ·  ${a.id}`),
      a.role,
      status,
      ...a.stats.map((s) => dim('  ' + s))
    ];
    const rows = Math.max(art.length, info.length);
    for (let i = 0; i < rows; i++) {
      const left = art[i] ?? ' '.repeat(16);
      const right = info[i] ?? '';
      console.log('  ' + left + '   ' + right);
    }
  }

  console.log('');
  console.log(line('═'));
  console.log('');
  console.log(bold('  データフロー'));
  console.log('');
  console.log('    manual-data.js');
  console.log(dim('         │  build-knowledge.mjs'));
  console.log('         ▼');
  console.log('    knowledge/common-manual.md ' + dim(`(${(st.knowledgeSize / 1024).toFixed(0)}KB)`));
  console.log(dim('         │'));
  console.log('         ▼');
  console.log('    ' + paint('#9aa4b2', 'MCP video-manual') + dim('  ── 12 tools'));
  console.log(dim('         │'));
  console.log('    ┌────┴────┐');
  console.log('    ▼         ▼');
  console.log('  ' + paint('#1d4ed8', 'Claude Code') + '   ' + paint('#a689f0', 'Codex'));
  console.log(dim('  判定・QA      図解・画像・ニュアンス'));

  console.log('');
  console.log(line('═'));
  console.log('');
  console.log(bold('  未解決（独断で解決しないこと）'));
  console.log('');
  console.log('  ' + paint('#b3261e', `▲ 矛盾 ${st.conflicts}件`) + dim('   演出頻度 6秒/10秒 · 提出方法 Frame.io/限定公開 ほか'));
  console.log('  ' + paint('#f0c46b', `▲ 欠損リンク ${st.missingLinks}件`) + dim('   URLを推測しない'));
  console.log('  ' + paint('#f0c46b', `▲ 要確認 ${st.needsConfirm}件`) + dim('   AIへ入力してよい情報の範囲など'));

  const pendingTotal = st.projects.reduce((n, p) => n + p.pending, 0);
  if (pendingTotal) {
    console.log('  ' + paint('#f0c46b', `▲ 案件未確定 ${pendingTotal}件`) + dim('   generate 後に人が確定させる'));
  }

  console.log('');
  console.log(line('═'));
  console.log('');
  if (!st.knowledgeExists) {
    console.log('  ' + paint('#b3261e', '知識ベースが未生成です:') + ' node agents/build-knowledge.mjs');
    console.log('');
  }
}

/* ------------------------------------------------------------------ */
/* HTML出力                                                            */
/* ------------------------------------------------------------------ */

function spriteToSvg(rows, scale = 8) {
  const cells = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = PALETTE[ch];
      if (!c) return;
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
    });
  });
  return `<svg viewBox="0 0 16 16" width="${16 * scale}" height="${16 * scale}" shape-rendering="crispEdges" role="img" aria-hidden="true">${cells.join('')}</svg>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function printHtml(st) {
  const agents = buildAgents(st);
  const pendingTotal = st.projects.reduce((n, p) => n + p.pending, 0);

  let lastTierHtml = '';
  const cards = agents.map((a) => {
    const head = a.tier !== lastTierHtml
      ? `<h2 class="tier">${a.tier === 'CTO' ? 'CTO（制作チームの外から監査）' : '制作チーム（お互いに連携できる）'}</h2>`
      : '';
    lastTierHtml = a.tier;
    return head + `
    <article class="agent${a.ok ? '' : ' warn'}">
      <div class="sprite">${spriteToSvg(a.sprite)}</div>
      <div class="meta">
        <h3 style="color:${a.color}">${esc(a.name)}</h3>
        <p class="host">${esc(a.host)} · <code>${esc(a.id)}</code></p>
        <p class="role">${esc(a.role)}</p>
        <p class="status">${a.ok ? '●' : '▲'} ${esc(a.status)}</p>
        <ul>${a.stats.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </div>
    </article>`;
  }).join('');

  const html = `<title>エージェント構成 — 動画編集マニュアル</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--bd:#d3d7de;--tx:#1b1f26;--mu:#565d69}
@media(prefers-color-scheme:dark){:root{--bg:#14171c;--card:#1c2027;--bd:#333a45;--tx:#e8eaed;--mu:#a2abb8}}
:root[data-theme="dark"]{--bg:#14171c;--card:#1c2027;--bd:#333a45;--tx:#e8eaed;--mu:#a2abb8}
:root[data-theme="light"]{--bg:#f6f7f9;--card:#fff;--bd:#d3d7de;--tx:#1b1f26;--mu:#565d69}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 56px;background:var(--bg);color:var(--tx);
 font-family:"Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,system-ui,sans-serif;line-height:1.7}
.wrap{max-width:900px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--mu);font-size:13px;margin:0 0 24px}
.agents{display:grid;gap:14px}
h2.tier{font-size:13px;margin:12px 0 2px;color:var(--mu);letter-spacing:.04em}
.agent{display:flex;gap:16px;align-items:flex-start;background:var(--card);
 border:1px solid var(--bd);border-radius:10px;padding:16px}
.agent.warn{border-left:4px solid #e0a02a}
.sprite{flex:0 0 auto;image-rendering:pixelated}
.sprite svg{display:block}
.meta{min-width:0}
.meta h3{margin:0 0 2px;font-size:15px}
.host{margin:0 0 6px;font-size:11.5px;color:var(--mu)}
.host code{font-size:11px}
.role{margin:0 0 6px;font-size:13px}
.status{margin:0 0 8px;font-size:12px;font-weight:700}
.meta ul{margin:0;padding-left:1.1em;font-size:12px;color:var(--mu)}
.flow{background:var(--card);border:1px solid var(--bd);border-radius:10px;
 padding:16px;margin-top:24px;overflow-x:auto}
.flow pre{margin:0;font-size:12.5px;line-height:1.9;
 font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.open{margin-top:24px;background:var(--card);border:1px solid var(--bd);
 border-left:4px solid #b3261e;border-radius:10px;padding:16px}
.open h2{font-size:15px;margin:0 0 8px}
.open ul{margin:0;padding-left:1.2em;font-size:13px}
h2.sec{font-size:15px;margin:24px 0 8px}
@media(max-width:480px){.agent{flex-direction:column}}
</style>
<div class="wrap">
<h1>動画編集マニュアル エージェント構成</h1>
<p class="sub">video-manual MCP / Claude Code + Codex　—　生成: ${new Date().toISOString().slice(0, 10)}</p>
<div class="agents">${cards}</div>

<h2 class="sec">データフロー</h2>
<div class="flow"><pre>manual-data.js
     │  build-knowledge.mjs
     ▼
knowledge/common-manual.md  (${(st.knowledgeSize / 1024).toFixed(0)}KB)
     │
     ▼
MCP video-manual  ── 12 tools
     │
 ┌───┴───┐
 ▼       ▼
Claude   Codex
判定/QA  図解・画像・ニュアンス</pre></div>

<div class="open">
<h2>未解決（独断で解決しないこと）</h2>
<ul>
<li>矛盾 ${st.conflicts}件 — 演出頻度 6秒/10秒、提出方法 Frame.io/限定公開 ほか</li>
<li>欠損リンク ${st.missingLinks}件 — URLを推測しない</li>
<li>要確認 ${st.needsConfirm}件 — AIへ入力してよい情報の範囲など</li>
${pendingTotal ? `<li>案件未確定 ${pendingTotal}件 — 生成後に人が確定させる</li>` : ''}
</ul>
</div>
</div>`;

  const target = resolve(__dirname, 'dashboard.html');
  writeFileSync(target, html, 'utf8');
  console.log('生成: agents/dashboard.html');
  console.log(`  エージェント ${agents.length}件 / ${(html.length / 1024).toFixed(0)} KB`);
}

/* ------------------------------------------------------------------ */

const state = collectState();
if (WANT_HTML) printHtml(state);
else printTerminal(state);
