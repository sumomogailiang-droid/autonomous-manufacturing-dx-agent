#!/usr/bin/env node
/*
 * test-telop.mjs
 *
 * テロップ整形の検証。
 *
 * いちばん見つけにくい不具合は「語の途中で改行される」こと。
 * 出力自体は成立しているように見えるので、目視だと通り抜ける。
 * マニュアル（テロップ / 記号・改行・主語）が
 *
 *   意味のまとまりで改行します。
 *     NG：～と／いうと      OK：～／というと
 *     NG：～／と言っていた  OK：～と／言っていた
 *
 * と定めているため、ここを機械で押さえる。
 *
 * 実行: node tools/test-telop.mjs
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const T = require(resolve(__dirname, '../uxp-plugin/telop.js'));

let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

const len = (s) => [...String(s)].length;
const fmt = (text, opts) => T.formatTelop(text, opts || {}).lines;

/* ------------------------------------------------------------------ */
/* 1. 語の途中で改行しない                                             */
/* ------------------------------------------------------------------ */

/*
 * 語が割れているかの判定は2つ使う。
 *
 * (a) 行末・行頭に来てはいけない文字。
 *     促音・拗音・長音符は語の途中にしか現れないので、
 *     そこが行の端に来ていれば必ず語を割っている。
 *     修正前の「触らなかっ／たんです」「編集をや／って」はこれで捕まる。
 *
 * (b) 行末と次の行頭をつないだ2文字が助動詞になっていないか。
 *     修正前の「何だったんで／すか？」「ないんで／すね」はこれで捕まる。
 */
/* 行頭に来たら必ず語の途中。日本語の行頭禁則そのもの。 */
const NG_HEAD = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー」』）】、。，．！？…・';

const SPLIT_WORD = [
  'です', 'でし', 'ます', 'まし', 'ませ', 'たん', 'ない', 'なく',
  'すか', 'すね', 'すけ', 'ちゃ', 'じゃ', 'とい', 'ので', 'のに', 'んで'
];

const RE_HIRA = /[ぁ-ゟ]/;

function midWordBreaks(lines) {
  const bad = [];
  for (let i = 0; i < lines.length; i++) {
    const chars = [...lines[i]];
    const tail = chars[chars.length - 1];
    if (i > 0 && NG_HEAD.includes(chars[0])) bad.push(`行頭が「${chars[0]}」: ${lines[i]}`);
    if (i < lines.length - 1) {
      const head = [...lines[i + 1]][0];
      if (!tail || !head) continue;
      /* 促音で行を終えてひらがなへ続くのは、ほぼ確実に語の途中。
         「触らなかっ／たんです」がこれ。単独の「あっ」は行末に来てよいので、
         次の行頭がひらがなであることを条件にする。 */
      if (tail === 'っ' && RE_HIRA.test(head)) {
        bad.push(`促音で切れている: ${lines[i]} ／ ${lines[i + 1]}`);
      }
      if (SPLIT_WORD.includes(tail + head)) {
        bad.push(`「${tail + head}」が割れている: ${lines[i]} ／ ${lines[i + 1]}`);
      }
    }
  }
  return bad;
}

/* 判定器そのものの確認。これが効いていないと以下の検査は素通りする。 */
check('判定器が促音の行末を捕まえる',
  midWordBreaks(['Premiereはあんまり触らなかっ', 'たんです']).length > 0);
check('判定器が促音の行頭を捕まえる',
  midWordBreaks(['本業をデザイナーやりながら編集をや', 'って みたいな']).length > 0);
check('判定器が助動詞の分断を捕まえる',
  midWordBreaks(['デザイナーになった理由は何だったんで', 'すか？']).length > 0);
check('判定器が正しい改行を誤検出しない',
  midWordBreaks(['改めてですけど なんか', '松井くんの な キャリアがどういう']).length === 0);

/* 実素材で実際に割れていた文（修正前は「触らなかっ／たんです」になっていた） */
const REAL = [
  'Adobeのフォトショとか、イラレはよく触ってましたよ。Premiereはあんまり触らなかったんです。',
  'えー、デザイナーになった理由は何だったんですか？',
  'すごいな。なんか、あんまりハードルみたいなのないんですね。新しいスキルを身につけるのに。',
  'に、とらわれて、とらわれてるってわけじゃないんですけど、それしかなかったんで、そこから出た自分って、何もないなって思っちゃったんですね。1年ぐらい。',
  'で、本業をデザイナーやりながら編集をやって、みたいな。',
  '改めてですけど、なんか、松井くんの、な、キャリアがどういう風に上がってきたか、みたいな話って、多分、名古屋校の校舎訪問でさせてもらったと思う。',
  'お金が、まぁ、ある程度、副業で稼げたのと、あと、めっちゃ、本業がブラックというか、9時から9時まで働いてたことが全然あって、',
  'あの、その会社が前の、一番直近の会社が2社目なんですけど、転職したきっかけは、本当、手に職が欲しい、が一つありましたね。',
  '何にも受けることできず、独学でやり、形にして、で、',
  'あの時間を、副業の時間に充てた方が稼げるんじゃないか、って思って、やりましたね。'
];

let midBad = [];
for (const src of REAL) midBad = midBad.concat(midWordBreaks(fmt(src)));
check('実素材10文で語の途中の改行が出ない', midBad.length === 0, midBad.join(' / '));

/* ------------------------------------------------------------------ */
/* 2. マニュアルのNG例そのもの                                          */
/* ------------------------------------------------------------------ */

/* NG：～と／いうと　OK：～／というと ＝「という」を割らない */
const iu = fmt('この機能はですね、いわゆる自動化というものになるわけですけれども');
const splitToIu = iu.some((l, i) =>
  i < iu.length - 1 && [...l].slice(-1)[0] === 'と' && [...iu[i + 1]][0] === 'い');
check('「という」を「と／いう」に割らない', !splitToIu, iu.join(' ／ '));

/* NG：～／と言っていた　OK：～と／言っていた ＝ 「と」は前の行に残す */
const iutta = fmt('すごく良かったと言っていたので、そのまま進めることにしました');
const toAtHead = iutta.some((l) => [...l][0] === 'と' && len(l) > 1 && [...l][1] !== 'い');
check('「と」を行頭へ落とさない', !toAtHead, iutta.join(' ／ '));

/* ------------------------------------------------------------------ */
/* 3. 文字数（1行15〜18文字）                                          */
/* ------------------------------------------------------------------ */

const long = fmt(REAL[5]);
check('長文が複数行へ分かれる', long.length >= 4, `${long.length}行`);
check('全行が18文字以内', long.every((l) => len(l) <= 18),
  long.filter((l) => len(l) > 18).join(' / '));

/* 短い塊が1行に取り残されない（修正前は「な」だけの行ができた） */
const stranded = [];
for (const src of REAL) {
  for (const l of fmt(src)) if (len(l) <= 2) stranded.push(l);
}
check('2文字以下の行が生まれない', stranded.length === 0, stranded.join(' / '));

/* 目安の下限。短い発言そのものは短くて当然なので、長文だけを見る */
const shortLines = long.slice(0, -1).filter((l) => len(l) < 10);
check('長文の途中に10文字未満の行が出ない', shortLines.length === 0, shortLines.join(' / '));

/* maxChars を変えても超えない */
const narrow = fmt(REAL[5], { maxChars: 12 });
check('maxChars=12 を全行が守る', narrow.every((l) => len(l) <= 12),
  narrow.filter((l) => len(l) > 12).join(' / '));

/* ------------------------------------------------------------------ */
/* 4. 句読点・記号                                                     */
/* ------------------------------------------------------------------ */

const punct = fmt('例えば、これは犬です。とても可愛いですね。');
check('「、」「。」を残さない', !punct.some((l) => /[、。]/.test(l)), punct.join(' ／ '));
check('読点を半角スペースにする', punct.some((l) => l.includes(' ')), punct.join(' ／ '));

const marks = fmt('本当ですか!すごい?');
check('「!」を全角へ直す', marks.join('').includes('！'));
check('「?」を全角へ直す', marks.join('').includes('？'));

/* ------------------------------------------------------------------ */
/* 5. 数字                                                             */
/* ------------------------------------------------------------------ */

/* 「3、4年」は3と4年へ割らない。数字にはさまれた読点は文の区切りではない。 */
const num = fmt('元々は、僕が動画編集を始めたのは、3、4年くらい前で。');
check('「3、4年」を行で割らない', !num.some((l) => l.trim() === '3'), num.join(' ／ '));
const num2 = fmt('24、5の時に始めて。');
check('「24、5の時」を行で割らない', num2.length === 1, num2.join(' ／ '));

/* ------------------------------------------------------------------ */
/* 6. 逃げ道（切れ目が無いとき）                                        */
/* ------------------------------------------------------------------ */

const flat = T.formatTelop('あ'.repeat(60), {});
check('切れ目が無い長文も18文字以内へ収める', flat.lines.every((l) => len(l) <= 18));
check('切れ目が無い長文は複数行になる', flat.lines.length >= 3, `${flat.lines.length}行`);
check('文字数で折ったことを警告で知らせる',
  flat.warnings.some((w) => w.kind === '強制改行'),
  JSON.stringify(flat.warnings));

/* 語を壊さないために少しの超過を許すが、警告は必ず出す */
const tol = T.formatTelop('とらわれてるってわけじゃないんですけど', {});
check('許容内の超過でも語を壊さない', midWordBreaks(tol.lines).length === 0, tol.lines.join(' ／ '));

/* ------------------------------------------------------------------ */
/* 7. 入力をそのまま残す（書き換えない）                                */
/* ------------------------------------------------------------------ */

/* 話し言葉を書き言葉へ直していないか。記号・句読点以外の文字は保存されること。 */
function bareChars(s) {
  return [...String(s)].filter((c) => !/[\s、。，．]/.test(c)).join('');
}
let rewritten = [];
for (const src of REAL) {
  const before = bareChars(src);
  const after = bareChars(fmt(src).join(''));
  if (before !== after) rewritten.push(src.slice(0, 20));
}
check('本文を書き換えない（記号と空白以外は同一）', rewritten.length === 0, rewritten.join(' / '));

/* ------------------------------------------------------------------ */
/* 8. 空入力                                                           */
/* ------------------------------------------------------------------ */

check('空文字で落ちない', fmt('').length === 0);
check('空白だけで落ちない', fmt('   \n  ').length === 0);

/* ------------------------------------------------------------------ */

console.log('\n=== テロップ整形の検証 ===\n');
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
