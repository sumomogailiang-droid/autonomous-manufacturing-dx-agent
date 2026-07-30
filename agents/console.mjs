#!/usr/bin/env node
/*
 * console.mjs
 *
 * ターミナルで制作チームへ質問・指示を出す対話コンソール。
 *
 * 実行:
 *   node agents/console.mjs              対話モード
 *   node agents/console.mjs --no-color   色なし
 *   echo "/team" | node agents/console.mjs   パイプでも動く（検証用）
 *
 * === 設計 ===
 *
 * このコンソールは MCPサーバー（agents/mcp-server.mjs）のクライアントとして
 * 動く。Claude Code や Codex とまったく同じツールを叩くため、
 * 答えが食い違うことがない。ロジックをここへ二重に持たない。
 *
 * === できないこと（正直に） ===
 *
 * このコンソールは LLM を呼ばない。文章を生成しない。
 * スラッシュなしの自由入力は「マニュアル全文検索」を実行して該当箇所を返す。
 * 「考えて答えてくれる相手」ではなく「根拠を引く道具」として作っている。
 *
 * 判断が必要なことは、該当する役割（common-manual / director など）を
 * 案内するので、Claude Code か Codex でその役割を呼んでください。
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITES, frame, renderSprite, paint as paintRaw, bold as boldRaw, dim as dimRaw } from './sprites.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, 'mcp-server.mjs');

const NO_COLOR = process.argv.includes('--no-color') || !!process.env.NO_COLOR;
const paint = (hex, s) => paintRaw(hex, s, NO_COLOR);
const bold = (s) => boldRaw(s, NO_COLOR);
const dim = (s) => dimRaw(s, NO_COLOR);

const C = {
  cto: '#e8c76a',
  director: '#e06b60',
  'common-manual': '#5b8cff',
  'project-manual': '#e0a02a',
  design: '#a689f0',
  telop: '#3fc47c',
  mcp: '#9aa4b2',
  accent: '#5b8cff',
  ok: '#3fc47c',
  warn: '#f0c46b',
  ng: '#e06b60'
};

/* ------------------------------------------------------------------ */
/* MCPクライアント                                                     */
/* ------------------------------------------------------------------ */

let srv = null;
let nextId = 1;
const pending = new Map();
let toolNames = [];

function startServer() {
  srv = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });

  let buf = '';
  srv.stdout.setEncoding('utf8');
  srv.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const res = pending.get(msg.id);
      if (res) { pending.delete(msg.id); res(msg); }
    }
  });

  srv.on('exit', (code) => {
    if (code !== 0) {
      console.log(paint(C.ng, `\n  MCPサーバーが終了しました（コード ${code}）`));
    }
  });
}

function rpc(method, params) {
  return new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, res);
    const t = setTimeout(() => {
      pending.delete(id);
      rej(new Error('MCPサーバーが応答しません'));
    }, 20000);
    const wrapped = (m) => { clearTimeout(t); res(m); };
    pending.set(id, wrapped);
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function callTool(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  if (r.error) return { text: `エラー: ${r.error.message}`, isError: true };
  const body = r.result?.content?.[0]?.text ?? '';
  return { text: body, isError: !!r.result?.isError };
}

/* ------------------------------------------------------------------ */
/* 表示                                                                */
/* ------------------------------------------------------------------ */

const W = 74;
const rule = (ch = '─') => dim(ch.repeat(W));

function showBanner() {
  const art = renderSprite(frame('mcp'), NO_COLOR);
  console.log('');
  const lines = [
    bold('  動画編集 制作チーム コンソール'),
    dim('  MCPサーバー video-manual に接続'),
    '',
    dim('  /help でコマンド一覧   /team でチーム表示   /quit で終了')
  ];
  for (let i = 0; i < Math.max(art.length, lines.length); i++) {
    console.log('  ' + (art[i] ?? ' '.repeat(16)) + '   ' + (lines[i] ?? ''));
  }
  console.log('');
  console.log(rule('═'));
}

/** チームをドット絵で横並び表示する */
async function showTeam() {
  const r = await callTool('list_agents');

  /* 役割名と説明を取り出す */
  const roles = [];
  const re = /^## ([a-z0-9-]+)\n\n(.+)$/gm;
  let m;
  while ((m = re.exec(r.text))) roles.push({ name: m[1], desc: m[2] });

  console.log('');
  console.log(bold('  制作チーム'));
  console.log('');

  /* CTOは制作チームの外なので分けて出す */
  const cto = roles.find((x) => x.name === 'cto');
  const team = roles.filter((x) => x.name !== 'cto');

  const drawRow = (list) => {
    const arts = list.map((x) => renderSprite(frame(x.name), NO_COLOR));
    for (let i = 0; i < 8; i++) {
      console.log('   ' + list.map((x, j) => arts[j][i] ?? ' '.repeat(16)).join('   '));
    }
    console.log('   ' + list.map((x) => {
      const label = x.name.padEnd(16).slice(0, 16);
      return paint(C[x.name] || C.mcp, label);
    }).join('   '));
    console.log('');
  };

  if (cto) {
    console.log(dim('  ── 制作チームの外から監査・裁定 ' + '─'.repeat(38)));
    console.log('');
    drawRow([cto]);
  }

  console.log(dim('  ── 制作チーム（お互いに連携できる） ' + '─'.repeat(34)));
  console.log('');
  for (let i = 0; i < team.length; i += 3) drawRow(team.slice(i, i + 3));

  console.log(rule());
  console.log('');
  for (const x of roles) {
    const short = x.desc.length > 58 ? x.desc.slice(0, 58) + '…' : x.desc;
    console.log('  ' + paint(C[x.name] || C.mcp, x.name.padEnd(15)) + dim(short));
  }
  console.log('');
  console.log(dim('  /role <名前> でその役割の詳しい定義を表示します'));
  console.log('');
}

function showHelp() {
  console.log('');
  console.log(bold('  コマンド'));
  console.log('');
  const rows = [
    ['/team', 'チームをドット絵で表示'],
    ['/role <名前>', '役割の定義を表示（common-manual / director / cto / design / telop / project-manual）'],
    ['/audit', '全体を監査して GO / NO-GO を判定'],
    ['', ''],
    ['/rule <検索語>', 'マニュアル全文検索'],
    ['/process [番号]', '制作工程13工程（番号なしで一覧）'],
    ['/num [グループ]', '数値基準36件'],
    ['/check', '表記チェック（複数行入力）'],
    ['/telop', 'テロップ整形（タイムコード付き文字起こしを複数行入力）'],
    ['/list [種別]', '提出前チェック official / improvement / clip'],
    ['/tpl [名前]', '連絡テンプレート（名前なしで一覧）'],
    ['/conflicts', 'マニュアルの矛盾・欠損・要確認'],
    ['/accident [語]', '事故防止マップ'],
    ['/design [種別]', '図解・画像・テロップの制作ルール'],
    ['', ''],
    ['/projects', '登録済み案件の一覧'],
    ['/project <ID>', '案件マニュアルを表示'],
    ['/handoff', '引き継ぎメモを作る（対話式）'],
    ['', ''],
    ['/tools', 'MCPツール一覧'],
    ['/help', 'この一覧'],
    ['/quit', '終了']
  ];
  for (const [cmd, desc] of rows) {
    if (!cmd) { console.log(''); continue; }
    console.log('  ' + paint(C.accent, cmd.padEnd(17)) + dim(desc));
  }
  console.log('');
  console.log(rule());
  console.log('');
  console.log(bold('  スラッシュなしで入力すると'));
  console.log(dim('  マニュアル全文検索を実行して該当箇所を返します。'));
  console.log('');
  console.log(paint(C.warn, '  このコンソールは文章を生成しません。'));
  console.log(dim('  根拠を引く道具です。判断が必要なことは担当役割を案内するので、'));
  console.log(dim('  Claude Code か Codex でその役割を呼んでください。'));
  console.log('');
}

/* ------------------------------------------------------------------ */
/* 作業中アニメーション                                                 */
/* ------------------------------------------------------------------ */

/*
 * ツールを呼んでいる間だけ、担当エージェントの絵を idle と work で
 * 切り替える。どのエージェントが動いているか一目で分かるようにする。
 *
 * 動きは0.4秒間隔の2フレームだけ。派手に動かすと目障りで、
 * 情報も増えないため。
 *
 * パイプ入力や色なし環境ではアニメーションせず、1行の文字表示にする。
 */
async function working(roleName, label, fn) {
  const animate = process.stdout.isTTY && !NO_COLOR;

  if (!animate) {
    console.log(dim(`\n  ${roleName} が作業中… ${label}`));
    return await fn();
  }

  const HEIGHT = 9;   // スプライト8行 + 状態1行
  let state = 'idle';
  let stopped = false;

  const draw = (first) => {
    if (!first) process.stdout.write(`\x1b[${HEIGHT}A`);
    const art = renderSprite(frame(roleName, state), NO_COLOR);
    for (const l of art) process.stdout.write('\x1b[2K  ' + l + '\n');
    const dots = state === 'work' ? '● ● ●' : '● ●  ';
    process.stdout.write('\x1b[2K  ' +
      paint(C[roleName] || C.accent, roleName) + dim(`  ${label} ${dots}`) + '\n');
  };

  console.log('');
  draw(true);
  const timer = setInterval(() => {
    if (stopped) return;
    state = state === 'idle' ? 'work' : 'idle';
    draw(false);
  }, 400);

  try {
    return await fn();
  } finally {
    stopped = true;
    clearInterval(timer);
    /* 描いた行を消してから結果を出す */
    process.stdout.write(`\x1b[${HEIGHT}A\x1b[0J`);
  }
}

/** 長い出力は見やすく区切って出す */
function printResult(title, body, isError) {
  console.log('');
  console.log(isError ? paint(C.ng, '  ' + title) : paint(C.accent, '  ' + title));
  console.log(rule());
  console.log('');
  for (const line of String(body).split('\n')) console.log('  ' + line);
  console.log('');
  console.log(rule());
  console.log('');
}

/* ------------------------------------------------------------------ */
/* 入力                                                                */
/* ------------------------------------------------------------------ */

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: process.stdin.isTTY
});

/*
 * 入力はキューで受ける。
 *
 * パイプ入力（echo "/team" | node console.mjs）だと readline が
 * 一気に読み終えて close するため、question() だけに頼ると
 * 行を取りこぼす。行イベントを溜めておき、ask() が取り出す。
 */
const inputQueue = [];
let inputWaiter = null;
let inputEnded = false;

rl.on('line', (line) => {
  if (inputWaiter) {
    const w = inputWaiter;
    inputWaiter = null;
    w(line);
  } else {
    inputQueue.push(line);
  }
});

rl.on('close', () => {
  inputEnded = true;
  if (inputWaiter) {
    const w = inputWaiter;
    inputWaiter = null;
    w(null);
  }
});

let currentRole = null;
let currentProject = null;

function promptText() {
  const parts = [];
  if (currentRole) parts.push(paint(C[currentRole] || C.accent, currentRole));
  if (currentProject) parts.push(paint(C['project-manual'], currentProject));
  const ctx = parts.length ? '(' + parts.join(' / ') + ')' : '';
  return `\n${ctx}${paint(C.accent, ' ❯ ')}`;
}

function ask(question) {
  if (question && process.stdin.isTTY) process.stdout.write(question);
  if (inputQueue.length) return Promise.resolve(inputQueue.shift());
  if (inputEnded) return Promise.resolve(null);
  return new Promise((res) => { inputWaiter = res; });
}

/** 複数行を空行2回（または .end）まで読む */
async function readMultiline(label) {
  console.log('');
  console.log(dim(`  ${label}`));
  console.log(dim('  入力し終わったら、空行で Enter を2回、または .end と入力してください。'));
  console.log('');
  const lines = [];
  let blank = 0;
  for (;;) {
    const line = await ask('  │ ');
    if (line === null) break;
    if (line.trim() === '.end') break;
    if (line.trim() === '') {
      blank++;
      if (blank >= 2) break;
      lines.push('');
      continue;
    }
    blank = 0;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

/* ------------------------------------------------------------------ */
/* コマンド処理                                                         */
/* ------------------------------------------------------------------ */

async function handle(input) {
  const line = input.trim();
  if (!line) return true;

  if (!line.startsWith('/')) {
    /* 自由入力はマニュアル検索へ回す */
    const args = { query: line };
    if (currentProject) args.project_id = currentProject;
    const r = await working('common-manual', 'マニュアルを検索しています',
      () => callTool('manual_search', args));
    printResult(`検索: ${line}`, r.text, r.isError);
    if (!r.isError && /記載は見つかりませんでした/.test(r.text)) {
      console.log(dim('  判断が必要なことは、担当役割へ渡してください。'));
      console.log(dim('  /team で一覧、/role <名前> で定義を確認できます。'));
      console.log('');
    }
    return true;
  }

  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(' ').trim();

  switch (cmd) {
    case '/quit': case '/exit': case '/q':
      return false;

    case '/help': case '/h': case '/?':
      showHelp();
      return true;

    case '/team':
      await showTeam();
      return true;

    case '/role': {
      if (!arg) {
        const r = await callTool('list_agents');
        printResult('役割一覧', r.text, r.isError);
        console.log(dim('  /role <名前> で定義を表示します。'));
        return true;
      }
      const r = await callTool('get_agent_role', { name: arg });
      if (r.isError) { printResult('役割', r.text, true); return true; }
      const art = renderSprite(frame(arg), NO_COLOR);
      console.log('');
      for (const l of art) console.log('  ' + l);
      printResult(`役割: ${arg}`, r.text, false);
      currentRole = arg;
      console.log(dim(`  以降の表示は ${arg} の観点を前提にします（プロンプトに表示）。`));
      console.log(dim('  解除するには /role clear'));
      return true;
    }

    case '/audit': {
      const r = await working('cto', '全体を監査しています',
        () => callTool('governance_audit', {}));
      const verdict = /判定:\s*GO/.test(r.text) ? 'GO' : (/NO-GO/.test(r.text) ? 'NO-GO' : '不明');
      const art = renderSprite(frame('cto', verdict === 'GO' ? 'idle' : 'work'), NO_COLOR);
      console.log('');
      for (const l of art) console.log('  ' + l);
      printResult(`監査結果: ${verdict}`, r.text, verdict === 'NO-GO');
      return true;
    }

    case '/rule': {
      if (!arg) { console.log(dim('\n  使い方: /rule <検索語>\n')); return true; }
      const args = { query: arg };
      if (currentProject) args.project_id = currentProject;
      const r = await working('common-manual', 'マニュアルを検索しています',
        () => callTool('manual_search', args));
      printResult(`検索: ${arg}`, r.text, r.isError);
      return true;
    }

    case '/process': {
      const args = arg ? { no: Number(arg) } : {};
      const r = await callTool('get_process', args);
      printResult(arg ? `工程 ${arg}` : '制作工程 一覧', r.text, r.isError);
      return true;
    }

    case '/num': {
      const r = await callTool('get_numeric_standards', arg ? { group: arg } : {});
      printResult('数値基準', r.text, r.isError);
      return true;
    }

    case '/check': {
      const text = arg || await readMultiline('表記チェックしたいテキストを貼ってください。');
      if (!text) { console.log(dim('\n  入力がありませんでした。\n')); return true; }
      const r = await working('common-manual', '表記を照合しています',
        () => callTool('check_notation', { text, as_telop: true }));
      printResult('表記チェック', r.text, r.isError);
      return true;
    }

    case '/telop': {
      const text = arg || await readMultiline('タイムコード付き文字起こしを貼ってください（SRT / VTT / [TC → TC] 本文）。');
      if (!text) { console.log(dim('\n  入力がありませんでした。\n')); return true; }
      const r = await working('telop', 'テロップを整形しています',
        () => callTool('format_telop', { text }));
      const art = renderSprite(frame('telop'), NO_COLOR);
      console.log('');
      for (const l of art) console.log('  ' + l);
      printResult('テロップ整形', r.text, r.isError);
      console.log(dim('  フレーム単位の配置は Premiere の「編集アシスタント」パネルで行ってください。'));
      console.log(dim('  ここでは改行位置と表記の確認までです。'));
      console.log('');
      return true;
    }

    case '/list': {
      const kind = arg || 'official';
      const r = await callTool('get_checklist', { kind });
      printResult(`チェックリスト（${kind}）`, r.text, r.isError);
      return true;
    }

    case '/tpl': {
      const r = await callTool('get_template', arg ? { title: arg } : {});
      printResult('連絡テンプレート', r.text, r.isError);
      return true;
    }

    case '/conflicts': {
      const r = await callTool('list_conflicts', {});
      printResult('矛盾・欠損・要確認', r.text, r.isError);
      console.log(paint(C.warn, '  これらは独断で解決しないでください。'));
      console.log(dim('  演出頻度と提出方法の確定はディレクターの権限です。'));
      console.log('');
      return true;
    }

    case '/accident': {
      const r = await callTool('get_accident_map', arg ? { query: arg } : {});
      printResult('事故防止マップ', r.text, r.isError);
      return true;
    }

    case '/design': {
      const r = await working('design', '制作ルールを集めています',
        () => callTool('get_design_rules', arg ? { kind: arg } : {}));
      const art = renderSprite(frame('design'), NO_COLOR);
      console.log('');
      for (const l of art) console.log('  ' + l);
      printResult('図解・画像・テロップの制作ルール', r.text, r.isError);
      console.log(dim('  Claude Code は画像を生成できません。生成は Codex 側で行ってください。'));
      console.log('');
      return true;
    }

    case '/projects': {
      const r = await callTool('list_projects', {});
      printResult('登録済み案件', r.text, r.isError);
      return true;
    }

    case '/project': {
      if (!arg) {
        if (currentProject) {
          currentProject = null;
          console.log(dim('\n  案件の指定を解除しました。\n'));
        } else {
          console.log(dim('\n  使い方: /project <案件ID>   解除は引数なしで実行\n'));
        }
        return true;
      }
      const r = await working('project-manual', '案件マニュアルを読んでいます',
        () => callTool('get_project_rules', { project_id: arg }));
      printResult(`案件: ${arg}`, r.text, r.isError);
      if (!r.isError) {
        currentProject = arg;
        console.log(dim('  以降の検索は、この案件マニュアルも対象にします。'));
        console.log('');
      }
      return true;
    }

    case '/handoff': {
      console.log('');
      console.log(dim('  担当外の判断を他の役割へ渡します。根拠なしでは渡せません。'));
      const to = (await ask('  渡す先の役割: ')).trim();
      if (!to) { console.log(dim('\n  中止しました。\n')); return true; }
      const what = (await ask('  何を判断してほしいか: ')).trim();
      const why = (await ask('  なぜ自分では決められないか: ')).trim();
      const evidence = (await ask('  根拠（マニュアルの該当箇所・数値）: ')).trim();
      if (!what || !why) { console.log(dim('\n  「何を」「なぜ」は必須です。中止しました。\n')); return true; }
      const r = await working('director', '引き継ぎメモを作っています',
        () => callTool('handoff', { to, what, why, evidence, from: currentRole || undefined }));
      printResult('引き継ぎメモ', r.text, r.isError);
      return true;
    }

    case '/tools': {
      const lines = ['MCPツール ' + toolNames.length + '個', ''];
      for (const n of toolNames) lines.push('  ' + n);
      printResult('MCPツール', lines.join('\n'), false);
      return true;
    }

    default:
      console.log('');
      console.log(paint(C.warn, `  知らないコマンドです: ${cmd}`));
      console.log(dim('  /help でコマンド一覧を表示します。'));
      console.log(dim('  スラッシュなしで入力すると、マニュアル全文検索になります。'));
      console.log('');
      return true;
  }
}

/* ------------------------------------------------------------------ */
/* 起動                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  startServer();

  try {
    const init = await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'video-manual-console', version: '1.0.0' }
    });
    if (!init.result?.serverInfo) throw new Error('initialize に失敗しました');

    const tl = await rpc('tools/list', {});
    toolNames = (tl.result?.tools || []).map((t) => t.name);
  } catch (e) {
    console.error(paint(C.ng, `\n  MCPサーバーへ接続できませんでした: ${e.message}`));
    console.error(dim('  node agents/build-knowledge.mjs を実行してから再試行してください。\n'));
    process.exit(1);
  }

  showBanner();
  console.log('');
  console.log(dim(`  MCPツール ${toolNames.length}個 を利用できます。`));
  await showTeam();

  /* 対話ループ */
  for (;;) {
    let input;
    try {
      input = await ask(promptText());
    } catch {
      break;
    }
    if (input === null || input === undefined) break;

    let cont = true;
    try {
      cont = await handle(input);
    } catch (e) {
      console.log('');
      console.log(paint(C.ng, `  エラー: ${e.message}`));
      console.log('');
    }
    if (!cont) break;
  }

  console.log('');
  console.log(dim('  終了します。'));
  console.log('');
  rl.close();
  if (srv) srv.stdin.end();
  process.exit(0);
}

main();
