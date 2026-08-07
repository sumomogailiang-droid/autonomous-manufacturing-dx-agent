/*
 * app.js
 * 編集アシスタント パネル本体。
 *
 * 添付画像の「トンマナ パレット」とは別パネル。役割を分けている。
 *   トンマナ パレット … クリップ素材の挿入
 *   編集アシスタント   … マニュアル準拠チェック・テロップ生成・音声設定・カット記録
 *
 * 方針:
 *  - DOM生成は createElement / textContent のみ。innerHTML は使わない。
 *  - Premiere API は adapter.js に隔離。Premiere外ではモックで動く。
 *  - チェック状態はパネルを開いている間だけ保持する。
 */

/*
 * UXPは ESモジュールに対応していないため、import は使わない。
 * 先に読み込まれたスクリプトがグローバルへ置いた値を使う。
 */
(function () {
  'use strict';

  const adapter = globalThis.PremiereAdapter;
  const T = globalThis.TelopUtils || {};
  const { formatTelop, parseSubtitles, parseTimedText, formatSubtitles, toSrt, checkNotation } = T;
  const TC = globalThis.TimecodeUtils;
  const DATA = globalThis.MANUAL_SNAPSHOT;

  /* 依存が読めていない場合は、黙って白画面にせず画面へ出す */
  if (!adapter || !DATA || !formatTelop || !TC) {
    document.addEventListener('DOMContentLoaded', function () {
      const host = document.getElementById('panel-material') || document.body;
      const box = document.createElement('div');
      box.className = 'alert';
      const missing = [
        !adapter ? 'adapter.js' : null,
        !formatTelop ? 'telop.js' : null,
        !TC ? 'timecode.js' : null,
        !DATA ? 'data/manual-snapshot.js' : null
      ].filter(Boolean).join(', ');
      box.textContent = '読み込めなかったファイル: ' + missing;
      host.appendChild(box);
    });
    return;
  }

/* ------------------------------------------------------------------ */
/* DOMユーティリティ                                                    */
/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function attr(n, m) { for (const k of Object.keys(m)) n.setAttribute(k, String(m[k])); return n; }
function add(p, ...kids) { for (const k of kids) if (k) p.appendChild(k); return p; }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function list(items, cls) {
  const ul = el('ul', cls || null);
  for (const i of items) ul.appendChild(el('li', null, i));
  return ul;
}
function badge(ruleType) {
  const def = DATA.ruleTypes.find((r) => r.id === ruleType);
  if (!def) return null;
  const b = el('span', `badge badge-${def.id}`, def.label);
  attr(b, { title: def.description });
  return b;
}

/* トースト通知 */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ------------------------------------------------------------------ */
/* チェックリスト共通                                                   */
/* ------------------------------------------------------------------ */

const checkState = {};   /* パネルを開いている間だけ保持 */

function buildChecklist(host, { title, note, items, keyPrefix, ruleTypeOverride }) {
  if (title) host.appendChild(el('h2', null, title));
  if (note) host.appendChild(el('p', 'lead', note));

  const prog = el('div', 'progress');
  const ptext = el('div', 'progress-text');
  attr(ptext, { 'aria-live': 'polite' });
  const ptrack = el('div', 'progress-track');
  const pfill = el('div', 'progress-fill');
  add(ptrack, pfill);
  add(prog, ptext, ptrack);
  host.appendChild(prog);

  const ul = el('ul', 'checklist');

  const update = () => {
    const done = items.filter((c) => checkState[keyPrefix + c.id]).length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    ptext.textContent = `${done} / ${items.length} 項目 完了（${pct}%）`;
    pfill.style.width = pct + '%';
  };

  for (const c of items) {
    const li = el('li');
    const label = el('label', 'check-item');
    const cb = el('input');
    attr(cb, { type: 'checkbox' });
    cb.checked = !!checkState[keyPrefix + c.id];

    const body = el('div', 'check-body');
    body.appendChild(el('span', 'ct', c.text));
    if (c.note) body.appendChild(el('span', 'check-note', '⚠ ' + c.note));
    add(label, cb, body);

    const rt = ruleTypeOverride || c.ruleType;
    if (rt && rt !== 'official') label.appendChild(badge(rt));

    const sync = () => {
      checkState[keyPrefix + c.id] = cb.checked;
      label.classList.toggle('is-done', cb.checked);
      update();
    };
    cb.addEventListener('change', sync);
    label.classList.toggle('is-done', cb.checked);

    li.appendChild(label);
    ul.appendChild(li);
  }

  host.appendChild(ul);

  const row = el('div', 'btn-row');
  const reset = el('button', 'btn btn-sm', 'すべて外す');
  attr(reset, { type: 'button' });
  reset.addEventListener('click', () => {
    for (const c of items) checkState[keyPrefix + c.id] = false;
    for (const cb of ul.querySelectorAll('input[type="checkbox"]')) {
      cb.checked = false;
      cb.closest('.check-item').classList.remove('is-done');
    }
    update();
    toast('チェックをすべて外しました');
  });
  add(row, reset);
  host.appendChild(row);

  update();
  return { update };
}

/* ------------------------------------------------------------------ */
/* タブ1: 素材確認                                                      */
/* ------------------------------------------------------------------ */

function buildMaterialPanel() {
  const host = clear(document.getElementById('panel-material'));

  host.appendChild((() => {
    const a = el('div', 'alert warn');
    add(a,
      el('strong', null, '素材不備は最初に見つける'),
      document.createTextNode('納期直前に発覚すると対応できません。編集を始める前に全項目を確認してください。')
    );
    return a;
  })());

  const card = el('div', 'card');
  buildChecklist(card, {
    title: '素材確認（12項目）',
    note: '工程2「権限・素材・納期確認」の項目です。',
    items: DATA.materialChecklist,
    keyPrefix: 'mat-'
  });
  host.appendChild(card);

  /* 連絡テンプレート出力 */
  const tplCard = el('div', 'card');
  tplCard.appendChild(el('h2', null, '確認結果の連絡'));
  tplCard.appendChild(el('p', 'lead', '確認が終わったら、結果をディレクターへ連絡します。'));

  const out = el('pre', 'output');
  attr(out, { id: 'material-out' });

  const row = el('div', 'btn-row');
  attr(row, { id: 'material-templates' });
  for (const [label, title] of [
    ['不備なし', '素材確認・不備なし'],
    ['不備あり', '素材不備の可能性の連絡'],
    ['受領（すぐ確認）', '素材受領（すぐ確認できる場合）'],
    ['受領（後で確認）', '素材受領（すぐ確認できない場合）']
  ]) {
    const b = el('button', 'btn btn-sm', label);
    attr(b, { type: 'button' });
    b.addEventListener('click', () => {
      const t = DATA.templates.find((x) => x.title === title);
      out.textContent = t ? t.body : 'テンプレートが見つかりません';
    });
    row.appendChild(b);
  }

  const copyRow = el('div', 'btn-row');
  const copyBtn = el('button', 'btn btn-primary btn-sm', 'コピー');
  attr(copyBtn, { type: 'button' });
  copyBtn.addEventListener('click', async () => {
    if (!out.textContent) { toast('先にテンプレートを選んでください'); return; }
    const r = await adapter.copyToClipboard(out.textContent);
    toast(r.message);
  });
  copyRow.appendChild(copyBtn);

  add(tplCard, row, out, copyRow);
  host.appendChild(tplCard);

  /* 事故防止（素材関連） */
  const accCard = el('div', 'card');
  accCard.appendChild(el('h2', null, '関連する事故'));
  const acc = DATA.accidentMap.filter((a) =>
    a.title.includes('素材') || a.title.includes('権限') || a.title.includes('納期'));
  for (const a of acc) {
    const box = el('div', 'alert warn');
    add(box,
      el('strong', null, a.title),
      document.createTextNode(`原因: ${a.cause} / 防止策: ${a.prevention}`)
    );
    accCard.appendChild(box);
  }
  host.appendChild(accCard);
}

/* ------------------------------------------------------------------ */
/* タブ2: 提出前チェック                                                */
/* ------------------------------------------------------------------ */

function buildSubmitPanel() {
  const host = clear(document.getElementById('panel-submit'));

  const card = el('div', 'card');
  buildChecklist(card, {
    title: '提出前チェック（正式18項目）',
    note: 'マニュアルに明記されている項目です。すべて確認してから提出します。',
    items: DATA.checklist,
    keyPrefix: 'sub-'
  });
  host.appendChild(card);

  /* 提出物と矛盾 */
  const triad = el('div', 'card');
  triad.appendChild(el('h2', null, '提出物'));
  triad.appendChild(list(DATA.submissionTriad.items));
  const conf = el('div', 'alert');
  add(conf, el('strong', null, '⚠ 提出方法が矛盾しています'), document.createTextNode(DATA.submissionTriad.conflict));
  triad.appendChild(conf);
  triad.appendChild(el('p', 'lead', `ディレクター提出時の文言: 「${DATA.submissionTriad.directorPhrase}」`));
  host.appendChild(triad);

  /* 改善候補は正式と分けて表示 */
  const imp = el('div', 'card');
  const impAlert = el('div', 'alert imp');
  add(impAlert,
    el('strong', null, '＋ 改善候補（正式チェックではありません）'),
    document.createTextNode('現行の正式チェックに含まれていません。指摘するときは「提案」と明示してください。')
  );
  imp.appendChild(impAlert);
  buildChecklist(imp, {
    title: null,
    note: null,
    items: DATA.checklistImprovements,
    keyPrefix: 'imp-',
    ruleTypeOverride: 'improvement'
  });
  host.appendChild(imp);

  /* 切り抜き */
  const clip = el('div', 'card');
  buildChecklist(clip, {
    title: '切り抜き 納品前チェック（12項目）',
    note: '切り抜きを納品する前に確認します。',
    items: DATA.clipChecklist,
    keyPrefix: 'clip-'
  });
  host.appendChild(clip);
}

/* ------------------------------------------------------------------ */
/* タブ3: テロップ                                                      */
/* ------------------------------------------------------------------ */

function buildTelopPanel() {
  const host = clear(document.getElementById('panel-telop'));

  const note = el('div', 'alert warn');
  add(note,
    el('strong', null, '文章は書き換えません'),
    document.createTextNode('話し言葉はそのまま残します（「回してます」を「回しています」に直しません）。整えるのは改行位置と表記だけです。')
  );
  host.appendChild(note);

  /* ---------------- 入力 ---------------- */

  const fmtHelp = el('div', 'help');
  add(fmtHelp,
    el('strong', null, '貼り付けできる形式'),
    el('p', null, '次のどれでもそのまま貼れます。変換は不要です。'),
    el('p', null, '① [00:02:51.430 → 00:02:54.990]  本文　（角括弧・矢印つき）'),
    el('p', null, '② 00:02:51.430 --> 00:02:54.990  本文　（括弧なし）'),
    el('p', null, '③ SRT / VTT ファイルの中身'),
    el('p', null, '④ 00:02:51:15  本文　（開始だけ。次の行の開始まで表示します）')
  );

  const card = el('div', 'card');
  card.appendChild(fmtHelp);

  const inLabel = el('label', 'field');
  add(inLabel, el('span', null, 'タイムコード付き文字起こし（そのまま貼れます）'));
  const ta = el('textarea');
  attr(ta, {
    id: 'telop-in',
    placeholder:
      '[00:02:51.430 → 00:02:54.990]   そのタイミングで、近くにいた人に声かけてた\n' +
      '[00:02:56.590 → 00:02:58.650]   まあ、「空いてる方おいで」って感じで\n\n' +
      'SRT形式でも貼れます'
  });
  inLabel.appendChild(ta);
  card.appendChild(inLabel);

  /* フレームレート */
  const rateRow = el('div', 'inline');

  const rateLabel = el('label', 'field');
  add(rateLabel, el('span', null, 'フレームレート'));
  const rateSel = el('select');
  attr(rateSel, { id: 'telop-rate' });
  const RATE_KEYS = ['23.976', '24', '25', '29.97', '29.97ND', '30', '50', '59.94', '60'];
  for (const k of RATE_KEYS) {
    const o = el('option', null, TC.RATES[k].label);
    attr(o, { value: k });
    rateSel.appendChild(o);
  }
  rateSel.value = '29.97';
  rateLabel.appendChild(rateSel);
  rateRow.appendChild(rateLabel);

  const detectBtn = el('button', 'btn btn-sm', 'シーケンスから取得');
  attr(detectBtn, { type: 'button' });
  rateRow.appendChild(detectBtn);
  card.appendChild(rateRow);

  const rateNote = el('p', 'stat');
  attr(rateNote, { id: 'telop-rate-note' });
  rateNote.textContent = 'シーケンスと違うfpsで計算するとフレームずれの原因になります。';
  card.appendChild(rateNote);

  /* 詳細設定 */
  const opts = el('div', 'inline');

  const maxLabel = el('label', 'field narrow');
  add(maxLabel, el('span', null, '1行の上限'));
  const maxIn = el('input');
  attr(maxIn, { type: 'number', id: 'telop-max', value: '18', min: '8', max: '30' });
  maxLabel.appendChild(maxIn);
  opts.appendChild(maxLabel);

  const leadLabel = el('label', 'field narrow');
  add(leadLabel, el('span', null, '何F早く出す'));
  const leadIn = el('input');
  attr(leadIn, {
    type: 'number', id: 'telop-lead', value: '1', min: '0', max: '10',
    title: 'テロップをタイムコードより何フレーム早く表示するか。マニュアルの目安は1フレーム前。'
  });
  leadLabel.appendChild(leadIn);
  opts.appendChild(leadLabel);

  const trackLabel = el('label', 'field narrow');
  add(trackLabel, el('span', null, '挿入先'));
  const trackSel = el('select');
  attr(trackSel, { id: 'telop-track' });
  for (let i = 1; i <= 8; i++) {
    const o = el('option', null, 'V' + i);
    attr(o, { value: String(i) });
    trackSel.appendChild(o);
  }
  trackSel.value = '2';
  trackLabel.appendChild(trackSel);
  opts.appendChild(trackLabel);

  const spLabel = el('label', 'field');
  add(spLabel, el('span', null, '話者（任意）'));
  const spIn = el('input');
  attr(spIn, { type: 'text', id: 'telop-speaker', placeholder: '木村さん' });
  spLabel.appendChild(spIn);
  opts.appendChild(spLabel);

  card.appendChild(opts);

  const leadNote = el('div', 'help');
  add(leadNote,
    el('strong', null, '「何F早く出す」とは'),
    el('p', null,
      'テロップをタイムコードより何フレーム早く表示するかです。' +
      '文字起こしの時刻は「音が聞こえた瞬間」なので、そのまま出すと声より遅れて見えます。'),
    el('p', null,
      'マニュアルでは「カットがない場所でテロップを切り替える場合は、子音発声の1フレーム前を目安にする」' +
      'と定めています。既定の 1 のままで構いません。')
  );
  card.appendChild(leadNote);

  const runRow = el('div', 'btn-row');
  const runBtn = el('button', 'btn btn-primary', '実行（テロップを作成）');
  attr(runBtn, { type: 'button', id: 'telop-run' });
  const dryBtn = el('button', 'btn', '計算だけ試す');
  attr(dryBtn, { type: 'button' });
  add(runRow, runBtn, dryBtn);
  card.appendChild(runRow);

  host.appendChild(card);

  /* ---------------- 結果 ---------------- */

  const resCard = el('div', 'card');
  resCard.appendChild(el('h2', null, '配置結果'));

  const summary = el('div');
  attr(summary, { id: 'telop-summary' });
  resCard.appendChild(summary);

  const tableWrap = el('div', 'table-wrap');
  attr(tableWrap, { id: 'telop-table-wrap' });
  tableWrap.hidden = true;
  resCard.appendChild(tableWrap);

  const outRow = el('div', 'btn-row');
  const copySrt = el('button', 'btn', 'SRTでコピー');
  attr(copySrt, { type: 'button' });
  const copyText = el('button', 'btn', 'テロップ本文をコピー');
  attr(copyText, { type: 'button' });
  const saveSrt = el('button', 'btn', 'SRTを保存');
  attr(saveSrt, { type: 'button' });
  add(outRow, copySrt, copyText, saveSrt);
  resCard.appendChild(outRow);

  host.appendChild(resCard);

  /* ---------------- 基準 ---------------- */

  const stdCard = el('div', 'card');
  stdCard.appendChild(el('h2', null, 'テロップの基準'));
  const ul = el('ul');
  for (const t of DATA.telopStandards || []) {
    ul.appendChild(el('li', null, `${t.name}: ${t.value}${t.unit && t.unit !== '—' ? ' ' + t.unit : ''}`));
  }
  stdCard.appendChild(ul);
  const chk = el('ul');
  for (const t of [
    '話し言葉を不自然に直していないか（エンタメ・口語チャンネルでは直しすぎない）',
    '主語がない行に丸括弧で主語を補う必要がないか',
    '2行にする場合は上を短く、下を長くする',
    '固有名詞は公式サイトで裏取りする'
  ]) ul.appendChild(el('li', null, t));
  stdCard.appendChild(chk);
  host.appendChild(stdCard);

  /* ---------------- 処理 ---------------- */

  let lastResult = null;

  function currentRate() {
    return TC.RATES[rateSel.value] || TC.RATES['29.97'];
  }

  /** 入力を {start,end,text} の配列へ。秒単位。 */
  function parseInput(raw, rate) {
    const toSec = (tc) => TC.framesToSeconds(TC.timecodeToFrames(tc, rate), rate);

    /* 形式1: SRT / VTT（タイムコード行と本文行が分かれている） */
    const blocks = parseSubtitles(raw);
    if (blocks.length) {
      return blocks.map((b) => ({
        start: toSec(b.start), end: toSec(b.end), text: b.text, sourceIndex: b.index
      }));
    }

    /*
     * 形式2: 開始TC〜終了TCと本文が1行に並ぶ形式。
     * 例) [00:02:51.430 → 00:02:54.990]   テキスト
     * 文字起こしツールがよく出す形式なので、そのまま貼れるようにしている。
     */
    const timed = parseTimedText(raw);
    if (timed.length) {
      return timed.map((b) => ({
        start: toSec(b.start), end: toSec(b.end), text: b.text, sourceIndex: b.index
      }));
    }

    /* 「00:00:01:15  テキスト」形式（開始TCのみ）にも対応する */
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const m = /^(\d{1,2}[:;]\d{2}[:;]\d{2}(?:[:;.,]\d{1,3})?)\s+(.+)$/.exec(line);
      if (!m) continue;
      rows.push({ frame: TC.timecodeToFrames(m[1], rate), text: m[2].trim() });
    }
    if (!rows.length) return [];

    /* 終了時刻がないので、次の開始まで表示する。最後は3秒。 */
    return rows.map((r, i) => {
      const next = rows[i + 1];
      const endFrame = next ? next.frame : r.frame + Math.round(rate.exact * 3);
      return {
        start: TC.framesToSeconds(r.frame, rate),
        end: TC.framesToSeconds(endFrame, rate),
        text: r.text,
        sourceIndex: i + 1
      };
    });
  }

  /** 整形 → フレーム確定 まで行う。配置はしない。 */
  function compute() {
    const raw = ta.value;
    if (!raw.trim()) {
      toast('文字起こしを貼り付けてください');
      return null;
    }

    const rate = currentRate();
    const maxChars = Number(maxIn.value) || 18;
    const leadFrames = Number(leadIn.value);

    const parsed = parseInput(raw, rate);
    if (!parsed.length) {
      toast('タイムコードを読み取れませんでした。上の「貼り付けできる形式」を確認してください');
      return null;
    }

    /* 1ブロックが複数行になる場合は、表示時間を行数で分ける */
    const expanded = [];
    for (const b of parsed) {
      const { lines } = formatTelop(b.text, { maxChars, dictionary: DATA.dictionary });
      if (!lines.length) continue;
      const span = b.end - b.start;
      const per = span / lines.length;
      lines.forEach((text, i) => {
        expanded.push({
          start: b.start + per * i,
          end: b.start + per * (i + 1),
          text,
          sourceIndex: b.sourceIndex
        });
      });
    }

    const snapped = TC.snapToFrames(expanded, { rate, leadFrames, minFrames: 12 });
    const verify = TC.verifyPlacement(snapped.items);
    const notation = checkNotation(snapped.items.map((i) => i.text), DATA.dictionary);

    const srt = snapped.items
      .map((it, i) =>
        `${i + 1}\n${TC.framesToSrtTime(it.inFrame, rate)} --> ${TC.framesToSrtTime(it.outFrame, rate)}\n${it.text}\n`)
      .join('\n');

    lastResult = { items: snapped.items, warnings: snapped.warnings, verify, notation, srt, rate };
    renderResult(lastResult);
    return lastResult;
  }

  function renderResult(r) {
    clear(summary);

    const layers = Math.max(1, r.verify.layers || 1);
    const baseTrack = Number(trackSel.value);

    const okBox = el('div', 'alert ' + (r.verify.ok ? 'ok' : 'ng'));
    add(okBox,
      el('strong', null, r.verify.ok ? 'フレームずれなし' : 'フレームずれあり'),
      document.createTextNode(
        r.verify.ok
          ? `${r.items.length}件すべて整数フレームに確定しました（${r.rate.label}）` +
            (layers > 1
              ? ` / 同時発言があるため V${baseTrack}〜V${baseTrack + layers - 1} の${layers}トラックに分けます`
              : ` / すべて V${baseTrack} に収まります`)
          : r.verify.problems.map((p) => `${p.index}件目: ${p.detail}`).join(' / ')
      )
    );
    summary.appendChild(okBox);

    if (layers > 1) {
      const lay = el('div', 'alert warn');
      add(lay,
        el('strong', null, '同時発言があります'),
        document.createTextNode(
          'マニュアルの「発言が重なる場合、1人目のテロップを残し、2人目のテロップを上に重ねる」に従い、' +
          `重なった分を上のトラックへ分けました。前のテロップを途中で消していません。` +
          `使用トラック: V${baseTrack}〜V${baseTrack + layers - 1}`
        )
      );
      summary.appendChild(lay);
    }

    if (r.warnings.length) {
      const w = el('div', 'alert warn');
      add(w, el('strong', null, `調整した箇所 ${r.warnings.length}件`),
        document.createTextNode(r.warnings.slice(0, 6).map((x) => `${x.index}件目 ${x.kind}: ${x.detail}`).join(' / ')));
      summary.appendChild(w);
    }

    if (r.notation.length) {
      const n = el('div', 'alert ng');
      add(n, el('strong', null, `表記揺れ ${r.notation.length}件`),
        document.createTextNode(r.notation.slice(0, 8).map((x) => `${x.line}行目 ${x.wrong}→${x.correct}`).join(' / ')));
      summary.appendChild(n);
    }

    /* 表 */
    const wrap = clear(document.getElementById('telop-table-wrap'));
    wrap.hidden = false;
    const table = el('table');
    const thead = el('thead');
    const trh = el('tr');
    for (const h of ['#', 'TR', 'IN', 'OUT', 'F数', '字', 'テロップ']) {
      const th = el('th', null, h);
      attr(th, { scope: 'col' });
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    const tb = el('tbody');
    for (const it of r.items) {
      const tr = el('tr');
      tr.appendChild(el('td', null, String(it.index)));
      /* 同時発言は上のトラックへ分かれるので、行き先を出す */
      const trackNo = Number(trackSel.value) + (it.layer || 0);
      const tdTr = el('td', 'num', 'V' + trackNo);
      if (it.layer) tdTr.className = 'num layered';
      tr.appendChild(tdTr);
      tr.appendChild(el('td', 'num', it.inTc));
      tr.appendChild(el('td', 'num', it.outTc));
      tr.appendChild(el('td', 'num', String(it.durationFrames)));
      tr.appendChild(el('td', 'num', String([...it.text].length)));
      tr.appendChild(el('td', null, it.text));
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    wrap.appendChild(table);
  }

  detectBtn.addEventListener('click', async () => {
    try {
      const info = await adapter.getSequenceFrameRate();
      if (!info || !info.fps) {
        rateNote.textContent = 'シーケンスから取得できませんでした。手で選んでください。' +
          (info && info.error ? '\n' + info.error : '');
        toast('取得できませんでした');
        return;
      }
      const resolved = TC.resolveRate(info.fps, info.dropFrame);
      const key = Object.keys(TC.RATES).find((k) => TC.RATES[k].label === resolved.label);
      if (key) rateSel.value = key;
      rateNote.textContent = `シーケンスから取得: ${info.fps.toFixed(4)}fps → ${resolved.label}`;
      toast(`${resolved.label} を設定しました`);
    } catch (e) {
      toast('取得に失敗: ' + e.message);
    }
  });

  dryBtn.addEventListener('click', () => {
    const r = compute();
    if (r) toast(`${r.items.length}件を計算しました（配置はしていません）`);
  });

  runBtn.addEventListener('click', async () => {
    const r = compute();
    if (!r) return;

    if (!r.verify.ok) {
      toast('フレームずれが残っているため配置しませんでした');
      return;
    }

    runBtn.disabled = true;
    runBtn.textContent = '配置中…';
    try {
      const res = await adapter.insertTelops(r.items, {
        rate: r.rate,
        /* 各テロップの行き先は trackIndex + layer（同時発言は上のトラックへ） */
        trackIndex: Number(trackSel.value) - 1,
        layers: r.verify.layers || 1,
        srtText: r.srt,
        fileName: 'telop.srt'
      });
      const box = el('div', 'alert ok');
      add(box, el('strong', null, `配置しました（${res.method}）`), document.createTextNode(res.note));
      summary.insertBefore(box, summary.firstChild);
      toast(`${res.placed}件を配置しました`);
    } catch (e) {
      const box = el('div', 'alert ng');
      add(box, el('strong', null, '配置に失敗しました'), document.createTextNode(e.message));
      summary.insertBefore(box, summary.firstChild);
      toast('配置に失敗しました');
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '実行（テロップを作成）';
    }
  });

  copySrt.addEventListener('click', async () => {
    if (!lastResult) { toast('先に実行してください'); return; }
    await adapter.copyToClipboard(lastResult.srt);
    toast('SRTをコピーしました');
  });

  copyText.addEventListener('click', async () => {
    if (!lastResult) { toast('先に実行してください'); return; }
    await adapter.copyToClipboard(lastResult.items.map((i) => i.text).join('\n'));
    toast('テロップ本文をコピーしました');
  });

  saveSrt.addEventListener('click', async () => {
    if (!lastResult) { toast('先に実行してください'); return; }
    try {
      const path = await adapter.writeSrtFile(lastResult.srt, 'telop.srt');
      toast('保存しました: ' + path);
    } catch (e) {
      toast('保存に失敗: ' + e.message);
    }
  });

  buildInspectCard(host);
}

/*
 * 既存テロップの調査。
 *
 * 「段落テキストをポイントテキストへ変えたい」のように、
 * APIで触れるかどうか分からない操作を頼まれたときに使う。
 *
 * 変換をいきなり書くのではなく、まずその環境のAPIが何を公開しているかを
 * 書き出す。分からないまま書いたコードは、動かなくても動いたように見えてしまう。
 */
function buildInspectCard(host) {
  const card = el('div', 'card');
  card.appendChild(el('h2', null, '既存テロップの調査'));

  const note = el('p', 'hint');
  note.textContent =
    '指定したシーケンスのトラックにあるクリップを開き、テキスト関連のAPIが' +
    '実際に何を公開しているかを書き出します。変更は一切行いません。';
  card.appendChild(note);

  const seqLabel = el('label', 'field');
  add(seqLabel, el('span', null, 'シーケンス名'));
  const seqIn = el('input');
  attr(seqIn, {
    type: 'text', id: 'inspect-seq',
    placeholder: 'CAMP_名古屋校_編集シーケンス'
  });
  seqLabel.appendChild(seqIn);
  card.appendChild(seqLabel);

  const trackLabel = el('label', 'field');
  add(trackLabel, el('span', null, '対象トラック'));
  const trackSel = el('select');
  attr(trackSel, { id: 'inspect-track' });
  for (let v = 1; v <= 8; v++) {
    const o = el('option', null, 'V' + v);
    attr(o, { value: String(v) });
    if (v === 3) attr(o, { selected: 'selected' });
    trackSel.appendChild(o);
  }
  trackLabel.appendChild(trackSel);
  card.appendChild(trackLabel);

  const row = el('div', 'btn-row');
  const runBtn = el('button', 'btn btn-primary btn-sm', '調査する');
  const copyBtn = el('button', 'btn btn-sm', '結果をコピー');
  const saveBtn = el('button', 'btn btn-sm', 'ファイルに保存');
  const wrapBtn = el('button', 'btn btn-sm', '折り返す');
  for (const b of [runBtn, copyBtn, saveBtn, wrapBtn]) attr(b, { type: 'button' });
  add(row, runBtn, copyBtn, saveBtn, wrapBtn);
  card.appendChild(row);

  /*
   * 結果は textarea に出す。pre だと環境によって選択できず、
   * クリップボードも通らないと取り出す手段が無くなる。
   * readonly にして、書き換えても中身が変わらないようにする。
   */
  const out = el('textarea', 'inspect-out');
  attr(out, { id: 'inspect-out', readonly: 'readonly', rows: '14', spellcheck: 'false', wrap: 'off' });
  out.hidden = true;
  card.appendChild(out);

  host.appendChild(card);

  let lastReport = '';

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.textContent = '調査中…';
    try {
      const r = await adapter.inspectTextLayers({
        sequenceName: seqIn.value.trim(),
        trackIndex: Number(trackSel.value)
      });
      lastReport = r.report || '';
      out.value = lastReport;
      out.hidden = false;
      toast(r.ok ? '調査しました' : '調査できませんでした');
    } catch (e) {
      lastReport = '調査に失敗しました: ' + (e && e.message ? e.message : String(e));
      out.value = lastReport;
      out.hidden = false;
      toast('調査に失敗しました');
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '調査する';
    }
  });

  copyBtn.addEventListener('click', async () => {
    if (!lastReport) { toast('先に調査してください'); return; }
    /* まず選択しておく。クリップボードが通らなくても手でコピーできる。 */
    try { out.focus(); out.select(); } catch (e) { /* 選択できなくても続ける */ }
    const r = await adapter.copyToClipboard(lastReport);
    toast(r && r.ok ? '結果をコピーしました' : '全選択しました。⌘Cでコピーしてください');
  });

  saveBtn.addEventListener('click', async () => {
    if (!lastReport) { toast('先に調査してください'); return; }
    try {
      const path = await adapter.writeTextFile(lastReport, 'premiere-inspect.txt');
      toast('保存しました: ' + path);
    } catch (e) {
      toast('保存に失敗: ' + (e && e.message ? e.message : String(e)));
    }
  });

  wrapBtn.addEventListener('click', () => {
    const on = out.getAttribute('wrap') === 'off';
    out.setAttribute('wrap', on ? 'soft' : 'off');
    out.classList.toggle('is-wrapped', on);
    wrapBtn.textContent = on ? '折り返しをやめる' : '折り返す';
  });
}

function renderWarningsDirect(host, warnings, notation) {
  if (warnings.length) {
    const box = el('div', 'alert');
    const ul = el('ul');
    for (const w of warnings) ul.appendChild(el('li', null, `${w.line}行目: ${w.detail}`));
    add(box, el('strong', null, '文字数超過'), ul);
    host.appendChild(box);
  }
  if (notation.length) {
    const box = el('div', 'alert');
    const ul = el('ul');
    for (const n of notation) {
      ul.appendChild(el('li', null, `${n.line}行目: ${n.wrong} → ${n.correct}${n.note ? `（${n.note}）` : ''}`));
    }
    add(box, el('strong', null, '表記揺れ（重大ミス扱い）'), ul);
    host.appendChild(box);
  }
}

function renderWarnings(host, overs, dictionary, lines) {
  if (overs.length) {
    const box = el('div', 'alert');
    const ul = el('ul');
    for (const o of overs) ul.appendChild(el('li', null, o));
    add(box, el('strong', null, '文字数超過'), ul);
    host.appendChild(box);
  }
  /* 表記揺れは行配列から再検査する */
  const notation = checkNotation(lines, dictionary);
  if (notation.length) {
    const box = el('div', 'alert');
    const ul = el('ul');
    for (const n of notation) {
      ul.appendChild(el('li', null, `${n.line}行目: ${n.wrong} → ${n.correct}`));
    }
    add(box, el('strong', null, '表記揺れ（重大ミス扱い）'), ul);
    host.appendChild(box);
  }
}

/* ------------------------------------------------------------------ */
/* タブ4: 音声設定                                                      */
/* ------------------------------------------------------------------ */

/*
 * 演出タブ（工程8）。
 *
 * やること: 演出が要る位置を計算し、そこへマーカーを打つ。
 * やらないこと: 何を入れるかを決めること。
 *
 * 案件マニュアルは「演出はデザインテロップ・SE・画角変化をセットにする」と
 * 定めている。このうちテロップの作成は、ソーステキストの値をAPIから
 * 読めないため今はできない（実機で確認済み）。
 * できるのは位置出しまでなので、そこで止めて目印を残す。
 */
function buildDirectionPanel() {
  const host = clear(document.getElementById('panel-direction'));

  const note = el('div', 'alert imp');
  add(note,
    el('strong', null, '位置だけを出します'),
    document.createTextNode(
      '演出が要る位置を計算してマーカーを打ちます。何を入れるか（強調する発言・' +
      '短い文言・SEの選定）は決めません。テロップの自動作成は、ソーステキストの値を' +
      'APIから読めないため現時点ではできません。')
  );
  host.appendChild(note);

  const card = el('div', 'card');
  card.appendChild(el('h2', null, '演出マーカー'));

  /* 範囲 */
  /*
   * エラーはここに出す。パネルが狭いと下の出力欄が画面外へ出てしまい、
   * 何が起きたのか分からないまま「動かない」になる。
   */
  const err = el('div', 'alert');
  attr(err, { id: 'dir-error' });
  err.hidden = true;
  card.appendChild(err);

  const rangeRow = el('div', 'inline');
  const inLabel = el('label', 'field');
  add(inLabel, el('span', null, '開始タイムコード'));
  const inTc = el('input');
  attr(inTc, { type: 'text', id: 'dir-in', placeholder: '例 00;03;10;03' });
  inLabel.appendChild(inTc);
  const outLabel = el('label', 'field');
  add(outLabel, el('span', null, '終了タイムコード'));
  const outTc = el('input');
  attr(outTc, { type: 'text', id: 'dir-out', placeholder: '例 00;06;10;52' });
  outLabel.appendChild(outTc);
  add(rangeRow, inLabel, outLabel);
  card.appendChild(rangeRow);

  /* 手で打たなくても埋められるようにする。薄い文字は入力値ではないので、
     プレースホルダを頼りに空のまま実行されるのを防ぐ。 */
  const grabRow = el('div', 'btn-row');
  const grabIn = el('button', 'btn btn-sm', '再生ヘッドを開始に');
  const grabOut = el('button', 'btn btn-sm', '再生ヘッドを終了に');
  for (const b of [grabIn, grabOut]) attr(b, { type: 'button' });
  add(grabRow, grabIn, grabOut);
  card.appendChild(grabRow);

  const grabNote = el('p', 'stat');
  grabNote.textContent =
    '入力欄の薄い文字は例です。入力値ではありません。空のままだと計算できません。';
  card.appendChild(grabNote);

  /* フレームレート */
  const rateRow = el('div', 'inline');
  const rateLabel = el('label', 'field');
  add(rateLabel, el('span', null, 'フレームレート'));
  const rateSel = el('select');
  attr(rateSel, { id: 'dir-rate' });
  for (const k of ['23.976', '24', '25', '29.97', '29.97ND', '30', '50', '59.94', '60']) {
    const o = el('option', null, TC.RATES[k].label);
    attr(o, { value: k });
    rateSel.appendChild(o);
  }
  rateSel.value = '29.97';
  rateLabel.appendChild(rateSel);
  rateRow.appendChild(rateLabel);
  const detectBtn = el('button', 'btn btn-sm', 'シーケンスから取得');
  attr(detectBtn, { type: 'button' });
  rateRow.appendChild(detectBtn);
  card.appendChild(rateRow);

  const rateNote = el('p', 'stat');
  attr(rateNote, { id: 'dir-rate-note' });
  rateNote.textContent = 'シーケンスと違うfpsで計算するとマーカーの位置がずれます。';
  card.appendChild(rateNote);

  /* 間隔とラベル */
  const optRow = el('div', 'inline');
  const ivLabel = el('label', 'field narrow');
  add(ivLabel, el('span', null, '間隔（秒）'));
  const ivIn = el('input');
  attr(ivIn, { type: 'number', id: 'dir-interval', value: '6', min: '1', max: '60', step: '1' });
  ivLabel.appendChild(ivIn);
  const lbLabel = el('label', 'field narrow');
  add(lbLabel, el('span', null, 'マーカー名'));
  const lbIn = el('input');
  attr(lbIn, { type: 'text', id: 'dir-label', value: '演出' });
  lbLabel.appendChild(lbIn);
  add(optRow, ivLabel, lbLabel);
  card.appendChild(optRow);

  const ivNote = el('p', 'stat');
  ivNote.textContent =
    '案件マニュアル（CAMPチャンネル）は「演出は6秒に1回」。' +
    '共通マニュアルは6秒と10秒が衝突しており、案件側が優先されます。';
  card.appendChild(ivNote);

  /*
   * 文字起こし（任意）。
   *
   * 入れておくと、各マーカーのコメントへ「その位置で何を話しているか」が入る。
   * マーカーパネルがそのまま作業リストになり、強調テロップの文言を考えるときに
   * タイムラインをスクラブしなくて済む。
   */
  const srcLabel = el('label', 'field');
  add(srcLabel, el('span', null, '文字起こし（任意・入れるとマーカーに発言が入ります）'));
  const srcIn = el('textarea');
  attr(srcIn, {
    id: 'dir-source', rows: '4', spellcheck: 'false',
    placeholder: 'SRT / VTT / 00:03:10,030 --> 00:03:17,274 形式をそのまま貼れます'
  });
  srcLabel.appendChild(srcIn);
  card.appendChild(srcLabel);

  /* ボタン */
  const row = el('div', 'btn-row');
  const dryBtn = el('button', 'btn btn-primary btn-sm', '位置を計算（打たない）');
  const runBtn = el('button', 'btn btn-sm', 'マーカーを打つ');
  for (const b of [dryBtn, runBtn]) attr(b, { type: 'button' });
  add(row, dryBtn, runBtn);
  card.appendChild(row);

  const warn = el('p', 'stat');
  warn.textContent =
    'マーカーは既存のクリップを変更しません。打った分は1回の取り消しで戻せます。';
  card.appendChild(warn);

  const out = el('div', 'output');
  attr(out, { id: 'dir-out-log' });
  card.appendChild(out);

  host.appendChild(card);

  /* --- ルールの控え --- */
  const ruleCard = el('div', 'card');
  ruleCard.appendChild(el('h2', null, '演出のルール（案件マニュアル）'));
  ruleCard.appendChild(list([
    '演出はデザインテロップ・SE・画角変化をセットにする',
    '通常テロップのまま画角アップをしない',
    '演出時は見出し・サブ見出し・QRコードを削除する',
    '画角アップが続く場合は30ずつ値を上げる（調整レイヤーにトランスフォーム）',
    'トンマナにあるテロップエフェクトとSEの組み合わせ以外を使わない',
    '通常テロップにSEを使わない／強調テロップには必ずSEを使う',
    '強調テロップ時にボタン系SEは使わない（赤枠で囲うときはボタンSE）',
    '強調テロップは要点だけの短い文言にする'
  ]));
  host.appendChild(ruleCard);

  /* --- 処理 --- */

  const rateOf = () => TC.RATES[rateSel.value] || TC.RATES['29.97'];

  function showError(msg) {
    err.textContent = msg;
    err.hidden = false;
  }
  function clearError() {
    err.textContent = '';
    err.hidden = true;
  }

  function slots() {
    const rate = rateOf();
    const rawIn = inTc.value.trim();
    const rawOut = outTc.value.trim();

    /* 空欄をそのまま通すと 0 になり「範囲が不正」としか言えなくなる。
       どちらが空なのかを名指しする。 */
    if (!rawIn && !rawOut) {
      throw new Error('開始と終了のタイムコードが両方とも空です。入力するか「再生ヘッドを開始に」で埋めてください。');
    }
    if (!rawIn) throw new Error('開始タイムコードが空です。');
    if (!rawOut) throw new Error('終了タイムコードが空です。');

    const startFrame = TC.timecodeToFrames(rawIn, rate);
    const endFrame = TC.timecodeToFrames(rawOut, rate);
    if (!isFinite(startFrame)) throw new Error(`開始タイムコードを読み取れません: ${rawIn}`);
    if (!isFinite(endFrame)) throw new Error(`終了タイムコードを読み取れません: ${rawOut}`);
    if (endFrame <= startFrame) {
      throw new Error(`終了が開始より後になっていません（開始 ${rawIn} / 終了 ${rawOut}）。`);
    }
    const iv = Number(ivIn.value) || 6;
    const step = Math.round(iv * rate.exact);

    /* 文字起こしがあれば、各スロットの区間にかかる発言を拾う。
       話者ラベルは落とす。マーカーに焼き込む意味がない。 */
    let cues = [];
    const raw = srcIn.value.trim();
    if (raw) {
      const blocks = parseSubtitles(raw);
      const parsed = blocks.length ? blocks : parseTimedText(raw);
      cues = (parsed || []).map((b) => ({
        inFrame: TC.secondsToFrames(T.tcToSeconds(b.start), rate),
        outFrame: TC.secondsToFrames(T.tcToSeconds(b.end || b.start), rate),
        text: String(b.text || '').replace(/\s*\n\s*/g, ' ')
          .replace(/^[^\s:：]{1,20}\s*[:：]\s*/, '').trim()
      })).filter((c) => c.text);
    }

    const points = [];
    for (let f = startFrame, i = 1; f < endFrame; f += step, i++) {
      const end = Math.min(f + step, endFrame);
      let comment = '';
      if (cues.length) {
        const hit = cues.filter((c) => c.inFrame < end && c.outFrame > f).map((c) => c.text);
        comment = hit.join(' ');
        /* 長いとマーカーパネルで読めない。頭だけ残す。 */
        if ([...comment].length > 120) comment = [...comment].slice(0, 120).join('') + '…';
      }
      points.push({ no: i, frame: f, tc: TC.framesToTimecode(f, rate), comment });
    }
    return { rate, startFrame, endFrame, iv, points, hasSource: cues.length > 0 };
  }

  detectBtn.addEventListener('click', async () => {
    try {
      const info = await adapter.getSequenceFrameRate();
      if (!info || !info.fps) {
        rateNote.textContent = 'シーケンスから取得できませんでした。手で選んでください。';
        if (info && info.error) showError('fpsの取得に失敗しました。\n' + info.error);
        return;
      }
      const resolved = TC.resolveRate(info.fps, info.dropFrame);
      const key = Object.keys(TC.RATES).find((k) => TC.RATES[k].label === resolved.label);
      if (key) rateSel.value = key;
      rateNote.textContent = `シーケンスから取得: ${resolved.label}`;
      clearError();
    } catch (e) {
      showError('fpsの取得に失敗しました: ' + (e && e.message ? e.message : String(e)));
    }
  });

  async function grabPlayhead(target) {
    try {
      const tc = await adapter.getPlayheadTimecode();
      if (!tc) { showError('再生位置を取得できませんでした。'); return; }
      target.value = tc;
      clearError();
      toast('再生位置を入れました: ' + tc);
    } catch (e) {
      showError('再生位置を取得できませんでした: ' + (e && e.message ? e.message : String(e)));
    }
  }
  grabIn.addEventListener('click', () => grabPlayhead(inTc));
  grabOut.addEventListener('click', () => grabPlayhead(outTc));

  dryBtn.addEventListener('click', () => {
    try {
      const s = slots();
      clearError();
      const lines = [
        `${s.points.length}箇所（${s.iv}秒ごと / ${rateOf().label}）` +
          (s.hasSource ? ' / 文字起こしあり' : ' / 文字起こしなし（コメントは共通文）'),
        '',
        ...s.points.map((p) =>
          `${lbIn.value || '演出'}${p.no}\t${p.tc}` + (p.comment ? '\t' + p.comment : ''))
      ];
      out.textContent = lines.join('\n');
      toast(`${s.points.length}箇所を計算しました`);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      showError(msg);
      out.textContent = '';
      toast('計算できませんでした');
    }
  });

  runBtn.addEventListener('click', async () => {
    let s;
    try {
      s = slots();
      clearError();
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
      toast('計算できませんでした');
      return;
    }
    runBtn.disabled = true;
    runBtn.textContent = '打っています…';
    try {
      const r = await adapter.addDirectionMarkers({
        points: s.points,
        rate: s.rate,
        label: lbIn.value || '演出',
        /* 文字起こしが無いときの共通文。ルールを毎回思い出せるようにしておく。 */
        comment: '案件マニュアル: 演出はデザインテロップ・SE・画角変化をセット'
      });
      out.textContent = r.message;
      toast(r.ok ? `マーカー ${r.placed}個` : '打てませんでした');
    } catch (e) {
      out.textContent = '失敗しました: ' + (e && e.message ? e.message : String(e));
      toast('失敗しました');
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'マーカーを打つ';
    }
  });
}

function buildAudioPanel() {
  const host = clear(document.getElementById('panel-audio'));

  const note = el('div', 'alert warn');
  add(note,
    el('strong', null, '数値は変更しないでください'),
    document.createTextNode('演者 -6.0dB / SE -20.0dB / BGM -29.0dB。マニュアルの数値をそのまま適用します。')
  );
  host.appendChild(note);

  /* トラック別の早見表 */
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'トラック別 ハードリミッター 最大振幅'));
  const wrap = el('div', 'table-wrap');
  const table = el('table');
  const thead = el('thead');
  const trh = el('tr');
  for (const t of ['トラック', '最大振幅']) {
    const th = el('th', null, t);
    attr(th, { scope: 'col' });
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);
  const tb = el('tbody');
  for (const [name, val] of [['演者音声', '-6.0 dB'], ['SE', '-20.0 dB'], ['BGM', '-29.0 dB']]) {
    const tr = el('tr');
    const th = el('th', null, name);
    attr(th, { scope: 'row' });
    tr.appendChild(th);
    tr.appendChild(el('td', 'num', val));
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  card.appendChild(wrap);
  host.appendChild(card);

  /* 演者トラックの設定順 */
  const order = el('div', 'card');
  order.appendChild(el('h2', null, '演者音声トラック（上から順に設定）'));
  order.appendChild(list([
    '1. Multiband Compressor — プリセット「テレビ放送」',
    '2. ハードリミッター — 最大振幅 -6.0dB',
    '3. クロマノイズ除去 — 10%',
    '4. ステレオエクスパンダー — ステレオ拡張 0%'
  ]));
  const confBox = el('div', 'alert');
  add(confBox,
    el('strong', null, '⚠ 記載不整合'),
    document.createTextNode('現行マニュアル冒頭では3種類のみ列挙されていますが、後から4種類目が登場します。実際は4種類として扱ってください。')
  );
  order.appendChild(confBox);
  host.appendChild(order);

  /* 全数値 */
  const all = el('div', 'card');
  all.appendChild(el('h2', null, '音量・音声処理の全基準'));
  all.appendChild(numericTable(DATA.audioStandards));
  host.appendChild(all);

  /* 注意点 */
  const warnCard = el('div', 'card');
  warnCard.appendChild(el('h2', null, '事故になりやすい点'));
  warnCard.appendChild(list([
    '発言直後は音声を無効化せず「有効のまま -999dB」に下げる',
    '必ず音量バーを下げる。オーディオゲインで下げない',
    '複数マイクを同時に有効にすると反響する。発言者だけ有効にする',
    'マルチカメラでは音声トラックをネストしない（カメラ切替で音声まで切り替わる）',
    'クリックノイズ対策の指数フェードと、SE本体へ指数フェードを入れない規則を混同しない'
  ]));
  host.appendChild(warnCard);
}

function numericTable(items) {
  const wrap = el('div', 'table-wrap');
  const table = el('table');
  const thead = el('thead');
  const trh = el('tr');
  for (const t of ['項目', '基準値', '補足']) {
    const th = el('th', null, t);
    attr(th, { scope: 'col' });
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);
  const tb = el('tbody');
  for (const i of items) {
    const tr = el('tr');
    const th = el('th', null, i.name);
    attr(th, { scope: 'row' });
    tr.appendChild(th);
    const unit = i.unit && i.unit !== '—' ? ` ${i.unit}` : '';
    tr.appendChild(el('td', 'num', `${i.value}${unit}`));
    tr.appendChild(el('td', null, i.note || ''));
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  return wrap;
}

/* ------------------------------------------------------------------ */
/* タブ5: カット記録（PDCA用）                                          */
/* ------------------------------------------------------------------ */

const cutRecords = [];

function buildCutPanel() {
  const host = clear(document.getElementById('panel-cut'));

  const note = el('div', 'alert imp');
  add(note,
    el('strong', null, 'PDCAのための記録'),
    document.createTextNode('本カット後に修正された箇所を記録します。次回の本カットで同じ指摘を繰り返さないための材料になります。')
  );
  host.appendChild(note);

  const card = el('div', 'card');
  card.appendChild(el('h2', null, '修正箇所を記録'));

  const tcRow = el('div', 'inline');
  const tcLabel = el('label', 'field');
  add(tcLabel, el('span', null, 'タイムコード'));
  const tcIn = el('input');
  attr(tcIn, { type: 'text', id: 'cut-tc', placeholder: '00;08;08;44' });
  tcLabel.appendChild(tcIn);
  const grabBtn = el('button', 'btn btn-sm', '現在位置を取得');
  attr(grabBtn, { type: 'button' });
  add(tcRow, tcLabel, grabBtn);
  card.appendChild(tcRow);

  const reasonLabel = el('label', 'field');
  add(reasonLabel, el('span', null, '修正の理由'));
  const reasonSel = el('select');
  attr(reasonSel, { id: 'cut-reason' });
  for (const r of [
    '切りすぎ（発声が欠けた）',
    '切り足りない（不要な間が残った）',
    '「っ」を詰めすぎた',
    '笑い声・相槌を途中で切った',
    '言い直しが残っている',
    'ケバを取って不自然になった',
    '意図的な間を消してしまった',
    '子音のタイミングがずれた',
    'その他'
  ]) {
    const o = el('option', null, r);
    attr(o, { value: r });
    reasonSel.appendChild(o);
  }
  reasonLabel.appendChild(reasonSel);
  card.appendChild(reasonLabel);

  const memoLabel = el('label', 'field');
  add(memoLabel, el('span', null, 'メモ（任意）'));
  const memoIn = el('input');
  attr(memoIn, { type: 'text', id: 'cut-memo', placeholder: '例: 笑い声の途中で切れていた' });
  memoLabel.appendChild(memoIn);
  card.appendChild(memoLabel);

  const row = el('div', 'btn-row');
  const addBtn = el('button', 'btn btn-primary btn-sm', '記録する');
  const markBtn = el('button', 'btn btn-sm', 'マーカーも追加');
  for (const b of [addBtn, markBtn]) attr(b, { type: 'button' });
  add(row, addBtn, markBtn);
  card.appendChild(row);
  host.appendChild(card);

  /* 記録一覧 */
  const listCard = el('div', 'card');
  listCard.appendChild(el('h2', null, '記録一覧'));
  const stat = el('p', 'stat');
  const ul = el('ul', 'rec-list');
  const empty = el('p', 'empty', 'まだ記録がありません');
  add(listCard, stat, ul, empty);

  const exportRow = el('div', 'btn-row');
  const expBtn = el('button', 'btn btn-sm', 'JSONでコピー');
  const clearBtn = el('button', 'btn btn-sm', 'すべて消す');
  for (const b of [expBtn, clearBtn]) attr(b, { type: 'button' });
  add(exportRow, expBtn, clearBtn);
  listCard.appendChild(exportRow);
  host.appendChild(listCard);

  const render = () => {
    clear(ul);
    empty.hidden = cutRecords.length > 0;
    stat.textContent = cutRecords.length ? `${cutRecords.length}件の記録` : '';

    /* 理由ごとの件数を出して、傾向が見えるようにする */
    if (cutRecords.length) {
      const byReason = {};
      for (const r of cutRecords) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
      const top = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
      stat.textContent = `${cutRecords.length}件 — 最多: ${top[0][0]}（${top[0][1]}件）`;
    }

    for (const r of cutRecords) {
      const li = el('li', 'rec-item');
      add(li,
        el('span', 'tc', r.tc || '(位置なし)'),
        document.createTextNode('  '),
        el('span', null, r.reason),
        r.memo ? el('div', 'rs', r.memo) : null
      );
      ul.appendChild(li);
    }
  };

  grabBtn.addEventListener('click', async () => {
    const tc = await adapter.getPlayheadTimecode();
    tcIn.value = tc || '';
    toast(tc ? `現在位置 ${tc} を取得しました` : '位置を取得できませんでした');
  });

  addBtn.addEventListener('click', () => {
    cutRecords.push({
      tc: tcIn.value.trim(),
      reason: reasonSel.value,
      memo: memoIn.value.trim(),
      at: new Date().toISOString()
    });
    memoIn.value = '';
    render();
    toast('記録しました');
  });

  markBtn.addEventListener('click', async () => {
    const r = await adapter.addMarker({ name: reasonSel.value, comment: memoIn.value.trim() });
    toast(r.message);
  });

  expBtn.addEventListener('click', async () => {
    if (!cutRecords.length) { toast('記録がありません'); return; }
    const json = JSON.stringify({ records: cutRecords, exportedAt: new Date().toISOString() }, null, 2);
    const r = await adapter.copyToClipboard(json);
    toast(r.ok ? 'JSONをコピーしました。pdca/records/ へ保存してください' : r.message);
  });

  clearBtn.addEventListener('click', () => {
    cutRecords.length = 0;
    render();
    toast('記録を消しました');
  });

  render();
}

/* ------------------------------------------------------------------ */
/* タブ制御                                                             */
/* ------------------------------------------------------------------ */

const TABS = ['material', 'submit', 'telop', 'direction', 'audio', 'cut'];

function selectTab(id) {
  TABS.forEach((t) => {
    const tab = document.getElementById('tab-' + t);
    const panel = document.getElementById('panel-' + t);
    const active = t === id;
    attr(tab, { 'aria-selected': active ? 'true' : 'false', tabindex: active ? '0' : '-1' });
    panel.hidden = !active;
  });
  /* スクロールするのは main。body ではない */
  const main = document.querySelector('main');
  if (main) main.scrollTop = 0;
}

function wireTabs() {
  TABS.forEach((t, index) => {
    const tab = document.getElementById('tab-' + t);
    tab.addEventListener('click', () => selectTab(t));
    tab.addEventListener('keydown', (e) => {
      let d = 0;
      if (e.key === 'ArrowRight') d = 1;
      else if (e.key === 'ArrowLeft') d = -1;
      else if (e.key === 'Home') d = -index;
      else if (e.key === 'End') d = TABS.length - 1 - index;
      else return;
      e.preventDefault();
      const next = (index + d + TABS.length) % TABS.length;
      selectTab(TABS[next]);
      document.getElementById('tab-' + TABS[next]).focus();
    });
  });
}

/* ------------------------------------------------------------------ */
/* シーケンス情報                                                       */
/* ------------------------------------------------------------------ */

async function refreshSequence() {
  const seqEl = document.getElementById('seq-info');
  const envEl = document.getElementById('env-info');

  const isReal = adapter.isPremiere();
  envEl.textContent = isReal
    ? '接続: Premiere Pro'
    : '接続: モック（Premiere外で表示中。挿入・マーカーは実行されません）';
  envEl.className = isReal ? 'env' : 'env mock';

  try {
    const seq = await adapter.getActiveSequence();
    seqEl.textContent = seq
      ? `シーケンス: ${seq.name}　V${seq.videoTracks} / A${seq.audioTracks}`
      : 'シーケンス: 選択されていません';
  } catch (e) {
    seqEl.textContent = 'シーケンス: 取得できませんでした';
  }
}

/* ------------------------------------------------------------------ */
/* 起動                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  wireTabs();
  /* シーケンス情報の取得は非同期なので先に走らせておく */
  const seqReady = refreshSequence();
  buildMaterialPanel();
  buildSubmitPanel();
  buildTelopPanel();
  buildDirectionPanel();
  buildAudioPanel();
  buildCutPanel();
  selectTab('material');
  await seqReady;
  document.body.setAttribute('data-ready', 'true');

  document.getElementById('reload').addEventListener('click', async () => {
    await refreshSequence();
    toast('シーケンス情報を更新しました');
  });
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
