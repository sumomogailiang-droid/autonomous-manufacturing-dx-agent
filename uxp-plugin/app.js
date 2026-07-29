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
  const { formatTelop, parseSubtitles, formatSubtitles, toSrt, checkNotation } = T;
  const DATA = globalThis.MANUAL_SNAPSHOT;

  /* 依存が読めていない場合は、黙って白画面にせず画面へ出す */
  if (!adapter || !DATA || !formatTelop) {
    document.addEventListener('DOMContentLoaded', function () {
      const host = document.getElementById('panel-material') || document.body;
      const box = document.createElement('div');
      box.className = 'alert';
      const missing = [
        !adapter ? 'adapter.js' : null,
        !formatTelop ? 'telop.js' : null,
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

  const card = el('div', 'card');

  const inLabel = el('label', 'field');
  add(inLabel, el('span', null, '文字起こし（テキスト / SRT / VTT を貼り付け）'));
  const ta = el('textarea');
  attr(ta, { id: 'telop-in', placeholder: '今日はですね、動画編集の基本的な流れについて解説していきます。' });
  inLabel.appendChild(ta);
  card.appendChild(inLabel);

  const opts = el('div', 'inline');
  const maxLabel = el('label', 'field narrow');
  add(maxLabel, el('span', null, '1行の上限'));
  const maxIn = el('input');
  attr(maxIn, { type: 'number', id: 'telop-max', value: '18', min: '8', max: '30' });
  maxLabel.appendChild(maxIn);

  const spkLabel = el('label', 'field');
  add(spkLabel, el('span', null, '話者（任意）'));
  const spkIn = el('input');
  attr(spkIn, { type: 'text', id: 'telop-speaker', placeholder: '木村さん' });
  spkLabel.appendChild(spkIn);

  const runBtn = el('button', 'btn btn-primary', '整形する');
  attr(runBtn, { type: 'button' });

  add(opts, maxLabel, spkLabel, runBtn);
  card.appendChild(opts);
  host.appendChild(card);

  /* 結果 */
  const resCard = el('div', 'card');
  resCard.appendChild(el('h2', null, '整形結果'));
  const stat = el('p', 'stat');
  const out = el('pre', 'output');
  const warnHost = el('div');
  resCard.appendChild(stat);
  resCard.appendChild(out);
  resCard.appendChild(warnHost);

  const btnRow = el('div', 'btn-row');
  const copyBtn = el('button', 'btn btn-primary btn-sm', 'テロップをコピー');
  const srtBtn = el('button', 'btn btn-sm', 'SRTでコピー');
  const markBtn = el('button', 'btn btn-sm', '現在位置にマーカー');
  for (const b of [copyBtn, srtBtn, markBtn]) attr(b, { type: 'button' });
  add(btnRow, copyBtn, srtBtn, markBtn);
  resCard.appendChild(btnRow);
  host.appendChild(resCard);

  let lastLines = [];
  let lastSrt = '';

  runBtn.addEventListener('click', () => {
    const raw = ta.value;
    if (!raw.trim()) { toast('文字起こしを貼り付けてください'); return; }

    const maxChars = Number(maxIn.value) || 18;
    const dictionary = DATA.dictionary;

    clear(warnHost);
    const subs = parseSubtitles(raw);

    if (subs.length) {
      /* SRT / VTT として処理（タイムコードを保持） */
      const items = formatSubtitles(subs, { maxChars, dictionary });
      lastLines = items.map((i) => i.text);
      lastSrt = toSrt(items);
      out.textContent = items.map((i) => `${i.start} → ${i.end}\n${i.text}`).join('\n\n');
      stat.textContent = `字幕 ${subs.length}ブロック → テロップ ${items.length}行（タイムコード保持）`;

      const over = items.filter((i) => i.chars > maxChars);
      renderWarnings(warnHost, over.map((i) => `${i.index}行目: ${i.chars}文字（上限${maxChars}）`), dictionary, lastLines);
    } else {
      /* プレーンテキストとして処理 */
      const { lines, warnings, notation } = formatTelop(raw, { maxChars, dictionary });
      lastLines = lines;
      lastSrt = '';
      out.textContent = lines.join('\n');
      stat.textContent = `${lines.length}行 / 1行上限 ${maxChars}文字`
        + (spkIn.value ? ` / 話者: ${spkIn.value}` : '');

      renderWarningsDirect(warnHost, warnings, notation);
    }

    /* 人が確認すべき点は必ず出す */
    const manual = el('div', 'alert imp');
    const ul = el('ul');
    for (const t of [
      '話し言葉を不自然に直していないか（エンタメ・口語チャンネルでは直しすぎない）',
      '主語がない行に丸括弧で主語を補う必要がないか',
      '2行にする場合は上を短く、下を長くする',
      '子音発声の1フレーム前に表示する',
      '固有名詞は公式サイトで裏取りする',
      ...(spkIn.value ? ['複数話者の場合、話者ごとのテロップ色が統一されているか'] : [])
    ]) ul.appendChild(el('li', null, t));
    add(manual, el('strong', null, '人が確認すること'), ul);
    warnHost.appendChild(manual);
  });

  copyBtn.addEventListener('click', async () => {
    if (!lastLines.length) { toast('先に整形してください'); return; }
    const r = await adapter.copyToClipboard(lastLines.join('\n'));
    toast(r.message);
  });

  srtBtn.addEventListener('click', async () => {
    if (!lastSrt) { toast('SRT/VTTを貼り付けた場合のみ使えます'); return; }
    const r = await adapter.copyToClipboard(lastSrt);
    toast(r.message);
  });

  markBtn.addEventListener('click', async () => {
    const r = await adapter.addMarker({ name: 'テロップ確認', comment: lastLines[0] || '' });
    toast(r.message);
  });

  /* テロップの数値基準 */
  const stdCard = el('div', 'card');
  stdCard.appendChild(el('h2', null, 'テロップの基準'));
  stdCard.appendChild(numericTable(DATA.telopStandards));
  host.appendChild(stdCard);
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

const TABS = ['material', 'submit', 'telop', 'audio', 'cut'];

function selectTab(id) {
  TABS.forEach((t) => {
    const tab = document.getElementById('tab-' + t);
    const panel = document.getElementById('panel-' + t);
    const active = t === id;
    attr(tab, { 'aria-selected': active ? 'true' : 'false', tabindex: active ? '0' : '-1' });
    panel.hidden = !active;
  });
  window.scrollTo({ top: 0 });
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
