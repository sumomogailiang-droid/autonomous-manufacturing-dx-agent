#!/usr/bin/env node
/*
 * premiere-bridge-mcp.mjs
 *
 * MCP Bridge (CEP) を経由して Premiere Pro を操作するMCPサーバー。
 *
 * === なぜ必要か ===
 *
 * MCP Bridge (CEP) は Premiere 側の受け手だけを提供している。
 * クライアント側（コマンドを書き出す側）は同梱されていないため、
 * このファイルがその役割を担う。
 *
 * === 動く場所 ===
 *
 * ★ Premiere と同じマシンで動かすこと。
 *
 * やり取りは共有フォルダへのファイルの読み書きで行う。
 * クラウド側のセッションから動かしても、そのフォルダは別のマシンのものなので
 * 誰も読まない。Mac上の Claude Code / Codex から使う。
 *
 * === プロトコル（bridge-cep.js から読み取ったもの） ===
 *
 *   1. クライアントが <tempDir>/command-<id>.json を書く
 *        { "id": "...", "script": "<ExtendScriptのソース>" }
 *   2. パネルが250msごとにフォルダを見て、command- で始まる最初の1件を拾う
 *   3. ExtendScript を evalScript で実行する（45秒でタイムアウト）
 *   4. <tempDir>/response-<id>.json を書き、command ファイルを消す
 *        { "success": true, "result": <JSONまたは文字列>, "timestamp": "..." }
 *        { "success": false, "error": "..." }
 *
 * 一度に1件しか処理しない。並列に投げても順番待ちになる。
 *
 * === パネル側の制限 ===
 *
 * 次を含むスクリプトは実行前に弾かれる（bridge-cep.js の validateScript）。
 *   eval( / new Function( / require( / __dirname / __filename / process. / child_process
 * 長さは50万文字まで。
 * ここでも同じ検査をしてから送る。送ってから弾かれると原因が分かりにくいため。
 *
 * === 使い方 ===
 *
 *   1. Premiere で「MCP Bridge (CEP)」パネルを開き、Start Bridge を押す
 *   2. Mac の Claude Code へ登録する
 *        claude mcp add premiere --scope local -- node <このファイルの絶対パス>
 *   3. 疎通確認
 *        node tools/premiere-bridge-mcp.mjs --check
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'premiere-bridge', version: '1.0.0' };

/* ------------------------------------------------------------------ *
 * 共有フォルダの決定
 *
 * パネルと同じ場所を見ないと、書いても誰も読まない。
 * パネルの探し方（bridge-cep.js）に合わせる。
 * ------------------------------------------------------------------ */

function resolveTempDir() {
  /* 1. 環境変数。パネルの CONFIGURATION が指しているのはこれ */
  if (process.env.PREMIERE_TEMP_DIR) return process.env.PREMIERE_TEMP_DIR.trim();

  /* 2. パネルが自分の設定を書き出す場所 */
  const panelConfig = join(homedir(), '.premiere-mcp-bridge', 'config.json');
  if (existsSync(panelConfig)) {
    try {
      const c = JSON.parse(readFileSync(panelConfig, 'utf8'));
      if (c && typeof c.tempDirectory === 'string' && c.tempDirectory.trim()) {
        return c.tempDirectory.trim();
      }
    } catch (e) { /* 壊れていたら既定へ落とす */ }
  }

  /* 3. 既定。パネルの getDefaultTempPath と同じ */
  const base = process.platform === 'win32'
    ? (process.env.TEMP || process.env.TMP || 'C:\\Temp')
    : (process.platform === 'darwin' || process.platform === 'linux' ? '/tmp' : tmpdir());
  return join(base, 'premiere-mcp-bridge');
}

const TEMP_DIR = resolveTempDir();

/* ------------------------------------------------------------------ *
 * ブリッジとのやり取り
 * ------------------------------------------------------------------ */

/* パネル側と同じ検査。送る前に落として、理由を明確にする。 */
const FORBIDDEN = [
  { re: /eval\s*\(/i, name: 'eval(' },
  { re: /\bnew\s+Function\s*\(/i, name: 'new Function(' },
  { re: /\brequire\s*\(/i, name: 'require(' },
  { re: /\b__dirname\b/i, name: '__dirname' },
  { re: /\b__filename\b/i, name: '__filename' },
  { re: /\bprocess\./i, name: 'process.' },
  { re: /\bchild_process\b/i, name: 'child_process' }
];

function assertScriptAllowed(script) {
  if (typeof script !== 'string' || !script.trim()) {
    throw new Error('スクリプトが空です。');
  }
  if (script.length > 500000) {
    throw new Error(`スクリプトが長すぎます（${script.length}文字 / 上限500000）。`);
  }
  for (const f of FORBIDDEN) {
    if (f.re.test(script)) {
      throw new Error(
        `ブリッジが受け付けない語が含まれています: ${f.name}\n` +
        'パネル側の検査で弾かれるため、送信前に止めました。'
      );
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ExtendScript をブリッジへ渡し、結果を待つ。
 *
 * @param {string} script ExtendScriptのソース。JSON文字列を返すこと。
 * @param {{timeoutMs?:number}} opts
 */
async function runScript(script, opts) {
  assertScriptAllowed(script);

  const timeoutMs = (opts && opts.timeoutMs) || 60000;
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const commandPath = join(TEMP_DIR, `command-${id}.json`);
  const responsePath = join(TEMP_DIR, `response-${id}.json`);

  writeFileSync(commandPath, JSON.stringify({ id, script }), 'utf8');

  const started = Date.now();
  /* パネルは250msごとに見る。こちらはその半分で覗く。 */
  const pollMs = 120;
  /* 「拾われてすらいない」と「実行中」を区別する。
     コマンドファイルが残ったままなら、ブリッジが動いていない。 */
  let pickedUp = false;

  try {
    while (Date.now() - started < timeoutMs) {
      if (existsSync(responsePath)) {
        const raw = readFileSync(responsePath, 'utf8');
        try { unlinkSync(responsePath); } catch (e) { /* 消せなくても続ける */ }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          throw new Error('応答を読み取れませんでした。中身: ' + raw.slice(0, 400));
        }
        if (parsed && parsed.success === false) {
          throw new Error('Premiere側で失敗しました: ' + (parsed.error || '理由不明'));
        }
        if (parsed && parsed.error && parsed.success === undefined) {
          throw new Error('ブリッジが失敗しました: ' + parsed.error);
        }
        return parsed ? parsed.result : null;
      }

      if (!pickedUp && !existsSync(commandPath)) pickedUp = true;

      /* 3秒たっても拾われないなら、ほぼ確実にブリッジが止まっている。
         45秒待たせてから「タイムアウト」と言うより、ここで理由を出す。 */
      if (!pickedUp && Date.now() - started > 3000) {
        throw new Error(
          'ブリッジがコマンドを拾いません。\n' +
          `監視フォルダ: ${TEMP_DIR}\n` +
          '確認してください:\n' +
          '  - Premiere で「MCP Bridge (CEP)」パネルを開いているか\n' +
          '  - パネルの Start Bridge を押しているか（STATUS が Connected か）\n' +
          '  - パネルの TEMP DIRECTORY が上のフォルダと同じか'
        );
      }

      await sleep(pollMs);
    }
    throw new Error(
      `応答がありませんでした（${timeoutMs}ms）。\n` +
      'Premiere が固まっているか、スクリプトが重すぎる可能性があります。'
    );
  } finally {
    /* 投げっぱなしのコマンドを残さない。次回の実行を邪魔する。 */
    try { if (existsSync(commandPath)) unlinkSync(commandPath); } catch (e) { /* 消せなくても続ける */ }
  }
}

/* ------------------------------------------------------------------ *
 * ExtendScript の組み立て
 *
 * ExtendScript は古いJavaScript。const / let / アロー関数は使わない。
 * 値の埋め込みは JSON.stringify で行う（文字列連結で組まない）。
 * ------------------------------------------------------------------ */

const lit = (v) => JSON.stringify(v === undefined ? null : v);

/* どのスクリプトも同じ形で結果を返す。呼び出し側の処理を一本化するため。 */
function wrap(body) {
  return [
    '(function(){',
    '  try {',
    body,
    '  } catch (e) {',
    '    return JSON.stringify({ error: String(e) });',
    '  }',
    '})();'
  ].join('\n');
}

/* 見つけたシーケンスを返す共通部分。名前が空なら作業中のものを使う。 */
const FIND_SEQUENCE = [
  '    function __findSeq(name) {',
  '      if (!name) { return app.project.activeSequence; }',
  '      var seqs = app.project.sequences;',
  '      for (var i = 0; i < seqs.numSequences; i++) {',
  '        if (seqs[i].name === name) { return seqs[i]; }',
  '      }',
  '      return null;',
  '    }'
].join('\n');

/* ------------------------------------------------------------------ *
 * ツール
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: 'premiere_status',
    description:
      'Premiere Pro とプロジェクトの状態を返す。まずこれで疎通を確認する。' +
      'アプリ版・プロジェクト名・作業中シーケンス名・トラック数を返す。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'premiere_list_sequences',
    description: 'プロジェクト内のシーケンス一覧を返す。名前と尺を含む。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'premiere_duplicate_sequence',
    description:
      'シーケンスを複製する。元のシーケンスは変更しない。' +
      '本番へ手を入れる前に複製して、そちらで作業するために使う。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '複製元のシーケンス名。省略すると作業中のもの。' },
        newName: { type: 'string', description: '複製後の名前。省略すると Premiere の既定名。' }
      }
    }
  },
  {
    name: 'premiere_list_clips',
    description:
      '指定したビデオトラックのクリップ名と時刻を返す。読み取りのみ。' +
      'テロップの本文がクリップ名に入っている場合、そこから内容を取り出せる。',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: { type: 'integer', description: 'V番号（1始まり）。V3なら3。' },
        startSec: { type: 'number', description: '範囲の開始（秒）。省略すると全部。' },
        endSec: { type: 'number', description: '範囲の終了（秒）。省略すると全部。' },
        sequenceName: { type: 'string', description: '対象シーケンス名。省略すると作業中のもの。' }
      },
      required: ['trackIndex']
    }
  },
  {
    name: 'premiere_add_markers',
    description:
      'シーケンスマーカーをまとめて打つ。既存のクリップは変更しない。' +
      '演出を入れる位置の目印として使う。',
    inputSchema: {
      type: 'object',
      properties: {
        markers: {
          type: 'array',
          description: '打つマーカー。sec は秒。',
          items: {
            type: 'object',
            properties: {
              sec: { type: 'number' },
              name: { type: 'string' },
              comment: { type: 'string' }
            },
            required: ['sec']
          }
        },
        sequenceName: { type: 'string', description: '対象シーケンス名。省略すると作業中のもの。' }
      },
      required: ['markers']
    }
  },
  {
    name: 'premiere_eval',
    description:
      '任意の ExtendScript を実行する。逃げ道。' +
      'スクリプトは JSON 文字列を返すこと。' +
      'eval( / new Function( / require( / process. などを含むと、ブリッジ側で弾かれる。',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'ExtendScript のソース' },
        timeoutMs: { type: 'integer', description: '待つ時間（既定60000）' }
      },
      required: ['script']
    }
  }
];

function text(s) {
  return { content: [{ type: 'text', text: s }] };
}

function asJson(v) {
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

const HANDLERS = {
  async premiere_status() {
    const r = await runScript(wrap([
      '    var out = { appVersion: app.version, appName: app.name, projectName: null, activeSequence: null };',
      '    if (app.project) { out.projectName = app.project.name; }',
      '    var s = app.project ? app.project.activeSequence : null;',
      '    if (s) {',
      '      out.activeSequence = {',
      '        name: s.name,',
      '        videoTracks: s.videoTracks.numTracks,',
      '        audioTracks: s.audioTracks.numTracks',
      '      };',
      '    }',
      '    return JSON.stringify(out);'
    ].join('\n')));
    return text('Premiere の状態:\n\n```json\n' + asJson(r) + '\n```');
  },

  async premiere_list_sequences() {
    const r = await runScript(wrap([
      '    var seqs = app.project.sequences;',
      '    var list = [];',
      '    for (var i = 0; i < seqs.numSequences; i++) {',
      '      list.push({ index: i, name: seqs[i].name });',
      '    }',
      '    return JSON.stringify({ count: list.length, sequences: list });'
    ].join('\n')));
    return text('シーケンス一覧:\n\n```json\n' + asJson(r) + '\n```');
  },

  async premiere_duplicate_sequence(args) {
    const r = await runScript(wrap([
      FIND_SEQUENCE,
      `    var src = __findSeq(${lit(args.name || '')});`,
      '    if (!src) { return JSON.stringify({ error: "複製元のシーケンスが見つかりません" }); }',
      '    var before = {};',
      '    var i;',
      '    for (i = 0; i < app.project.sequences.numSequences; i++) {',
      '      before[app.project.sequences[i].name] = true;',
      '    }',
      '    if (typeof src.clone !== "function") {',
      '      return JSON.stringify({ error: "このPremiereでは clone() が使えません" });',
      '    }',
      '    src.clone();',
      '    var added = [];',
      '    for (i = 0; i < app.project.sequences.numSequences; i++) {',
      '      var nm = app.project.sequences[i].name;',
      '      if (!before[nm]) { added.push({ index: i, name: nm }); }',
      '    }',
      '    if (added.length === 0) {',
      '      return JSON.stringify({ error: "複製されたシーケンスを特定できませんでした" });',
      '    }',
      `    var wanted = ${lit(args.newName || '')};`,
      '    if (wanted) {',
      '      app.project.sequences[added[0].index].name = wanted;',
      '      added[0].name = wanted;',
      '    }',
      '    return JSON.stringify({ source: src.name, created: added });'
    ].join('\n')));
    return text(
      '複製しました。**元のシーケンスは変更していません。**\n\n```json\n' + asJson(r) + '\n```'
    );
  },

  async premiere_list_clips(args) {
    const idx = Number(args.trackIndex);
    if (!Number.isFinite(idx) || idx < 1) throw new Error('trackIndex は1以上の整数です。');
    const hasRange = Number.isFinite(args.startSec) && Number.isFinite(args.endSec);
    const r = await runScript(wrap([
      FIND_SEQUENCE,
      `    var s = __findSeq(${lit(args.sequenceName || '')});`,
      '    if (!s) { return JSON.stringify({ error: "シーケンスが見つかりません" }); }',
      `    var t = s.videoTracks[${idx - 1}];`,
      `    if (!t) { return JSON.stringify({ error: "V${idx} がありません" }); }`,
      `    var hasRange = ${hasRange ? 'true' : 'false'};`,
      `    var rs = ${lit(hasRange ? Number(args.startSec) : 0)};`,
      `    var re = ${lit(hasRange ? Number(args.endSec) : 0)};`,
      '    var out = [];',
      '    for (var i = 0; i < t.clips.numItems; i++) {',
      '      var c = t.clips[i];',
      '      var st = c.start.seconds;',
      '      var en = c.end.seconds;',
      '      if (hasRange && !(st < re && en > rs)) { continue; }',
      '      out.push({ name: c.name, start: st, end: en });',
      '    }',
      `    return JSON.stringify({ track: "V${idx}", count: out.length, clips: out });`
    ].join('\n')));
    return text('クリップ一覧（読み取りのみ）:\n\n```json\n' + asJson(r) + '\n```');
  },

  async premiere_add_markers(args) {
    const markers = Array.isArray(args.markers) ? args.markers : [];
    if (!markers.length) throw new Error('markers が空です。');
    for (const m of markers) {
      if (!Number.isFinite(Number(m.sec))) throw new Error('sec が数値でないマーカーがあります。');
    }
    const payload = markers.map((m) => ({
      sec: Number(m.sec),
      name: String(m.name || ''),
      comment: String(m.comment || '')
    }));
    const r = await runScript(wrap([
      FIND_SEQUENCE,
      `    var s = __findSeq(${lit(args.sequenceName || '')});`,
      '    if (!s) { return JSON.stringify({ error: "シーケンスが見つかりません" }); }',
      `    var items = ${lit(payload)};`,
      '    var placed = 0;',
      '    var failed = [];',
      '    for (var i = 0; i < items.length; i++) {',
      '      try {',
      '        var mk = s.markers.createMarker(items[i].sec);',
      '        if (items[i].name) { mk.name = items[i].name; }',
      '        if (items[i].comment) { mk.comments = items[i].comment; }',
      '        placed++;',
      '      } catch (e2) {',
      '        failed.push({ sec: items[i].sec, error: String(e2) });',
      '      }',
      '    }',
      '    return JSON.stringify({ placed: placed, failed: failed });'
    ].join('\n')), { timeoutMs: Math.max(60000, markers.length * 400) });
    return text('マーカーを打ちました:\n\n```json\n' + asJson(r) + '\n```');
  },

  async premiere_eval(args) {
    const r = await runScript(String(args.script || ''), {
      timeoutMs: Number(args.timeoutMs) || 60000
    });
    return text('実行結果:\n\n```json\n' + asJson(r) + '\n```');
  }
};

/* ------------------------------------------------------------------ *
 * 疎通確認（MCPを介さずに単体で試せるようにしておく）
 * ------------------------------------------------------------------ */

async function check() {
  console.log('共有フォルダ: ' + TEMP_DIR);
  console.log('存在するか  : ' + (existsSync(TEMP_DIR) ? 'はい' : 'いいえ'));
  if (existsSync(TEMP_DIR)) {
    const files = readdirSync(TEMP_DIR);
    console.log('中身        : ' + (files.length ? files.join(', ') : '(空)'));
  }
  console.log('');
  console.log('Premiere へ問い合わせています…');
  try {
    const r = await HANDLERS.premiere_status();
    console.log(r.content[0].text);
    console.log('\n疎通できました。');
    return 0;
  } catch (e) {
    console.error('\n失敗しました:\n' + (e && e.message ? e.message : String(e)));
    return 1;
  }
}

/* ------------------------------------------------------------------ *
 * JSON-RPC / stdio
 * ------------------------------------------------------------------ */

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}
function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return;

  try {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO
        });

      case 'ping':
        return reply(id, {});

      case 'tools/list':
        return reply(id, { tools: TOOLS });

      case 'tools/call': {
        const name = params?.name;
        const args = params?.arguments || {};
        const fn = HANDLERS[name];
        if (!fn) return replyError(id, -32602, `不明なツールです: ${name}`);
        try {
          return reply(id, await fn(args));
        } catch (e) {
          /* ツール実行の失敗はプロトコルエラーにしない。
             理由を本文で返して、呼び出し側が読めるようにする。 */
          return reply(id, {
            content: [{ type: 'text', text: 'エラー: ' + (e && e.message ? e.message : String(e)) }],
            isError: true
          });
        }
      }

      case 'resources/list':
        return reply(id, { resources: [] });

      case 'prompts/list':
        return reply(id, { prompts: [] });

      default:
        return replyError(id, -32601, `未対応のメソッドです: ${method}`);
    }
  } catch (e) {
    return replyError(id, -32603, e && e.message ? e.message : String(e));
  }
}

if (process.argv.includes('--check')) {
  check().then((code) => process.exit(code));
} else {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSONの解析に失敗しました' } });
        continue;
      }
      handle(msg);
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
