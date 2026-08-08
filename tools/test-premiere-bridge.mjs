#!/usr/bin/env node
/*
 * test-premiere-bridge.mjs
 *
 * premiere-bridge-mcp.mjs の検証。
 *
 * Premiere が無いところで、どうやって確かめるか。
 * ブリッジとのやり取りはファイルの読み書きだけなので、
 * CEPパネル側（bridge-cep.js）と同じ動きをする偽のブリッジを立てれば、
 * 往復のすべてを再現できる。
 *
 * 偽ブリッジは本物の手順をそのままなぞる。
 *   - command- で始まる最初の1件を拾う
 *   - 同じ検査で危険なスクリプトを弾く
 *   - response- へ書き、command- を消す
 *   - 一度に1件しか処理しない
 *
 * 実行: node tools/test-premiere-bridge.mjs
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, 'premiere-bridge-mcp.mjs');
const TEMP = resolve(__dirname, '../segment-out/.bridge-test');

let failed = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

/* ------------------------------------------------------------------ */
/* 偽ブリッジ（bridge-cep.js と同じ動き）                               */
/* ------------------------------------------------------------------ */

const FORBIDDEN = [
  /eval\s*\(/i, /\bnew\s+Function\s*\(/i, /\brequire\s*\(/i,
  /\b__dirname\b/i, /\b__filename\b/i, /\bprocess\./i, /\bchild_process\b/i
];

/** スクリプトの中身から、Premiereが返しそうな結果を作る */
function fakeExecute(script) {
  if (script.includes('app.version')) {
    return { appVersion: '26.0.0', appName: 'Adobe Premiere Pro', projectName: 'テスト.prproj',
             activeSequence: { name: 'CAMP_名古屋校_編集シーケンス', videoTracks: 9, audioTracks: 9 } };
  }
  if (script.includes('numSequences') && script.includes('list.push')) {
    return { count: 2, sequences: [{ index: 0, name: 'CAMP_名古屋校_編集シーケンス' }, { index: 1, name: 'CAMPチャンネル テンプレ' }] };
  }
  if (script.includes('src.clone()')) {
    return { source: 'CAMP_名古屋校_編集シーケンス', created: [{ index: 2, name: '演出テスト' }] };
  }
  if (script.includes('t.clips.numItems')) {
    return { track: 'V3', count: 2, clips: [
      { name: 'ギリギリまでが勝負', start: 524.6, end: 528.2 },
      { name: '2. 3回ぐらいやった', start: 530.0, end: 533.5 }
    ] };
  }
  if (script.includes('createMarker')) {
    /* 実際に渡ってきた件数を数えて返す。埋め込みが壊れていれば合わなくなる。 */
    const m = script.match(/var items = (\[[\s\S]*?\]);/);
    let n = 0;
    try { n = JSON.parse(m[1]).length; } catch (e) { n = -1; }
    return { placed: n, failed: [] };
  }
  return { echo: true };
}

let bridgeTimer = null;
let busy = false;
function startFakeBridge() {
  if (!existsSync(TEMP)) mkdirSync(TEMP, { recursive: true });
  bridgeTimer = setInterval(() => {
    if (busy) return;
    let files;
    try { files = readdirSync(TEMP); } catch (e) { return; }
    for (const f of files) {
      if (!f.startsWith('command-') || !f.endsWith('.json')) continue;
      busy = true;
      const p = join(TEMP, f);
      let out;
      try {
        const cmd = JSON.parse(readFileSync(p, 'utf8'));
        const bad = FORBIDDEN.some((re) => re.test(cmd.script));
        out = bad
          ? { success: false, error: 'Script validation failed' }
          : { success: true, result: fakeExecute(cmd.script), timestamp: new Date().toISOString() };
      } catch (e) {
        out = { error: e.message, timestamp: new Date().toISOString() };
      }
      try {
        writeFileSync(p.replace('command-', 'response-'), JSON.stringify(out, null, 2), 'utf8');
        unlinkSync(p);
      } catch (e) { /* 書けなければ次の周回で拾い直す */ }
      busy = false;
      return;
    }
  }, 100);
}
function stopFakeBridge() {
  if (bridgeTimer) clearInterval(bridgeTimer);
  bridgeTimer = null;
}

/* ------------------------------------------------------------------ */
/* MCPサーバーをstdioで叩く                                            */
/* ------------------------------------------------------------------ */

function startServer() {
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PREMIERE_TEMP_DIR: TEMP },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let buf = '';
  const waiters = new Map();
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (c) => {
    buf += c;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      const w = waiters.get(msg.id);
      if (w) { waiters.delete(msg.id); w(msg); }
    }
  });
  let nextId = 1;
  const call = (method, params) => new Promise((res, rej) => {
    const id = nextId++;
    waiters.set(id, res);
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); rej(new Error('応答なし: ' + method)); } }, 30000);
  });
  return { proc, call };
}

const bodyOf = (r) => (r.result && r.result.content && r.result.content[0]) ? r.result.content[0].text : '';

/* ------------------------------------------------------------------ */

async function main() {
  if (existsSync(TEMP)) rmSync(TEMP, { recursive: true, force: true });
  mkdirSync(TEMP, { recursive: true });

  /* --- ブリッジが止まっているときの挙動を先に見る --- */
  {
    const { proc, call } = startServer();
    const t0 = Date.now();
    const r = await call('tools/call', { name: 'premiere_status', arguments: {} });
    const elapsed = Date.now() - t0;
    const t = bodyOf(r);
    check('ブリッジ停止中はエラーになる', r.result?.isError === true, t.slice(0, 40));
    check('停止中は理由を説明する', t.includes('Start Bridge') && t.includes(TEMP),
      t.slice(0, 120));
    /* 拾われないことは3秒で分かる。60秒待たせてから「タイムアウト」と言わない。 */
    check('停止中は数秒で理由を返す', elapsed < 6000, elapsed + 'ms');
    const left = readdirSync(TEMP).filter((f) => f.startsWith('command-'));
    check('拾われなかったコマンドを残さない', left.length === 0, left.join(','));
    proc.kill();
  }

  /* --- ここからブリッジを動かす --- */
  startFakeBridge();
  const { proc, call } = startServer();

  const init = await call('initialize', {});
  check('initialize が応答する', !!init.result?.serverInfo, JSON.stringify(init.result?.serverInfo));

  const list = await call('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('ツールが揃っている',
    ['premiere_status', 'premiere_list_sequences', 'premiere_duplicate_sequence',
     'premiere_list_clips', 'premiere_add_markers', 'premiere_eval'].every((n) => names.includes(n)),
    names.join(', '));

  const st = await call('tools/call', { name: 'premiere_status', arguments: {} });
  check('status が往復する', bodyOf(st).includes('CAMP_名古屋校_編集シーケンス'), bodyOf(st).slice(0, 80));

  const seqs = await call('tools/call', { name: 'premiere_list_sequences', arguments: {} });
  check('シーケンス一覧が返る', bodyOf(seqs).includes('CAMPチャンネル テンプレ'));

  const dup = await call('tools/call', {
    name: 'premiere_duplicate_sequence', arguments: { name: 'CAMP_名古屋校_編集シーケンス', newName: '演出テスト' } });
  check('複製が返る', bodyOf(dup).includes('演出テスト'));
  check('複製は元を変更しないと明記する', bodyOf(dup).includes('元のシーケンスは変更していません'));

  const clips = await call('tools/call', {
    name: 'premiere_list_clips', arguments: { trackIndex: 3, startSec: 520, endSec: 540 } });
  check('クリップ名が取れる', bodyOf(clips).includes('ギリギリまでが勝負'), bodyOf(clips).slice(0, 80));

  /* マーカーは件数が埋め込みを通って往復するかを見る */
  const markers = [];
  for (let i = 0; i < 31; i++) markers.push({ sec: 190 + i * 6, name: '演出' + (i + 1), comment: 'テスト' });
  const mk = await call('tools/call', { name: 'premiere_add_markers', arguments: { markers } });
  check('マーカー31件が欠けずに渡る', bodyOf(mk).includes('"placed": 31'), bodyOf(mk).slice(0, 120));

  /* 引用符や改行を含む文言が壊れないか */
  const tricky = [{ sec: 1, name: '演出1', comment: '「そうですね」と言った\n次の行 "quoted" \\ 円\\' }];
  const mk2 = await call('tools/call', { name: 'premiere_add_markers', arguments: { markers: tricky } });
  check('引用符や改行を含んでも壊れない', bodyOf(mk2).includes('"placed": 1'), bodyOf(mk2).slice(0, 120));

  /* 禁止語は送る前に落とす */
  const bad = await call('tools/call', {
    name: 'premiere_eval', arguments: { script: 'var x = require("fs"); return "1";' } });
  check('禁止語は送信前に止める', bad.result?.isError === true && bodyOf(bad).includes('require('),
    bodyOf(bad).slice(0, 80));
  check('禁止語のときブリッジへ投げない', readdirSync(TEMP).filter((f) => f.startsWith('command-')).length === 0);

  /* 実行後に一時ファイルを残さない */
  await call('tools/call', { name: 'premiere_status', arguments: {} });
  const leftovers = readdirSync(TEMP).filter((f) => f.startsWith('command-') || f.startsWith('response-'));
  check('往復後にファイルを残さない', leftovers.length === 0, leftovers.join(','));

  proc.kill();
  stopFakeBridge();
  rmSync(TEMP, { recursive: true, force: true });

  console.log('\n=== ブリッジ経由のPremiere操作の検証 ===\n');
  for (const r of results) {
    if (!r.ok || process.env.VERBOSE) {
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
    }
  }
  if (!process.env.VERBOSE) console.log('  ※ 合格項目の詳細は VERBOSE=1 で表示');
  console.log('\n----------------------------------------');
  console.log(`  検証項目: ${results.length} 件`);
  console.log(`  合格: ${results.length - failed} 件`);
  console.log(`  失敗: ${failed} 件`);
  console.log('----------------------------------------\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  stopFakeBridge();
  console.error('検証中にエラー: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
