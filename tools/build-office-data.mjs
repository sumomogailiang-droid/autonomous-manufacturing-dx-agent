#!/usr/bin/env node
/*
 * build-office-data.mjs
 *
 * ブラウザのオフィス画面へ渡すエージェント情報を生成する。
 *
 * === なぜ生成が必要か ===
 *
 * 役割定義は .claude/agents/*.md の1箇所だけにある（AGENTS.md の取り決め）。
 * Claude Code はサブエージェントとして直接読み、Codex は MCP 経由で受け取る。
 *
 * ところがブラウザはローカルファイルを読めない。
 * そこで uxp-plugin/data/manual-snapshot.js と同じ考え方で、
 * 定義元から生成物を作る。定義のコピーを手で持たないための仕組み。
 *
 * 色は agents/sprites.mjs の PALETTE から引く。
 * ターミナルのドット絵とブラウザのオフィスで色が食い違わないようにするため。
 *
 *   .claude/agents/*.md ─┐
 *                        ├─→ video-manual-visualizer/office-data.js
 *   agents/sprites.mjs ──┘
 *
 * === 使い方 ===
 *
 *   node tools/build-office-data.mjs
 *
 * 役割定義を編集したら必ず再実行すること。
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE } from '../agents/sprites.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROLES_DIR = join(ROOT, '.claude/agents');
const OUT = join(ROOT, 'video-manual-visualizer/office-data.js');

/* ------------------------------------------------------------------ *
 * 席の割り当て
 *
 * AGENTS.md の体制図をそのまま間取りにする。
 *   CTO は制作チームの外から監査するため、一段高い別席。
 *   制作チームの6メンバーは同じフロアに並べ、互いに連携できることを示す。
 *   MCP は人ではなく設備なので、机ではなくサーバーラックとして描く。
 *
 * seat は等角グリッドの座標。desk は机の種類。
 * ------------------------------------------------------------------ */
const SEATS = {
  cto:              { seat: [6.2, 0.2], team: 'oversight', furniture: 'platform', accent: 'c', hair: 'h' },
  director:         { seat: [0.4, 3.2], team: 'production', furniture: 'desk',    accent: 'm', hair: 'h' },
  'common-manual':  { seat: [3.3, 3.2], team: 'production', furniture: 'desk',    accent: 'b', hair: 'h' },
  'project-manual': { seat: [6.2, 3.2], team: 'production', furniture: 'desk',    accent: 'o', hair: 'h' },
  design:           { seat: [0.4, 6.2], team: 'production', furniture: 'desk',    accent: 'p', hair: 'h' },
  telop:            { seat: [3.3, 6.2], team: 'production', furniture: 'desk',    accent: 'e', hair: 'h' },
  mcp:              { seat: [6.2, 6.2], team: 'production', furniture: 'rack',    accent: 'g', hair: null }
};

/* 実行環境。AGENTS.md の分担表と一致させる。 */
const RUNTIME = {
  cto: 'Claude Code',
  director: 'Claude Code',
  'common-manual': 'Claude Code',
  'project-manual': 'Claude Code',
  design: 'Codex',
  telop: 'Codex',
  mcp: '共通'
};

/* MCPサーバーは .claude/agents に定義ファイルを持たない（人ではなく設備）。
   ここだけは実体に合わせて手で書く。出典は AGENTS.md。 */
const MCP_ENTRY = {
  id: 'mcp',
  label: 'MCPサーバー',
  title: 'MCPサーバー',
  description:
    '制作チーム全員の接続口。Claude Code と Codex の両方がここへ繋ぎ、同じ根拠を参照する。' +
    '役割定義・マニュアル・数値基準・案件ルールはすべてこのサーバー越しに配る。',
  tools: [],
  model: null,
  isEquipment: true,
  sourceFile: 'agents/mcp-server.mjs'
};

/** YAMLフロントマターを読む。値にコロンが含まれるため最初のコロンだけで割る。 */
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length).trim() };
}

/** 本文の見出しを拾う。クリックしたときに何が書いてあるか一覧で出すため。 */
function headings(body) {
  return body
    .split(/\r?\n/)
    .filter((l) => /^#{1,3}\s+\S/.test(l))
    .map((l) => l.replace(/^#+\s+/, '').trim());
}

function build() {
  const files = readdirSync(ROLES_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort();

  const agents = [];

  for (const file of files) {
    const raw = readFileSync(join(ROLES_DIR, file), 'utf8');
    const { meta, body } = parseFrontMatter(raw);
    const id = meta.name || file.replace(/\.md$/, '');
    const heads = headings(body);

    if (!SEATS[id]) {
      throw new Error(
        `席が未定義のエージェントがあります: ${id}\n` +
          `tools/build-office-data.mjs の SEATS へ追加してください。`
      );
    }

    agents.push({
      id,
      /* H1 を日本語名として使う。無ければ id で代用する。 */
      label: (heads[0] || id).replace(/（.*?）/g, '').trim(),
      title: heads[0] || id,
      description: meta.description || '',
      tools: (meta.tools || '').split(',').map((s) => s.trim()).filter(Boolean),
      model: meta.model || null,
      sections: heads.slice(1),
      isEquipment: false,
      sourceFile: `.claude/agents/${file}`
    });
  }

  agents.push({ ...MCP_ENTRY, sections: [] });

  /* 席・色・実行環境を合流させる */
  for (const a of agents) {
    const s = SEATS[a.id];
    a.seat = s.seat;
    a.team = s.team;
    a.furniture = s.furniture;
    a.accent = PALETTE[s.accent];
    a.accentLight = PALETTE[s.accent.toUpperCase()] || PALETTE[s.accent];
    a.hair = s.hair ? PALETTE[s.hair] : null;
    a.runtime = RUNTIME[a.id] || '共通';
  }

  /* 席の重複は間取りが壊れるので生成時に落とす */
  const seen = new Set();
  for (const a of agents) {
    const key = a.seat.join(',');
    if (seen.has(key)) throw new Error(`席が重複しています: ${a.id} (${key})`);
    seen.add(key);
  }

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: '.claude/agents/*.md + agents/sprites.mjs',
    note: 'このファイルは tools/build-office-data.mjs が生成します。手で編集しないでください。',
    palette: {
      skin: PALETTE.s,
      hair: PALETTE.h,
      outline: PALETTE.k,
      paper: PALETTE.w,
      furniture: PALETTE.g,
      furnitureDark: PALETTE.G,
      warn: PALETTE.r
    },
    floor: { w: 9, d: 8 },
    agents
  };
}

const data = build();

/* URLが混入していないか確認する。
   AGENTS.md でURLの推測を禁止しており、原本で5件のURLが欠損しているため。 */
const serialized = JSON.stringify(data, null, 2);
const urls = serialized.match(/https?:\/\/[^\s"']+/g);
if (urls) {
  console.error('生成データにURLが含まれています。推測補完の疑いがあります:');
  for (const u of new Set(urls)) console.error('  ' + u);
  process.exit(1);
}

const out = `/*
 * office-data.js
 *
 * ${data.note}
 * 情報源: ${data.source}
 *
 * 役割定義は .claude/agents/*.md の1箇所だけにあります。
 * ここへ直接書き足すと、Claude Code / Codex と食い違います。
 */
(function (root, factory) {
  var data = factory();
  root.OFFICE_DATA = data;
  if (typeof module === 'object' && module.exports) { module.exports = data; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return ${serialized.split('\n').join('\n  ')};
});
`;

writeFileSync(OUT, out, 'utf8');

console.log(`エージェント : ${data.agents.length}名（設備を含む）`);
for (const a of data.agents) {
  console.log(`  ${a.id.padEnd(15)} ${a.runtime.padEnd(12)} 席 ${a.seat.join(', ')}`);
}
console.log(`\n出力         : ${OUT.replace(ROOT + '/', '')}`);
