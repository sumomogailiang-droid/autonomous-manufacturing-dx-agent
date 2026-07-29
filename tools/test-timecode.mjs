#!/usr/bin/env node
/*
 * test-timecode.mjs
 *
 * フレーム計算の検証。テロップのフレームずれはここが狂うと必ず起きるため、
 * 総当たりで確認する。
 *
 * 実行: node tools/test-timecode.mjs
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const TC = require(resolve(__dirname, '../uxp-plugin/timecode.js'));

let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

/* ------------------------------------------------------------------ */
/* 1. フレームレートの判定                                             */
/* ------------------------------------------------------------------ */

check('29.97 を判定できる', TC.resolveRate(29.97).nominal === 30);
check('29.970029... を29.97と判定できる', TC.resolveRate(30000 / 1001).key === '29.97');
check('23.976 を判定できる', TC.resolveRate(24000 / 1001).nominal === 24);
check('25(PAL) を判定できる', TC.resolveRate(25).nominal === 25 && TC.resolveRate(25).drop === false);
check('59.94 を判定できる', TC.resolveRate(60000 / 1001).nominal === 60);
check('60 を判定できる', TC.resolveRate(60).drop === false);
check('未知のfpsはそのまま使う', Math.abs(TC.resolveRate(48).exact - 48) < 0.001);
check('NDF指定でドロップを外せる', TC.resolveRate(29.97, false).drop === false);

/* ------------------------------------------------------------------ */
/* 2. 29.97DF の既知の値（SMPTE）                                      */
/* ------------------------------------------------------------------ */

const df2997 = TC.RATES['29.97'];

const KNOWN_DF = [
  [0, '00;00;00;00'],
  [1, '00;00;00;01'],
  [29, '00;00;00;29'],
  [30, '00;00;01;00'],
  [1798, '00;00;59;28'],
  [1799, '00;00;59;29'],
  /* 1分ちょうどで 00;01;00;00 と 00;01;00;01 が飛ぶ */
  [1800, '00;01;00;02'],
  [1801, '00;01;00;03'],
  [3597, '00;01;59;29'],
  [3598, '00;02;00;02'],
  /* 10分目は間引かない */
  [17982, '00;10;00;00'],
  [17983, '00;10;00;01'],
  /* 1時間 = 107892フレーム */
  [107892, '01;00;00;00']
];

for (const [frame, expected] of KNOWN_DF) {
  const got = TC.framesToTimecode(frame, df2997);
  check(`29.97DF フレーム${frame} → ${expected}`, got === expected, `実際: ${got}`);
}

/* ------------------------------------------------------------------ */
/* 3. 往復変換（フレーム → TC → フレーム）が完全一致すること            */
/* ------------------------------------------------------------------ */

for (const key of ['23.976', '24', '25', '29.97', '29.97ND', '30', '50', '59.94', '60']) {
  const rate = TC.RATES[key];
  let mismatch = null;
  /* 0〜2時間ぶんを、境界を含めて総当たり気味に確認する */
  const samples = [];
  for (let f = 0; f < 5000; f++) samples.push(f);
  for (let f = 17970; f < 18010; f++) samples.push(f);      // 10分境界
  for (let f = 107880; f < 107920; f++) samples.push(f);    // 1時間境界
  for (let f = 0; f < 400000; f += 997) samples.push(f);    // 広域を素数間隔で

  for (const f of samples) {
    const tc = TC.framesToTimecode(f, rate);
    const back = TC.timecodeToFrames(tc, rate);
    if (back !== f) { mismatch = `フレーム${f} → ${tc} → ${back}`; break; }
  }
  check(`${rate.label} の往復変換が一致する（${samples.length}点）`, mismatch === null, mismatch || '');
}

/* ------------------------------------------------------------------ */
/* 4. 秒 → フレームの丸め                                              */
/* ------------------------------------------------------------------ */

const r30 = TC.RATES['30'];
check('0秒 → 0フレーム', TC.secondsToFrames(0, r30) === 0);
check('1秒 → 30フレーム', TC.secondsToFrames(1, r30) === 30);
check('0.5秒 → 15フレーム', TC.secondsToFrames(0.5, r30) === 15);
/* 切り捨てだと境界で1フレーム早まる。四捨五入であることを確認 */
check('0.4999秒 → 15フレーム（四捨五入）', TC.secondsToFrames(0.4999, r30) === 15);
check('0.4832秒 → 14フレーム', TC.secondsToFrames(0.4832, r30) === 14);
check('負の秒は0になる', TC.secondsToFrames(-5, r30) === 0);

const r2997 = TC.RATES['29.97'];
/* 29.97を30として計算すると1分で約1.8フレームずれる。それが起きていないこと */
const oneMinute2997 = TC.secondsToFrames(60, r2997);
check('29.97fps の60秒が1798フレーム（30fps計算の1800ではない）',
  oneMinute2997 === 1798, `実際: ${oneMinute2997}`);

const tenMin2997 = TC.secondsToFrames(600, r2997);
check('29.97fps の600秒が17982フレーム', tenMin2997 === 17982, `実際: ${tenMin2997}`);

/* ------------------------------------------------------------------ */
/* 5. SRTのミリ秒表記を読める                                          */
/* ------------------------------------------------------------------ */

check('SRT 00:00:01,500 を読める（30fps→45F）',
  TC.timecodeToFrames('00:00:01,500', r30) === 45);
check('VTT 00:00:01.500 を読める', TC.timecodeToFrames('00:00:01.500', r30) === 45);
check('SRT 01:00:00,000 を読める（30fps→108000F）',
  TC.timecodeToFrames('01:00:00,000', r30) === 108000);
check('フレーム表記 00:00:01:15 を読める',
  TC.timecodeToFrames('00:00:01:15', r30) === 45);
check('DF表記 00;01;00;02 を読める',
  TC.timecodeToFrames('00;01;00;02', r2997) === 1800);

/* ------------------------------------------------------------------ */
/* 6. テロップ配置（フレーム境界への確定）                              */
/* ------------------------------------------------------------------ */

const items = [
  { start: 1.0,  end: 3.0,  text: 'いちばん最初のテロップ' },
  { start: 3.0,  end: 5.5,  text: 'ふたつめのテロップです' },
  { start: 5.5,  end: 6.0,  text: 'みっつめ' }
];

const snapped = TC.snapToFrames(items, { rate: r30, leadFrames: 1, minFrames: 12 });

check('全項目が整数フレームになる',
  snapped.items.every((i) => Number.isInteger(i.inFrame) && Number.isInteger(i.outFrame)));

check('子音1フレーム前の前倒しが適用される',
  snapped.items[0].inFrame === 29, `実際: ${snapped.items[0].inFrame}（1.0秒=30F の1つ前）`);

check('重なりが解消される',
  snapped.items.every((it, i) => i === 0 || snapped.items[i - 1].outFrame <= it.inFrame));

const verify = TC.verifyPlacement(snapped.items);
check('配置の検証に合格する', verify.ok, JSON.stringify(verify.problems));

/* 先頭が0秒でも負にならない */
const atZero = TC.snapToFrames([{ start: 0, end: 1, text: 'あ' }], { rate: r30, leadFrames: 1 });
check('0秒開始でも負のフレームにならない', atZero.items[0].inFrame === 0);
check('0秒開始で警告が出る', atZero.warnings.some((w) => w.kind === '先頭'));

/* 重なっている入力を渡した場合 */
const overlapped = TC.snapToFrames([
  { start: 0, end: 5, text: 'ながいテロップ' },
  { start: 2, end: 6, text: 'かぶってるテロップ' }
], { rate: r30, leadFrames: 0 });
check('重なり入力で警告が出る', overlapped.warnings.some((w) => w.kind === '重なり'));
check('重なり解消後は重なっていない',
  TC.verifyPlacement(overlapped.items).ok);

/* 順序が逆の入力 */
const reversed = TC.snapToFrames([
  { start: 10, end: 12, text: 'あとの' },
  { start: 1, end: 3, text: 'さきの' }
], { rate: r30, leadFrames: 0 });
check('順序が逆でも時刻順に並ぶ', reversed.items[0].text === 'さきの');

/* シーケンス開始オフセット */
const offset = TC.snapToFrames([{ start: 1, end: 2, text: 'あ' }],
  { rate: r30, leadFrames: 0, offsetFrames: 300 });
check('オフセットが加算される', offset.items[0].inFrame === 330, `実際: ${offset.items[0].inFrame}`);

/* ------------------------------------------------------------------ */
/* 7. 累積ずれが起きないこと（最重要）                                  */
/* ------------------------------------------------------------------ */

/*
 * 1000個のテロップを2秒間隔で並べ、最後の項目が理論値と完全一致するか。
 * 秒のまま加算していく実装だと、ここで必ずずれる。
 */
const many = [];
for (let i = 0; i < 1000; i++) {
  many.push({ start: i * 2, end: i * 2 + 1.5, text: `テロップ${i}` });
}
const manySnapped = TC.snapToFrames(many, { rate: r2997, leadFrames: 0, minFrames: 1 });
const lastExpected = TC.secondsToFrames(999 * 2, r2997);
check('1000項目でも累積ずれが起きない',
  manySnapped.items[999].inFrame === lastExpected,
  `期待 ${lastExpected} / 実際 ${manySnapped.items[999].inFrame}`);
check('1000項目すべて整数フレーム',
  manySnapped.items.every((i) => Number.isInteger(i.inFrame) && Number.isInteger(i.outFrame)));
check('1000項目の配置検証に合格', TC.verifyPlacement(manySnapped.items).ok);

/* ------------------------------------------------------------------ */
/* 8. SRT書き出しがフレーム番号から生成されること                       */
/* ------------------------------------------------------------------ */

check('フレーム45 → SRT時刻 00:00:01,500（30fps）',
  TC.framesToSrtTime(45, r30) === '00:00:01,500', TC.framesToSrtTime(45, r30));
check('フレーム0 → 00:00:00,000', TC.framesToSrtTime(0, r30) === '00:00:00,000');

/* 書き出したSRT時刻を読み戻して同じフレームになること */
let srtMismatch = null;
for (let f = 0; f < 3000; f++) {
  const t = TC.framesToSrtTime(f, r2997);
  const back = TC.timecodeToFrames(t, r2997);
  if (back !== f) { srtMismatch = `フレーム${f} → ${t} → ${back}`; break; }
}
check('SRT時刻の往復でフレームが一致する（29.97fps 3000点）',
  srtMismatch === null, srtMismatch || '');

/* ------------------------------------------------------------------ */

console.log('\n=== フレーム計算の検証 ===\n');
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
