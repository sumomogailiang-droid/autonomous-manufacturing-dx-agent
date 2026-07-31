#!/usr/bin/env node
/*
 * mcp-server.mjs
 *
 * 動画編集マニュアル MCPサーバー（stdio / JSON-RPC 2.0）
 *
 * Claude Code・Codex CLI・その他のMCP対応クライアントから、
 * 共通マニュアルと案件別マニュアルへ同じインターフェースで接続するためのもの。
 *
 * 外部依存なし。Node.js 18以降で動作する。
 *
 * 起動:
 *   node agents/mcp-server.mjs
 *
 * 接続設定は agents/README.md を参照。
 */

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const ROOT = resolve(__dirname, '..');
const DATA = require(resolve(ROOT, 'video-manual-visualizer/manual-data.js'));
const KNOWLEDGE = resolve(__dirname, 'knowledge/common-manual.md');
const PROJECTS_DIR = resolve(__dirname, 'knowledge/projects');
const ROLES_DIR = resolve(ROOT, '.claude/agents');

const SERVER_INFO = { name: 'video-manual', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

/* ------------------------------------------------------------------ */
/* ヘルパー                                                            */
/* ------------------------------------------------------------------ */

const RULE_LABEL = {
  official: '正式記載',
  project: '案件依存',
  conflict: '矛盾・要決定',
  improvement: '改善候補（正式ルールではない）'
};

function loadCommonManual() {
  if (!existsSync(KNOWLEDGE)) {
    throw new Error('知識ベースが未生成です。`node agents/build-knowledge.mjs` を実行してください。');
  }
  return readFileSync(KNOWLEDGE, 'utf8');
}

function listProjectIds() {
  if (!existsSync(PROJECTS_DIR)) return [];
  return readdirSync(PROJECTS_DIR)
    /* README.md は説明ファイルであって案件ではない */
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => basename(f, '.md'))
    .sort();
}

function loadProject(projectId) {
  const p = resolve(PROJECTS_DIR, `${projectId}.md`);
  if (!p.startsWith(PROJECTS_DIR)) throw new Error('不正な案件IDです。');
  if (!existsSync(p)) {
    const available = listProjectIds();
    throw new Error(
      `案件マニュアルが未登録です: ${projectId}\n` +
      (available.length ? `登録済み: ${available.join(', ')}` : '登録済みの案件はありません。') +
      '\n登録: node agents/generate-project-agent.mjs <案件マニュアルのパス> <案件ID>'
    );
  }
  return readFileSync(p, 'utf8');
}

function text(s) {
  return { content: [{ type: 'text', text: s }] };
}

/*
 * 制作チームの役割定義は .claude/agents/*.md を唯一の定義元とする。
 * Claude Code はこれをサブエージェントとして直接読み、
 * Codex など他のクライアントは MCP 経由で同じ内容を受け取る。
 * 定義を二重に持たないため、片方だけが古くなることがない。
 */
function listRoleFiles() {
  if (!existsSync(ROLES_DIR)) return [];
  return readdirSync(ROLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
    .sort();
}

function loadRole(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name || ''))) {
    throw new Error(`役割名の形式が正しくありません: ${name}`);
  }
  const p = resolve(ROLES_DIR, `${name}.md`);
  if (!p.startsWith(ROLES_DIR)) throw new Error('不正な役割名です。');
  if (!existsSync(p)) {
    throw new Error(
      `役割が見つかりません: ${name}\n` +
      `使える役割: ${listRoleFiles().join(', ')}`
    );
  }
  const raw = readFileSync(p, 'utf8');

  /* frontmatter を分離する */
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) return { name, description: '', body: raw.trim() };

  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { name, description: meta.description || '', tools: meta.tools || '', body: m[2].trim() };
}

/* 見出し単位でMarkdownを分割 */
function splitSections(md) {
  const lines = md.split('\n');
  const sections = [];
  let cur = { heading: '(冒頭)', level: 0, body: [] };
  for (const line of lines) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      sections.push(cur);
      cur = { heading: m[2].trim(), level: m[1].length, body: [] };
    } else {
      cur.body.push(line);
    }
  }
  sections.push(cur);
  return sections.filter((s) => s.body.join('').trim() || s.heading !== '(冒頭)');
}

/* ------------------------------------------------------------------ */
/* ツール定義                                                          */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: 'manual_search',
    description:
      '共通マニュアル（および指定した案件マニュアル）を全文検索し、該当する見出しと本文を返す。' +
      'ルールを調べるときは、まずこれを使う。記憶や一般論で答えないこと。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '検索語。例: テロップ 文字数 / 音量 / 提出方法' },
        project_id: { type: 'string', description: '案件ID（省略可）。指定すると案件マニュアルも検索する。' },
        limit: { type: 'integer', description: '返す見出しの最大数（既定10）', default: 10 }
      },
      required: ['query']
    }
  },
  {
    name: 'get_process',
    description:
      '制作工程（全13工程）の詳細を返す。何をするか・なぜ必要か・よくある失敗・完了条件・関連マニュアルを含む。' +
      '工程番号を省略すると13工程の一覧を返す。',
    inputSchema: {
      type: 'object',
      properties: {
        no: { type: 'integer', description: '工程番号（1〜13）。省略すると一覧。' }
      }
    }
  },
  {
    name: 'get_numeric_standards',
    description:
      '数値基準（音量・文字数・画角・画像サイズ・期限・費用など36件）を返す。' +
      '数字・単位・条件は絶対に変更しないこと。groupを指定すると絞り込む。',
    inputSchema: {
      type: 'object',
      properties: {
        group: {
          type: 'string',
          description: 'グループ名。音量・音声処理 / テロップ / 演出・画角 / 画像・モザイク / 切り抜き動画 / 時間・期限・費用'
        },
        query: { type: 'string', description: '項目名の部分一致（省略可）' }
      }
    }
  },
  {
    name: 'check_notation',
    description:
      'テキストを表記揺れ辞書（122件）と照合し、誤表記を検出する。' +
      'テロップ本文・連絡文の校正に使う。句読点・1行文字数・全角記号も併せて確認する。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '検査するテキスト。改行区切りで複数行可。' },
        as_telop: {
          type: 'boolean',
          description: 'テロップとして検査するか（既定true）。trueだと1行15〜18文字・句読点不使用も判定する。',
          default: true
        }
      },
      required: ['text']
    }
  },
  {
    name: 'get_checklist',
    description:
      '提出前チェックリストを返す。kind=official は正式18項目、kind=improvement は改善候補12項目（正式ではない）、' +
      'kind=clip は切り抜き納品前チェック12項目。改善候補を正式ルールとして扱わないこと。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['official', 'improvement', 'clip'], default: 'official' }
      }
    }
  },
  {
    name: 'get_template',
    description:
      '連絡テンプレート（18件）を返す。titleを省略すると一覧を返す。' +
      '進捗報告・素材確認・提出連絡・トラブル報告・修正確認依頼など。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'テンプレート名の部分一致。省略すると一覧。' }
      }
    }
  },
  {
    name: 'list_conflicts',
    description:
      'マニュアル内の矛盾・欠損リンク・要確認事項を返す。' +
      'これらは独断で解決してはいけない。回答時は必ず両方の基準を提示し、ディレクター確認を促すこと。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_accident_map',
    description:
      '事故防止マップ（16件）を「原因 → 起きる事故 → 防止策 → 最終確認」の形で返す。' +
      'ruleType=improvement のものは正式ルールではない。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'タイトル・原因の部分一致（省略可）' }
      }
    }
  },
  {
    name: 'get_design_rules',
    description:
      '図解・画像・テロップの制作ルールをまとめて返す。画像生成や図解作成の前に必ず呼ぶこと。' +
      '使用色3色以内、全画面画像は1,920×1,080以上、デザイン4原則、セーフマージン、演者の顔に被せない等の制約が含まれる。' +
      'kind で design（図解）/ image（画像演出）/ telop（テロップ）/ all を切り替える。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['design', 'image', 'telop', 'all'], default: 'all' }
      }
    }
  },
  {
    name: 'format_telop',
    description:
      '文字起こしテキストを、マニュアルの表示ルールに沿ったテロップ行へ整形する。' +
      '1行15〜18文字、句読点を半角スペースへ、半角記号を全角へ、意味のまとまりで改行する。' +
      '**文章を綺麗に書き換えない。** 話し言葉はそのまま残し、改行位置と表記だけを整える。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '文字起こしテキスト' },
        max_chars: { type: 'integer', description: '1行の最大文字数（既定18）', default: 18 },
        speaker: { type: 'string', description: '話者名（省略可）。複数話者の色分け確認に使う。' }
      },
      required: ['text']
    }
  },
  {
    name: 'governance_audit',
    description:
      '全エージェント・全成果物を機械的に監査し、出荷可否（GO / NO-GO）を返す。' +
      'リリース前、または「全部チェックして」と言われたときに必ず呼ぶ。' +
      'データ整合性・ルール分離・URL推測の有無・検証スイート・エージェント登録・未解決事項・成果物を検査する。' +
      '印象で「問題ありません」と答えず、必ずこの結果に基づいて判定すること。',
    inputSchema: {
      type: 'object',
      properties: {
        only_failures: { type: 'boolean', description: '失敗した項目だけ返す（既定false）', default: false }
      }
    }
  },
  {
    name: 'list_agents',
    description:
      '制作チームの役割一覧を返す。どの役割に任せるか決めるとき、' +
      '自分の担当外の判断を渡す先を探すときに使う。' +
      'Codexなどサブエージェント機能を持たないクライアントは、これで役割を選び get_agent_role で読み込む。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_agent_role',
    description:
      '指定した役割の定義を全文で返す。返ってきた内容を自分の指示として読み込み、' +
      'その役割として振る舞うこと。Claude Code のサブエージェントと同じ定義を使うため、' +
      '実行環境が違っても判断が食い違わない。',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '役割名。common-manual / project-manual / director / cto / design / telop'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'handoff',
    description:
      '担当外の判断を他の役割へ渡すための引き継ぎメモを作る。' +
      '「何を・なぜ・どの根拠で」を揃えた形式で出力し、渡す先の役割定義も併せて返す。' +
      '担当外の判断を自分で抱え込まないこと。',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '渡す先の役割名' },
        what: { type: 'string', description: '何を判断してほしいか' },
        why: { type: 'string', description: 'なぜ自分では決められないか' },
        evidence: { type: 'string', description: '根拠（マニュアルの該当箇所・数値・検出した事象）' },
        from: { type: 'string', description: '渡す側の役割名（省略可）' }
      },
      required: ['to', 'what', 'why']
    }
  },
  {
    name: 'list_projects',
    description: '登録済みの案件マニュアル一覧を返す。案件別の判断をする前に、案件が登録されているか確認する。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_project_rules',
    description:
      '指定した案件のマニュアルを返す。共通マニュアルより案件側が優先される。' +
      '案件マニュアルに記載がない項目は共通マニュアルを継承する。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '案件ID' }
      },
      required: ['project_id']
    }
  }
];

/* ------------------------------------------------------------------ */
/* ツール実装                                                          */
/* ------------------------------------------------------------------ */

const HANDLERS = {
  manual_search({ query, project_id, limit = 10 }) {
    if (!query || !query.trim()) throw new Error('query が空です。');
    const terms = query.trim().split(/\s+/).filter(Boolean);

    const sources = [{ label: '共通マニュアル', md: loadCommonManual() }];
    if (project_id) {
      sources.push({ label: `案件マニュアル(${project_id})`, md: loadProject(project_id) });
    }

    const hits = [];
    for (const src of sources) {
      for (const sec of splitSections(src.md)) {
        const body = sec.body.join('\n');
        const haystack = (sec.heading + '\n' + body).toLowerCase();
        let score = 0;
        for (const t of terms) {
          const tl = t.toLowerCase();
          if (sec.heading.toLowerCase().includes(tl)) score += 3;
          const n = haystack.split(tl).length - 1;
          score += Math.min(n, 5);
        }
        if (score > 0) hits.push({ src: src.label, heading: sec.heading, body, score });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    const top = hits.slice(0, Math.max(1, Math.min(limit, 30)));

    if (!top.length) {
      return text(
        `「${query}」に一致する記載は見つかりませんでした。\n\n` +
        'マニュアルに記載がない可能性があります。推測で補わず、ディレクターへ確認してください。'
      );
    }

    const parts = [`「${query}」の検索結果（${hits.length}件中 上位${top.length}件）\n`];
    for (const h of top) {
      parts.push(`\n## [${h.src}] ${h.heading}\n`);
      const trimmed = h.body.trim();
      parts.push(trimmed.length > 2200 ? trimmed.slice(0, 2200) + '\n…(以降省略)' : trimmed);
    }
    return text(parts.join('\n'));
  },

  get_process({ no }) {
    if (no === undefined || no === null) {
      const lines = ['# 制作工程 全13工程\n'];
      for (const p of DATA.processes) {
        lines.push(`${p.no}. **${p.title}** — ${p.summary}　[${RULE_LABEL[p.ruleType]}]`);
      }
      lines.push('\n工程の詳細は no を指定して取得してください。');
      return text(lines.join('\n'));
    }
    const p = DATA.processes.find((x) => x.no === Number(no));
    if (!p) throw new Error(`工程番号は1〜13で指定してください: ${no}`);

    const rel = p.related
      .map((rid) => DATA.ledger.find((l) => l.id === rid))
      .filter(Boolean)
      .map((l) => `${l.no}. ${l.title}`);

    const lines = [
      `# 工程${p.no}: ${p.title}　[${RULE_LABEL[p.ruleType]}]`,
      '',
      `**結論**: ${p.summary}`,
      '',
      '## 何をするか',
      ...p.what.map((x) => `- ${x}`),
      '',
      '## なぜ必要か',
      ...p.why.map((x) => `- ${x}`),
      '',
      '## よくある失敗',
      ...p.fails.map((x) => `- ${x}`),
      '',
      '## 完了条件',
      ...p.done.map((x) => `- ${x}`),
      ''
    ];
    if (p.conflictNote) lines.push(`> ⚠ 矛盾・要決定: ${p.conflictNote}`, '');
    if (p.improvementNote) lines.push(`> ＋ 改善候補（正式ルールではない）: ${p.improvementNote}`, '');
    lines.push(`**関連マニュアル**: ${rel.join(' / ')}`);
    return text(lines.join('\n'));
  },

  get_numeric_standards({ group, query }) {
    let groups = DATA.numericStandards;
    if (group) {
      groups = groups.filter((g) => g.group.includes(group));
      if (!groups.length) {
        throw new Error(
          `グループが見つかりません: ${group}\n` +
          `指定できる値: ${DATA.numericStandards.map((g) => g.group).join(' / ')}`
        );
      }
    }

    const lines = ['# 数値基準', '', '数字・単位・条件は変更しないこと。', ''];
    let count = 0;
    for (const g of groups) {
      const items = query ? g.items.filter((i) => i.name.includes(query) || (i.note || '').includes(query)) : g.items;
      if (!items.length) continue;
      lines.push(`## ${g.group}`, '');
      if (g.unitNote) lines.push(`${g.unitNote}`, '');
      lines.push('| 項目 | 基準値 | 種別 | 補足 |', '|---|---|---|---|');
      for (const i of items) {
        const unit = i.unit && i.unit !== '—' ? ` ${i.unit}` : '';
        lines.push(`| ${i.name} | ${i.value}${unit} | ${RULE_LABEL[i.ruleType]} | ${(i.note || '').replace(/\|/g, '\\|')} |`);
        count++;
      }
      lines.push('');
    }
    if (!count) return text(`条件に一致する数値基準はありませんでした。（group=${group || '指定なし'} query=${query || '指定なし'}）`);
    return text(lines.join('\n'));
  },

  check_notation({ text: input, as_telop = true }) {
    if (!input || !input.trim()) throw new Error('text が空です。');

    const dict = DATA.dictionary.concat(DATA.splitEditDictionary);
    const lines = input.split(/\r?\n/);
    const findings = [];

    /* 表記揺れ */
    lines.forEach((line, idx) => {
      for (const d of dict) {
        /* 「A／B」形式の誤表記は分割して個別に照合する */
        for (const variant of d.wrong.split(/[／/]/).map((s) => s.trim()).filter(Boolean)) {
          if (variant.length < 1) continue;
          if (variant.startsWith('～') || variant.startsWith('〜')) {
            const core = variant.replace(/^[～〜]/, '');
            if (core && line.includes(core)) {
              findings.push({ line: idx + 1, kind: '表記揺れ', found: variant, fix: d.correct, note: d.note || '' });
              break;
            }
          } else if (line.includes(variant)) {
            findings.push({ line: idx + 1, kind: '表記揺れ', found: variant, fix: d.correct, note: d.note || '' });
            break;
          }
        }
      }
    });

    /* テロップ固有の検査 */
    if (as_telop) {
      lines.forEach((line, idx) => {
        const t = line.trim();
        if (!t) return;
        if (/[、。]/.test(t)) {
          findings.push({ line: idx + 1, kind: '句読点', found: t.match(/[、。]/g).join(''), fix: '半角スペースに置き換える', note: '原則として「、」「。」は使わない' });
        }
        if (/[!?]/.test(t)) {
          findings.push({ line: idx + 1, kind: '半角記号', found: t.match(/[!?]/g).join(''), fix: '全角の「！」「？」を使う', note: '' });
        }
        const len = [...t].length;
        if (len > 18) {
          findings.push({ line: idx + 1, kind: '文字数', found: `${len}文字`, fix: '1行15〜18文字に収める', note: '基本は1行。2行にする場合は上を短く、下を長く' });
        }
      });
    }

    if (!findings.length) {
      return text(
        '## 判定\n合格\n\n## 指摘事項\nなし\n\n' +
        `検査対象: ${lines.length}行 / 照合辞書: ${dict.length}件\n` +
        (as_telop ? 'テロップ検査（句読点・全角記号・1行文字数）も実施しました。\n' : '') +
        '\n※ ツールで検出できない誤字・文脈の誤りは目視確認が必要です。'
      );
    }

    const lines2 = [
      '## 判定',
      '要修正',
      '',
      `## 指摘事項（${findings.length}件）`,
      '',
      '| 行 | 種別 | 検出 | 修正 | 備考 |',
      '|---|---|---|---|---|'
    ];
    for (const f of findings) {
      lines2.push(`| ${f.line} | ${f.kind} | ${f.found} | ${f.fix} | ${f.note} |`);
    }
    lines2.push('', 'この一覧にある表記を間違えた場合は重大ミスとして扱う記載があります。');
    lines2.push('※ ツールで検出できない誤字・文脈の誤りは目視確認が必要です。');
    return text(lines2.join('\n'));
  },

  get_checklist({ kind = 'official' }) {
    if (kind === 'official') {
      const lines = ['# 提出前チェックリスト（正式18項目）', ''];
      DATA.checklist.forEach((c, n) => {
        lines.push(`${n + 1}. ${c.text}${c.note ? `　⚠ ${c.note}` : ''}`);
      });
      lines.push('', `**提出物**: ${DATA.submissionTriad.items.join(' / ')}`);
      lines.push('', `> ⚠ ${DATA.submissionTriad.conflict}`);
      lines.push('', `**ディレクター提出時の文言**: 「${DATA.submissionTriad.directorPhrase}」`);
      return text(lines.join('\n'));
    }
    if (kind === 'improvement') {
      const lines = [
        '# 改善候補（12項目）',
        '',
        '**これは正式チェック項目ではありません。** 正式ルールとして扱わないこと。',
        '指摘する場合は「提案」と明示すること。',
        ''
      ];
      DATA.checklistImprovements.forEach((c, n) => lines.push(`${n + 1}. ${c.text}`));
      return text(lines.join('\n'));
    }
    if (kind === 'clip') {
      const lines = ['# 切り抜き動画 納品前チェック（12項目）', ''];
      DATA.clipChecklist.forEach((c, n) => lines.push(`${n + 1}. ${c.text}`));
      return text(lines.join('\n'));
    }
    throw new Error(`kind は official / improvement / clip のいずれかです: ${kind}`);
  },

  get_template({ title }) {
    if (!title) {
      const lines = ['# 連絡テンプレート一覧', ''];
      const byCat = {};
      for (const t of DATA.templates) (byCat[t.category] ||= []).push(t.title);
      for (const [cat, titles] of Object.entries(byCat)) {
        lines.push(`## ${cat}`, ...titles.map((x) => `- ${x}`), '');
      }
      lines.push('title を指定すると本文を返します。');
      return text(lines.join('\n'));
    }
    const found = DATA.templates.filter((t) => t.title.includes(title));
    if (!found.length) {
      throw new Error(
        `テンプレートが見つかりません: ${title}\n` +
        `登録済み: ${DATA.templates.map((t) => t.title).join(' / ')}`
      );
    }
    const lines = [];
    for (const t of found) {
      lines.push(`# ${t.title}（${t.category}）`, '');
      if (t.purpose) lines.push(`用途: ${t.purpose}`, '');
      lines.push('```', t.body, '```', '');
      if (t.ng) lines.push(`**NG例**: ${t.ng.join(' / ')}`, '');
      if (t.ok) lines.push(`**OK例**: ${t.ok.join(' / ')}`, '');
      if (t.extra) lines.push(`補足: ${t.extra}`, '');
    }
    return text(lines.join('\n'));
  },

  list_conflicts() {
    const a = DATA.audit;
    const lines = [
      '# マニュアルの矛盾・欠損・要確認',
      '',
      '**これらは独断で解決してはいけません。** 両方の基準を提示し、ディレクター確認を促してください。',
      '',
      `## 矛盾・要決定（${a.conflicts.length}件）`,
      ''
    ];
    for (const c of a.conflicts) {
      lines.push(`### ${c.title}`, '');
      c.points.forEach((p) => lines.push(`- ${p}`));
      lines.push('', `状態: ${c.status}`, `対応: ${c.action}`, '');
    }
    lines.push(`## 目次の問題（${a.tocIssues.length}件）`, '');
    a.tocIssues.forEach((t) => lines.push(`- ${t.text}`));
    lines.push('', `## 欠損リンク（${a.missingLinks.length}件）`, '');
    a.missingLinks.forEach((m) => lines.push(`- [${m.label}] ${m.text}`));
    lines.push('', `> **${a.missingLinkPolicy}**`, '');
    lines.push(`## 要確認（${a.needsConfirmation.length}件）`, '');
    a.needsConfirmation.forEach((q) => lines.push(`- [${q.label}] ${q.text}`));
    lines.push('', `## 改善候補（${a.improvements.length}件・正式ルールではない）`, '');
    a.improvements.forEach((i) => lines.push(`- ${i.text}　（現状: ${i.reason}）`));
    lines.push('', `## 古い説明（${a.outdated.length}件・正式ルールへ統合しない）`, '');
    a.outdated.forEach((o) => lines.push(`- ${o.text}　（理由: ${o.reason}）`));
    return text(lines.join('\n'));
  },

  get_accident_map({ query }) {
    let items = DATA.accidentMap;
    if (query) {
      items = items.filter((a) => a.title.includes(query) || a.cause.includes(query) || a.accident.includes(query));
    }
    if (!items.length) return text(`「${query}」に一致する事故防止項目はありません。`);
    const lines = [`# 事故防止マップ（${items.length}件）`, ''];
    for (const a of items) {
      lines.push(`## ${a.title}　[${RULE_LABEL[a.ruleType]}]`, '');
      lines.push(`- **原因**: ${a.cause}`);
      lines.push(`- **起きる事故**: ${a.accident}`);
      lines.push(`- **防止策**: ${a.prevention}`);
      lines.push(`- **最終確認**: ${a.finalCheck}`, '');
    }
    return text(lines.join('\n'));
  },

  get_design_rules({ kind = 'all' }) {
    const L = DATA.ledger;
    const pick = (title) => L.find((l) => l.title === title);
    const render = (l) => {
      const out = [`## ${l.no}. ${l.title}`, '', `**結論**: ${l.lead.replace(/^結論：/, '')}`, ''];
      for (const s of l.sections) {
        out.push(`### ${s.heading}　[${RULE_LABEL[s.ruleType]}]`, '');
        s.items.forEach((x) => out.push(`- ${x}`));
        out.push('');
      }
      return out;
    };

    const lines = [
      '# 図解・画像・テロップの制作ルール',
      '',
      '生成物は必ずこの制約の範囲で作ること。数値は変更しない。',
      ''
    ];

    if (kind === 'design' || kind === 'all') lines.push(...render(pick('図解演出')));
    if (kind === 'image' || kind === 'all') lines.push(...render(pick('画像演出')));
    if (kind === 'telop' || kind === 'all') lines.push(...render(pick('テロップ')));

    /* 生成時に効く数値をまとめて再掲する */
    lines.push('---', '', '## 生成時に必ず守る数値', '');
    lines.push('| 項目 | 値 |', '|---|---|');
    lines.push('| 図解の使用色 | 3色以内 |');
    lines.push('| 全画面表示に使う画像 | 1,920×1,080 px以上 |');
    lines.push('| 全画面画像の位置変化 | 1秒あたり50 |');
    lines.push('| 全画面画像のスケール変化 | 1秒あたり1 |');
    lines.push('| テロップ1行 | 15〜18文字 |');
    lines.push('| 装飾テロップのスケール | 150以上 |');
    lines.push('| 画角アップ | 原則30%ずつ |');
    lines.push('| ブラー（ガウス） | 100 / マスク境界線のぼかし40 |');
    lines.push('');
    lines.push('## 図解の完了条件', '');
    lines.push('音量を0にして、図解だけを見ても内容を理解できること。');
    lines.push('');
    lines.push('## デザイン4原則', '');
    lines.push('1. 整列 — 要素の位置をそろえる');
    lines.push('2. 反復 — 同じ要素を繰り返し、見やすくする');
    lines.push('3. 近接 — 関係する情報を近くへ置く');
    lines.push('4. 対比 — 伝えたい部分をコントラストで強調する');
    lines.push('');
    lines.push('## 禁止', '');
    lines.push('- テロップだけを並べない（画像・イラストを使う）');
    lines.push('- 演者の顔へ被せない');
    lines.push('- セーフマージンを超えない');
    lines.push('- 連続する画像へ同じ動き・同じSEを使わない');
    lines.push('- 画質の悪い画像を使わない');
    lines.push('');
    lines.push('> ⚠ AI高画質化・AI生成について: 画像内容が変化する可能性や、顧客素材をAIへ入力してよいかのルールは');
    lines.push('> 現行マニュアルにありません。使用前にディレクターへ確認してください（要確認）。');

    return text(lines.join('\n'));
  },

  format_telop({ text: input, max_chars = 18, speaker }) {
    if (!input || !input.trim()) throw new Error('text が空です。');
    const MAX = Math.max(8, Math.min(Number(max_chars) || 18, 30));

    /*
     * 文章を書き換えない。改行位置と表記だけを整える。
     * 話し言葉（「回してます」「言ってんじゃん」など）はそのまま残す。
     */

    /* 1. 句読点を区切り候補に変換し、半角記号を全角へ */
    const normalized = input
      .replace(/\r\n?/g, '\n')
      .replace(/!/g, '！')
      .replace(/\?/g, '？');

    /* 2. 意味のまとまりで区切る候補位置（助詞・接続の直後） */
    const BREAK_AFTER = ['、', '。', 'けど', 'ですが', 'ますが', 'ので', 'から', 'たら', ' then'];

    const chunks = [];
    for (const paragraph of normalized.split('\n')) {
      const p = paragraph.trim();
      if (!p) continue;

      /* 句読点で一次分割（句読点自体は落とす＝半角スペース相当） */
      const units = p.split(/[、。]/).map((s) => s.trim()).filter(Boolean);

      let line = '';
      for (const unit of units) {
        const u = [...unit];
        if ([...line].length + u.length <= MAX) {
          line = line ? line + ' ' + unit : unit;
          continue;
        }
        if (line) { chunks.push(line); line = ''; }

        /* 単体でMAXを超える場合は、助詞の直後を優先して折る */
        let rest = unit;
        while ([...rest].length > MAX) {
          const window = [...rest].slice(0, MAX).join('');
          let cut = -1;
          for (const particle of ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'や']) {
            const idx = window.lastIndexOf(particle);
            if (idx > cut && idx >= Math.floor(MAX * 0.5)) cut = idx;
          }
          const at = cut > 0 ? cut + 1 : MAX;
          chunks.push([...rest].slice(0, at).join(''));
          rest = [...rest].slice(at).join('');
        }
        line = rest;
      }
      if (line) chunks.push(line);
    }

    /* 3. 検査 */
    const warn = [];
    chunks.forEach((c, i) => {
      const len = [...c].length;
      if (len > MAX) warn.push(`${i + 1}行目: ${len}文字（上限${MAX}）`);
    });

    const dict = DATA.dictionary.concat(DATA.splitEditDictionary);
    const notation = [];
    chunks.forEach((c, i) => {
      for (const d of dict) {
        for (const variant of d.wrong.split(/[／/]/).map((s) => s.trim()).filter(Boolean)) {
          if (variant.startsWith('～') || variant.startsWith('〜')) continue;
          if (c.includes(variant)) {
            notation.push(`${i + 1}行目: ${variant} → ${d.correct}`);
            break;
          }
        }
      }
    });

    const lines = [
      '# テロップ整形結果',
      '',
      speaker ? `話者: ${speaker}` : '',
      `${chunks.length}行 / 1行上限 ${MAX}文字`,
      '',
      '## 整形後（このまま使えます）',
      '',
      '```'
    ].filter((x) => x !== '');

    chunks.forEach((c) => lines.push(c));
    lines.push('```', '');

    lines.push('## 行ごとの文字数', '');
    lines.push('| 行 | 文字数 | 内容 |', '|---|---|---|');
    chunks.forEach((c, i) => lines.push(`| ${i + 1} | ${[...c].length} | ${c} |`));
    lines.push('');

    if (warn.length) {
      lines.push('## 文字数超過', '');
      warn.forEach((x) => lines.push(`- ${x}`));
      lines.push('');
    }
    if (notation.length) {
      lines.push('## 表記揺れの指摘', '');
      [...new Set(notation)].forEach((x) => lines.push(`- ${x}`));
      lines.push('');
    }

    lines.push('---', '');
    lines.push('## 適用したルール', '');
    lines.push(`- 1行15〜${MAX}文字（基本は1行）`);
    lines.push('- 「、」「。」は使わず半角スペースへ');
    lines.push('- 「！」「？」は全角');
    lines.push('- 意味のまとまりで改行（助詞の直後を優先）');
    lines.push('');
    lines.push('## 人が確認すること', '');
    lines.push('- 話し言葉を不自然に直していないか（エンタメ・口語チャンネルでは直しすぎない）');
    lines.push('- 主語がない行に丸括弧で主語を補う必要がないか');
    lines.push('- 2行にする場合は上を短く、下を長くする');
    lines.push('- 子音発声の1フレーム前に表示する');
    lines.push('- 固有名詞は公式サイトで裏取りする');
    if (speaker) lines.push('- 複数話者の場合、話者ごとのテロップ色が統一されているか');

    return text(lines.join('\n'));
  },

  governance_audit({ only_failures = false }) {
    /*
     * 監査の内部から呼ばれた場合は実行しない。
     * governance -> test-mcp -> governance_audit の無限再帰を防ぐ。
     */
    if (Number(process.env.VM_GOVERNANCE_DEPTH || 0) > 0) {
      return text(
        '# ガバナンス監査（入れ子のため実行を省略）\n\n' +
        'この呼び出しは監査プロセスの内部から行われました。\n' +
        '再帰を防ぐため実行していません。監査結果は親プロセスの出力を参照してください。'
      );
    }

    let json;
    try {
      json = execFileSync(process.execPath, [resolve(__dirname, 'governance.mjs'), '--json'], {
        cwd: ROOT, stdio: 'pipe', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, VM_GOVERNANCE_DEPTH: '1' }
      });
    } catch (e) {
      /* ブロッカーがあると非ゼロ終了するが、stdout にJSONが出ている */
      json = e.stdout || '';
    }

    let r;
    try { r = JSON.parse(json); } catch (_) {
      throw new Error('監査を実行できませんでした。node agents/governance.mjs を直接実行して確認してください。');
    }

    const rows = only_failures ? r.checks.filter((c) => !c.pass) : r.checks;

    const lines = [
      `# ガバナンス監査結果: ${r.verdict}`,
      '',
      `検査 ${r.total}件 / 合格 ${r.passed}件 / ブロッカー ${r.blockers}件 / 警告 ${r.warnings}件`,
      `実施: ${r.checkedAt.slice(0, 19).replace('T', ' ')}`,
      ''
    ];

    if (r.blockers > 0) {
      lines.push('## ブロッカー（これが1件でもあれば NO-GO）', '');
      lines.push('| ID | 内容 | 対応 |', '|---|---|---|');
      for (const c of r.checks.filter((x) => !x.pass && x.severity === 'blocker')) {
        lines.push(`| ${c.id} | ${c.name} | ${c.action} |`);
      }
      lines.push('');
    }

    const warnRows = r.checks.filter((x) => !x.pass && x.severity === 'warn');
    if (warnRows.length) {
      lines.push('## 警告（出荷は可能だが対応推奨）', '');
      for (const c of warnRows) lines.push(`- ${c.id} ${c.name}: ${c.detail}`);
      lines.push('');
    }

    lines.push(only_failures ? '## 失敗した検査' : '## 全検査', '');
    lines.push('| ID | カテゴリ | 検査 | 結果 | 詳細 |', '|---|---|---|---|---|');
    for (const c of rows) {
      const mark = c.pass ? 'PASS' : (c.severity === 'blocker' ? 'BLOCK' : 'WARN');
      lines.push(`| ${c.id} | ${c.category} | ${c.name} | ${mark} | ${(c.detail || '').replace(/\|/g, '\\|')} |`);
    }

    lines.push('');
    lines.push('> 未解決の矛盾（演出頻度・提出方法）は「解決されていること」ではなく');
    lines.push('> 「正しく表示されていること」を検査しています。独断で解決しないでください。');

    return text(lines.join('\n'));
  },

  list_agents() {
    const names = listRoleFiles();
    if (!names.length) {
      return text('役割定義が見つかりません（.claude/agents/*.md）。');
    }
    const lines = [
      '# 制作チームの役割（' + names.length + '体）',
      '',
      'get_agent_role で定義を読み込み、その役割として振る舞ってください。',
      ''
    ];
    for (const n of names) {
      const r = loadRole(n);
      lines.push(`## ${n}`, '', r.description || '（説明なし）', '');
    }
    lines.push('---', '');
    lines.push('担当外の判断は抱え込まず、handoff で渡してください。');
    lines.push('');
    lines.push('CTOは制作チームの外から監査・裁定を行います。');
    lines.push('演出頻度と提出方法の確定はディレクターの権限です。');
    return text(lines.join('\n'));
  },

  get_agent_role({ name }) {
    const r = loadRole(name);
    const lines = [
      `# 役割: ${r.name}`,
      ''
    ];
    if (r.description) lines.push(`**担当**: ${r.description}`, '');
    lines.push(
      '以下をあなたの指示として読み込み、この役割として振る舞ってください。',
      'この定義は Claude Code のサブエージェントと同一です。',
      '',
      '---',
      '',
      r.body,
      '',
      '---',
      '',
      '## 共通の制約（全役割に適用）',
      '',
      '- 知識ベースにないことを推測で補わない',
      '- URLを推測しない（原本で5件欠損している）',
      '- 数字・単位・条件を変更しない',
      '- 改善候補を正式ルールとして出さない',
      '- 演出頻度（6秒/10秒）と提出方法（Frame.io/限定公開）の矛盾を独断で解決しない',
      '- 担当外の判断は handoff で渡す'
    );
    return text(lines.join('\n'));
  },

  handoff({ to, what, why, evidence, from }) {
    const target = loadRole(to);
    const lines = [
      '# 引き継ぎ',
      '',
      `**渡す先**: ${to}${from ? `　**渡す側**: ${from}` : ''}`,
      '',
      '## 何を判断してほしいか',
      '',
      what,
      '',
      '## なぜ自分では決められないか',
      '',
      why,
      ''
    ];
    if (evidence) {
      lines.push('## 根拠', '', evidence, '');
    } else {
      lines.push('## 根拠', '', '（未記入）根拠なしで渡さないでください。該当するマニュアルの箇所を示してください。', '');
    }
    lines.push(
      '---',
      '',
      `## ${to} の役割定義`,
      '',
      target.description || '',
      '',
      target.body,
      '',
      '---',
      '',
      '受け取った側は、上の根拠をMCPツールで裏取りしてから判断してください。'
    );
    return text(lines.join('\n'));
  },

  list_projects() {
    const ids = listProjectIds();
    if (!ids.length) {
      return text(
        '登録済みの案件マニュアルはありません。\n\n' +
        '登録方法:\n' +
        '  node agents/generate-project-agent.mjs <案件マニュアルのパス> <案件ID> [案件名]'
      );
    }
    const lines = [`# 登録済み案件（${ids.length}件）`, ''];
    for (const id of ids) {
      const md = readFileSync(resolve(PROJECTS_DIR, `${id}.md`), 'utf8');
      const nameMatch = /^#\s*案件マニュアル:\s*(.+)$/m.exec(md);
      const dateMatch = /取り込み日:\s*(\S+)/.exec(md);
      const pending = (md.match(/確認が必要|未記入/g) || []).length;
      lines.push(
        `- \`${id}\` — ${nameMatch ? nameMatch[1] : id}` +
        (dateMatch ? `（取り込み: ${dateMatch[1]}）` : '') +
        (pending ? `　⚠ 未確定 ${pending}箇所` : '　✓ 確定済み')
      );
    }
    return text(lines.join('\n'));
  },

  get_project_rules({ project_id }) {
    if (!project_id) throw new Error('project_id が必要です。');
    const md = loadProject(project_id);
    const pending = (md.match(/確認が必要|未記入/g) || []).length;
    const header = pending
      ? `⚠ この案件マニュアルには未確定の箇所が ${pending}件 あります。該当項目は「確認が必要」と回答してください。\n\n---\n\n`
      : '';
    return text(header + md);
  }
};

/* ------------------------------------------------------------------ */
/* JSON-RPC / stdio                                                    */
/* ------------------------------------------------------------------ */

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function handle(msg) {
  const { id, method, params } = msg;

  /* 通知（idなし）は応答しない */
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
          return reply(id, fn(args));
        } catch (e) {
          /* ツール実行エラーは isError で返す（プロトコルエラーにしない） */
          return reply(id, { content: [{ type: 'text', text: `エラー: ${e.message}` }], isError: true });
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
    return replyError(id, -32603, e.message);
  }
}

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
