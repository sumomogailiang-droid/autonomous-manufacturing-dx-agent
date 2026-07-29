#!/usr/bin/env node
/*
 * test-mcp.mjs
 * MCPサーバーの疎通テスト。JSON-RPCを実際に流して応答を検証する。
 *
 * 実行: node agents/test-mcp.mjs
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, 'mcp-server.mjs');

let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

const srv = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });

const pending = new Map();
let buf = '';
srv.stdout.setEncoding('utf8');
srv.stdout.on('data', (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const r = pending.get(msg.id);
    if (r) { pending.delete(msg.id); r(msg); }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((res) => {
    pending.set(id, res);
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function bodyOf(msg) {
  return msg?.result?.content?.[0]?.text ?? '';
}

const run = async () => {
  /* initialize */
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' }
  });
  check('initialize が成功する', init.result?.serverInfo?.name === 'video-manual', JSON.stringify(init.result?.serverInfo));
  check('protocolVersion を返す', !!init.result?.protocolVersion, init.result?.protocolVersion);

  /* tools/list */
  const tools = await rpc('tools/list', {});
  const names = (tools.result?.tools || []).map((t) => t.name);
  check('tools/list が12ツールを返す', names.length === 12, `${names.length}件: ${names.join(', ')}`);
  for (const expected of [
    'manual_search', 'get_process', 'get_numeric_standards', 'check_notation',
    'get_checklist', 'get_template', 'list_conflicts', 'get_accident_map',
    'get_design_rules', 'format_telop', 'list_projects', 'get_project_rules'
  ]) {
    check(`ツール ${expected} が存在する`, names.includes(expected));
  }
  check('全ツールに description と inputSchema がある',
    (tools.result?.tools || []).every((t) => t.description && t.inputSchema));

  /* manual_search */
  const s1 = await rpc('tools/call', { name: 'manual_search', arguments: { query: 'テロップ 文字数' } });
  check('manual_search がテロップの文字数を返す', bodyOf(s1).includes('15〜18'), bodyOf(s1).slice(0, 60));

  const s2 = await rpc('tools/call', { name: 'manual_search', arguments: { query: 'ぬわぬわ存在しない語' } });
  check('manual_search が0件時に推測を促さない',
    bodyOf(s2).includes('推測で補わず'), bodyOf(s2).slice(0, 60));

  /* get_process */
  const p1 = await rpc('tools/call', { name: 'get_process', arguments: {} });
  check('get_process 一覧が13工程を返す',
    (bodyOf(p1).match(/^\d+\. \*\*/gm) || []).length === 13);

  const p2 = await rpc('tools/call', { name: 'get_process', arguments: { no: 8 } });
  check('get_process(8) が矛盾を明示する', bodyOf(p2).includes('矛盾・要決定'), bodyOf(p2).slice(0, 60));

  const p3 = await rpc('tools/call', { name: 'get_process', arguments: { no: 99 } });
  check('get_process(99) がエラーを返す', p3.result?.isError === true, bodyOf(p3));

  /* get_numeric_standards */
  const n1 = await rpc('tools/call', { name: 'get_numeric_standards', arguments: { group: '音量' } });
  check('数値基準が -6.0 / -20.0 / -29.0 を返す',
    bodyOf(n1).includes('-6.0') && bodyOf(n1).includes('-20.0') && bodyOf(n1).includes('-29.0'));

  /* check_notation */
  const c1 = await rpc('tools/call', {
    name: 'check_notation',
    arguments: { text: 'Youtubeで全ての動画を見る、これは凄い!', as_telop: true }
  });
  const c1b = bodyOf(c1);
  check('check_notation が YouTube の誤表記を検出', c1b.includes('YouTube'));
  check('check_notation が「全て→すべて」を検出', c1b.includes('すべて'));
  check('check_notation が「凄い→すごい」を検出', c1b.includes('すごい'));
  check('check_notation が句読点を検出', c1b.includes('句読点'));
  check('check_notation が半角記号を検出', c1b.includes('半角記号'));

  const c2 = await rpc('tools/call', {
    name: 'check_notation',
    arguments: { text: 'これはきれいな一行です', as_telop: true }
  });
  check('check_notation が問題なしで合格を返す', bodyOf(c2).includes('合格'));

  /* get_checklist */
  const k1 = await rpc('tools/call', { name: 'get_checklist', arguments: { kind: 'official' } });
  check('正式チェックが18項目', (bodyOf(k1).match(/^\d+\. /gm) || []).length === 18);

  const k2 = await rpc('tools/call', { name: 'get_checklist', arguments: { kind: 'improvement' } });
  check('改善候補が「正式チェック項目ではありません」と明示',
    bodyOf(k2).includes('正式チェック項目ではありません'));

  const k3 = await rpc('tools/call', { name: 'get_checklist', arguments: { kind: 'clip' } });
  check('切り抜きチェックが12項目', (bodyOf(k3).match(/^\d+\. /gm) || []).length === 12);

  /* get_template */
  const t1 = await rpc('tools/call', { name: 'get_template', arguments: {} });
  check('テンプレート一覧を返す', bodyOf(t1).includes('進捗報告'));

  const t2 = await rpc('tools/call', { name: 'get_template', arguments: { title: '進捗報告' } });
  check('進捗報告テンプレートの本文を返す', bodyOf(t2).includes('【進捗報告】'));
  check('進捗報告のNG例を返す', bodyOf(t2).includes('カット8割'));

  /* list_conflicts */
  const cf = await rpc('tools/call', { name: 'list_conflicts', arguments: {} });
  const cfb = bodyOf(cf);
  check('矛盾一覧に6秒/10秒が含まれる', cfb.includes('6秒に1回') && cfb.includes('10秒に1回'));
  check('矛盾一覧にFrame.io/限定公開が含まれる', cfb.includes('Frame.io') && cfb.includes('限定公開'));
  check('矛盾一覧が独断解決を禁じている', cfb.includes('独断で解決してはいけません'));
  check('欠損リンク方針が含まれる', cfb.includes('推測しないでください'));

  /* get_design_rules */
  const d1 = await rpc('tools/call', { name: 'get_design_rules', arguments: { kind: 'all' } });
  const d1b = bodyOf(d1);
  check('図解ルールに3色以内が含まれる', d1b.includes('3色以内'));
  check('画像ルールに1,920×1,080が含まれる', d1b.includes('1,920×1,080'));
  check('デザイン4原則が含まれる', d1b.includes('整列') && d1b.includes('対比'));
  check('図解の完了条件（音量0）が含まれる', d1b.includes('音量を0'));
  check('AI利用の要確認が明示される', d1b.includes('要確認'));

  /* format_telop */
  const f1 = await rpc('tools/call', {
    name: 'format_telop',
    arguments: {
      text: '今日はですね、動画編集の基本的な流れについて解説していきます。まず最初にやることは素材確認です。',
      speaker: '木村さん'
    }
  });
  const f1b = bodyOf(f1);
  check('format_telop が整形結果を返す', f1b.includes('整形後'));
  check('format_telop が句読点を除去する', !/[、。]/.test(f1b.split('```')[1] || ''));
  check('format_telop が行ごとの文字数を出す', f1b.includes('行ごとの文字数'));
  check('format_telop が話者を反映する', f1b.includes('木村さん'));
  check('format_telop が「書き換えない」確認事項を出す', f1b.includes('直しすぎない'));

  const f2 = await rpc('tools/call', { name: 'format_telop', arguments: { text: 'あ'.repeat(60) } });
  const rows = (bodyOf(f2).match(/^\| \d+ \| \d+ \|/gm) || []);
  check('format_telop が長文を複数行へ分割する', rows.length >= 3, `${rows.length}行`);
  const over = (bodyOf(f2).match(/\| \d+ \| (\d+) \|/g) || [])
    .map((m) => Number(/\| \d+ \| (\d+) \|/.exec(m)[1]))
    .filter((n) => n > 18);
  check('format_telop の全行が18文字以内', over.length === 0, `超過: ${over.join(',')}`);

  /* projects */
  const lp = await rpc('tools/call', { name: 'list_projects', arguments: {} });
  check('list_projects が応答する', bodyOf(lp).length > 0);

  const gp = await rpc('tools/call', { name: 'get_project_rules', arguments: { project_id: 'not-exist' } });
  check('未登録案件で登録方法を案内する',
    bodyOf(gp).includes('generate-project-agent'), bodyOf(gp).slice(0, 80));

  /* 未知のメソッド */
  const unk = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
  check('未知のツールでエラーを返す', !!unk.error, JSON.stringify(unk.error));

  srv.stdin.end();

  /* 出力 */
  console.log('\n=== MCPサーバー 疎通テスト ===\n');
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
};

run().catch((e) => {
  console.error('テスト実行エラー:', e);
  process.exit(1);
});
