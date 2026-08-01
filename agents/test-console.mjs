#!/usr/bin/env node
/*
 * test-console.mjs
 *
 * 対話コンソールの検証。実際にコマンドを流し込んで応答を確認する。
 *
 * 実行: node agents/test-console.mjs
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITES, frame, renderSprite } from './sprites.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSOLE = resolve(__dirname, 'console.mjs');

let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

/** コンソールへ入力を流して出力をまとめて受け取る */
function run(input, timeoutMs = 30000) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [CONSOLE, '--no-color'], {
      cwd: resolve(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '', err = '';
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });

    const t = setTimeout(() => { p.kill('SIGKILL'); rej(new Error('コンソールが終了しません')); }, timeoutMs);
    p.on('exit', (code) => { clearTimeout(t); res({ out, err, code }); });

    p.stdin.write(input.endsWith('\n') ? input : input + '\n');
    p.stdin.write('/quit\n');
    p.stdin.end();
  });
}

/* ------------------------------------------------------------------ */
/* スプライト                                                          */
/* ------------------------------------------------------------------ */

const ROLES = ['cto', 'director', 'common-manual', 'project-manual', 'design', 'telop', 'mcp'];

check('スプライトが11体ある', Object.keys(SPRITES).length === 11, Object.keys(SPRITES).join(', '));

for (const r of ROLES) {
  check(`${r} に idle と work がある`,
    !!SPRITES[r]?.idle && !!SPRITES[r]?.work);
}

for (const r of ROLES) {
  const idle = frame(r, 'idle');
  const work = frame(r, 'work');
  check(`${r} の idle と work が違う絵`,
    idle.join('') !== work.join(''), '同じだと動いて見えません');
}

/* 色あり・色なしで行数が揃うこと（横並びレイアウトが崩れないため） */
for (const r of ROLES) {
  const color = renderSprite(frame(r), false);
  const mono = renderSprite(frame(r), true);
  check(`${r} は色あり・色なしとも8行`,
    color.length === 8 && mono.length === 8,
    `色あり${color.length}行 / 色なし${mono.length}行`);
}

/* 未知の名前でも落ちない */
check('未知の役割名で mcp にフォールバックする',
  frame('no-such-role').join('') === frame('mcp').join(''));

/* ------------------------------------------------------------------ */
/* コンソール                                                          */
/* ------------------------------------------------------------------ */

const run1 = await run('/team');
check('起動して正常終了する', run1.code === 0, `終了コード ${run1.code} / stderr: ${run1.err.slice(0, 80)}`);
check('MCPへ接続できる', run1.out.includes('MCPツール'), run1.out.slice(0, 60));
check('ツール数を表示する', /MCPツール\s*16個/.test(run1.out), (run1.out.match(/MCPツール\s*\d+個/) || [])[0] || 'なし');
check('チームを表示する', run1.out.includes('制作チーム'));
for (const r of ['cto', 'director', 'common-manual', 'project-manual', 'design', 'telop']) {
  check(`チーム表示に ${r} が出る`, run1.out.includes(r));
}
check('CTOが制作チームの外と分けて表示される', run1.out.includes('制作チームの外から監査'));
check('ドット絵が描画される', /[█▀▄]/.test(run1.out));

const help = await run('/help');
check('/help がコマンド一覧を出す', help.out.includes('/audit') && help.out.includes('/telop'));
check('/help が生成しないことを明示する', help.out.includes('文章を生成しません'));

const rule = await run('/rule テロップ 文字数');
check('/rule がマニュアルを検索する', rule.out.includes('15〜18'), rule.out.slice(0, 60));

const free = await run('音量の基準は');
check('スラッシュなしで検索になる', free.out.includes('検索:'), free.out.slice(0, 60));

const notFound = await run('ぬわぬわ存在しない語句');
check('見つからないとき担当役割を案内する',
  notFound.out.includes('担当役割へ渡してください') || notFound.out.includes('推測で補わず'));

const proc = await run('/process 8');
check('/process が工程を出す', proc.out.includes('見出し・画像・図解・演出'));
check('/process が矛盾を明示する', proc.out.includes('矛盾・要決定'));

const num = await run('/num 音量');
check('/num が数値基準を出す',
  num.out.includes('-6.0') && num.out.includes('-20.0') && num.out.includes('-29.0'));

const list = await run('/list improvement');
check('/list improvement が正式でないと明示する',
  list.out.includes('正式チェック項目ではありません'));

const conf = await run('/conflicts');
check('/conflicts が矛盾を出す', conf.out.includes('6秒に1回') && conf.out.includes('10秒に1回'));
check('/conflicts が独断解決を禁じる', conf.out.includes('独断で解決しないでください'));

const roleCmd = await run('/role telop');
check('/role が役割定義を出す', roleCmd.out.includes('フレームずれを出さないこと'));
check('/role が共通制約を付ける', roleCmd.out.includes('担当外の判断は handoff で渡す'));

const roleBad = await run('/role no-such-role');
check('/role の未知名で使える役割を案内する', roleBad.out.includes('使える役割'));

const check1 = await run('/check Youtubeで全ての動画を見る、これは凄い!');
check('/check が表記揺れを検出する',
  check1.out.includes('YouTube') && check1.out.includes('すべて'));

const telopCmd = await run('/telop 00:00:01,000 --> 00:00:03,000 今日はですね、動画編集の話です。');
check('/telop が整形結果を出す', telopCmd.out.includes('整形後') || telopCmd.out.includes('テロップ整形'));

const tpl = await run('/tpl 進捗報告');
check('/tpl がテンプレートを出す', tpl.out.includes('【進捗報告】'));

const design = await run('/design');
check('/design が制作ルールを出す', design.out.includes('3色以内'));
check('/design が画像生成不可を伝える', design.out.includes('Codex 側で行ってください'));

const tools = await run('/tools');
check('/tools がツール一覧を出す',
  tools.out.includes('manual_search') && tools.out.includes('get_agent_role'));

const unknown = await run('/nosuchcommand');
check('知らないコマンドで案内する', unknown.out.includes('知らないコマンドです'));

const audit = await run('/audit', 60000);
check('/audit が監査を実行する', /監査結果:\s*(GO|NO-GO)/.test(audit.out),
  (audit.out.match(/監査結果:\s*\S+/) || [])[0] || 'なし');

const projects = await run('/projects');
check('/projects が応答する', projects.out.includes('案件') || projects.out.includes('登録'));

/* 空入力・連続コマンドで壊れないこと */
const multi = await run('\n\n/help\n\n/tools');
check('空行を挟んでも壊れない', multi.code === 0 && multi.out.includes('manual_search'));

/* ------------------------------------------------------------------ */

console.log('\n=== 対話コンソールの検証 ===\n');
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
