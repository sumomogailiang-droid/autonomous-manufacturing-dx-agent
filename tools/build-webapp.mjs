#!/usr/bin/env node
/*
 * build-webapp.mjs
 *
 * ビジュアライザーを1枚のHTMLへまとめる。
 *
 * === なぜ必要か ===
 *
 * 開発中は index.html + 5本のJS + CSS という構成で見ている。
 * これはローカルでファイルを開く分には問題ないが、
 *
 *   - 配布するとファイルが散らばる
 *   - ホスティング先によっては外部ファイルの読み込みが止められる
 *   - 1本でも読み込みに失敗すると白い画面になる
 *
 * ので、配布用にはすべてを1ファイルへ入れる。
 * 外部への通信が一切ないため、開けばそのまま動く。
 *
 * === 出力の形 ===
 *
 * 既定では <!DOCTYPE html> から始まる完全なHTMLを出す（そのまま開ける）。
 * --fragment を付けると <title> / <style> / 本文 / <script> だけを出す。
 * ページの外枠を自前で用意するホスティング（Claudeのアーティファクト等）向け。
 *
 * === 使い方 ===
 *
 *   node tools/build-webapp.mjs                    → dist/index.html
 *   node tools/build-webapp.mjs --fragment out.html
 *
 * manual-data.js や役割定義を変えたら、先に生成物を作り直すこと。
 *   node agents/build-knowledge.mjs
 *   node tools/build-plugin-data.mjs
 *   node tools/build-office-data.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'video-manual-visualizer');

/* index.html が読み込んでいる順番と同じにする。順番が変わると壊れる。 */
const SCRIPTS = [
  'manual-data.js',
  'office-data.js',
  'office.js',
  'office-panel.js',
  'app.js'
];

function read(name) {
  return readFileSync(join(SRC, name), 'utf8');
}

/**
 * インラインの <script> の中で "</script>" が現れると、そこでタグが閉じてしまう。
 * JSとしての意味を変えずに分割して逃がす。
 */
function safeForInlineScript(js) {
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

/** <style> の中で "</style>" が現れた場合も同様に逃がす。 */
function safeForInlineStyle(css) {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

function build() {
  const html = read('index.html');
  const css = read('styles.css');

  /* index.html から本文だけを取り出す。外枠は用途に応じて付け直す。 */
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) throw new Error('index.html の <body> を読み取れませんでした');

  /* 外部ファイルの読み込みタグは、中身を埋め込むので取り除く。 */
  const body = bodyMatch[1].replace(/\s*<script\s+src="[^"]*"><\/script>/gi, '').trim();

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '動画編集者 全体マニュアル ビジュアライザー';

  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const description = descMatch ? descMatch[1] : '';

  const js = SCRIPTS.map((name) => {
    const code = read(name);
    return `/* ===== ${name} ===== */\n${safeForInlineScript(code)}`;
  }).join('\n\n');

  return {
    title,
    description,
    style: safeForInlineStyle(css),
    body,
    js,
    scripts: SCRIPTS
  };
}

function fragment(b) {
  return [
    `<title>${b.title}</title>`,
    '<style>',
    b.style,
    '</style>',
    b.body,
    '<script>',
    b.js,
    '</script>',
    ''
  ].join('\n');
}

function fullPage(b) {
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${b.title}</title>`,
    b.description ? `<meta name="description" content="${b.description}">` : '',
    '<meta name="color-scheme" content="light dark">',
    '<style>',
    b.style,
    '</style>',
    '</head>',
    '<body>',
    b.body,
    '<script>',
    b.js,
    '</script>',
    '</body>',
    '</html>',
    ''
  ].filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const asFragment = args.includes('--fragment');
const rest = args.filter((a) => a !== '--fragment');
const out = rest[0] || (asFragment ? join(ROOT, 'dist/office-app.html') : join(ROOT, 'dist/index.html'));

const b = build();
const text = asFragment ? fragment(b) : fullPage(b);

/* 出来上がりが外部へ通信していないことを確かめる。
   AGENTS.md でURLの推測を禁止しており、オフラインで動くことが前提のため。 */
const external = text.match(/(?:src|href)\s*=\s*"(https?:)?\/\/[^"]+"/gi);
if (external) {
  console.error('外部ファイルを参照しています。1ファイルで完結していません:');
  for (const e of new Set(external)) console.error('  ' + e);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text, 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log(`形式        : ${asFragment ? '本文のみ（外枠なし）' : '完全なHTML'}`);
console.log(`取り込み    : ${b.scripts.join(' → ')}`);
console.log(`外部参照    : なし`);
console.log(`出力        : ${out.replace(ROOT + '/', '')}  ${kb(Buffer.byteLength(text))}`);
