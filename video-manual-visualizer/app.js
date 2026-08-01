/*
 * app.js
 * 動画編集者 全体マニュアル ビジュアライザー
 *
 * 方針:
 *  - 外部APIやGoogle Sheetsへのfetchは行わない。全データは manual-data.js。
 *  - ユーザー入力を innerHTML へ入れない。DOM生成は createElement / textContent のみ。
 *  - 自動再生アニメーションを使わない。
 *  - チェック状態はページ再読み込み後に保持しない（メモリ上のみ）。
 */

(function () {
  'use strict';

  var DATA = window.MANUAL_DATA;

  /* ---------------------------------------------------------------- */
  /* DOM ユーティリティ（textContent のみ。innerHTML は使わない）        */
  /* ---------------------------------------------------------------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = String(text); }
    return node;
  }

  function attr(node, map) {
    Object.keys(map).forEach(function (k) {
      var v = map[k];
      if (v === false || v === null || v === undefined) { node.removeAttribute(k); }
      else { node.setAttribute(k, String(v)); }
    });
    return node;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var child = arguments[i];
      if (child) { parent.appendChild(child); }
    }
    return parent;
  }

  function clear(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
    return node;
  }

  function list(items, className, mapper) {
    var ul = el('ul', className || null);
    items.forEach(function (item) {
      var li = el('li');
      if (mapper) { mapper(li, item); } else { li.textContent = String(item); }
      ul.appendChild(li);
    });
    return ul;
  }

  function badge(ruleTypeId) {
    var def = DATA.ruleTypes.filter(function (r) { return r.id === ruleTypeId; })[0];
    if (!def) { return null; }
    var b = el('span', 'badge badge-' + def.id, def.label);
    attr(b, { title: def.description });
    return b;
  }

  /* ---------------------------------------------------------------- */
  /* トースト（コピー結果などを画面上で通知）                            */
  /* ---------------------------------------------------------------- */

  var toastNode = document.getElementById('toast');
  var toastTimer = null;

  function toast(message) {
    toastNode.textContent = message;
    toastNode.hidden = false;
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { toastNode.hidden = true; }, 2600);
  }

  /* ---------------------------------------------------------------- */
  /* テーマ切り替え                                                     */
  /* ---------------------------------------------------------------- */

  var themeBtn = document.getElementById('theme-toggle');

  function currentTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    if (set) { return set; }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeBtn.textContent = theme === 'dark' ? 'ライトモードにする' : 'ダークモードにする';
    attr(themeBtn, { 'aria-label': theme === 'dark' ? 'ライトモードに切り替える' : 'ダークモードに切り替える' });
  }

  themeBtn.addEventListener('click', function () {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
  applyTheme(currentTheme());

  /* ---------------------------------------------------------------- */
  /* 凡例（ルール種別の説明）                                           */
  /* ---------------------------------------------------------------- */

  function buildLegend() {
    var wrap = el('div', 'legend');
    attr(wrap, { role: 'note', 'aria-label': 'ルールの種類' });
    DATA.ruleTypes.forEach(function (r) {
      var item = el('div', 'legend-item');
      append(item, badge(r.id), el('span', 'desc', r.description));
      wrap.appendChild(item);
    });
    return wrap;
  }

  /* ================================================================ */
  /* 画面1: 全体工程マップ                                              */
  /* ================================================================ */

  var selectedProcessId = DATA.processes[0].id;

  function renderProcessDetail() {
    var host = document.getElementById('process-detail');
    clear(host);

    var p = DATA.processes.filter(function (x) { return x.id === selectedProcessId; })[0];
    if (!p) { return; }

    var card = el('div', 'card detail');

    var head = el('div', 'detail-head');
    append(head, el('h3', null, '工程' + p.no + '　' + p.title), badge(p.ruleType));
    card.appendChild(head);
    card.appendChild(el('p', 'detail-sum', p.summary));

    if (p.conflictNote) {
      var cn = el('div', 'callout');
      append(cn, el('strong', null, '⚠ 矛盾・要決定'), document.createTextNode(p.conflictNote));
      card.appendChild(cn);
    }
    if (p.improvementNote) {
      var im = el('div', 'callout improvement');
      append(im, el('strong', null, '＋ 改善候補（正式ルールではありません）'), document.createTextNode(p.improvementNote));
      card.appendChild(im);
    }

    var grid = el('div', 'detail-grid');

    function block(cls, title, items) {
      var b = el('div', 'detail-block ' + cls);
      append(b, el('h4', null, title), list(items));
      return b;
    }

    grid.appendChild(block('what', '何をするか', p.what));
    grid.appendChild(block('why', 'なぜ必要か', p.why));
    grid.appendChild(block('fail', 'よくある失敗', p.fails));
    grid.appendChild(block('done', '完了条件', p.done));

    var rel = el('div', 'detail-block rel');
    rel.appendChild(el('h4', null, '関連マニュアル'));
    var links = el('div', 'rel-links');
    p.related.forEach(function (rid) {
      var target = DATA.ledger.filter(function (l) { return l.id === rid; })[0];
      if (!target) { return; }
      var btn = el('button', 'rel-link', target.no + '. ' + target.title);
      attr(btn, { type: 'button' });
      btn.addEventListener('click', function () {
        selectTab('ledger');
        selectLedger(target.id);
      });
      links.appendChild(btn);
    });
    rel.appendChild(links);
    grid.appendChild(rel);

    card.appendChild(grid);
    host.appendChild(card);
  }

  function buildProcessMap() {
    var host = document.getElementById('panel-flow');
    clear(host);

    var head = el('div', 'panel-head');
    append(head,
      el('h2', null, '① 全体工程マップ'),
      el('p', 'lead', '依頼を受けてから納品・修正・保存するまでの13工程です。カードを選ぶと「何をするか／なぜ必要か／よくある失敗／完了条件／関連マニュアル」が開きます。')
    );
    host.appendChild(head);
    host.appendChild(buildLegend());

    var sec = el('section', 'section');
    sec.appendChild(el('h3', null, '工程の流れ（上から下、左から右へ進みます）'));
    sec.appendChild(el('p', 'section-note', '横に長く並べず、画面幅に合わせて折り返します。番号順に進めてください。複数工程を同時に行わず、1工程ずつ進めます。'));

    var ol = el('ol', 'flow');
    attr(ol, { 'aria-label': '制作工程一覧' });

    DATA.processes.forEach(function (p) {
      var li = el('li', 'flow-item');
      var btn = el('button', 'flow-node type-' + p.ruleType);
      attr(btn, {
        type: 'button',
        'aria-pressed': p.id === selectedProcessId ? 'true' : 'false',
        'data-process': p.id
      });
      append(btn,
        el('span', 'step-no', '工程 ' + p.no + ' / 13'),
        el('span', 'step-title', p.title),
        el('span', 'step-sum', p.summary)
      );
      btn.addEventListener('click', function () {
        selectedProcessId = p.id;
        Array.prototype.forEach.call(ol.querySelectorAll('.flow-node'), function (n) {
          attr(n, { 'aria-pressed': n.getAttribute('data-process') === p.id ? 'true' : 'false' });
        });
        renderProcessDetail();
        document.getElementById('process-detail').scrollIntoView({ block: 'nearest' });
      });
      li.appendChild(btn);
      ol.appendChild(li);
    });

    sec.appendChild(ol);
    host.appendChild(sec);

    var detailSec = el('section', 'section');
    detailSec.appendChild(el('h3', null, '選んだ工程の詳細'));
    var detailHost = el('div');
    attr(detailHost, { id: 'process-detail', 'aria-live': 'polite' });
    detailSec.appendChild(detailHost);
    host.appendChild(detailSec);

    renderProcessDetail();
  }

  /* ================================================================ */
  /* 画面2: 数値基準一覧                                                */
  /* ================================================================ */

  function barChart(items, opts) {
    opts = opts || {};
    var values = items.map(function (i) { return Math.abs(Number(i.value)); });
    var max = Math.max.apply(null, values.concat([1]));

    var wrap = el('div', 'bars');
    attr(wrap, { role: 'img', 'aria-label': opts.ariaLabel || 'グラフ' });

    items.forEach(function (i) {
      var row = el('div', 'bar-row');
      row.appendChild(el('div', 'bar-label', i.label));

      var track = el('div', 'bar-track');
      var fill = el('div', 'bar-fill' + (i.conflict ? ' is-conflict' : ''));
      fill.style.width = Math.max(3, (Math.abs(Number(i.value)) / max) * 100) + '%';
      track.appendChild(fill);

      var val = el('span', 'bar-value');
      /* display があればその文字列をそのまま数値として表示する（符号付きの値など） */
      val.appendChild(document.createTextNode(
        i.display !== undefined ? i.display : Number(i.value).toLocaleString('ja-JP')
      ));
      val.appendChild(el('span', 'unit', ' ' + (i.unit || '')));
      track.appendChild(val);

      row.appendChild(track);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function buildNumbers() {
    var host = document.getElementById('panel-numbers');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '② 数値基準一覧'),
        el('p', 'lead', '音量・文字数・画角・画像サイズなどの決まった数字です。数字と単位は原文のまま変えていません。')
      );
      return h;
    })());

    /* 音量グラフ（比較しやすいように図でも表示） */
    var volSec = el('section', 'section');
    volSec.appendChild(el('h3', null, '音量の基準（グラフ）'));
    volSec.appendChild(el('p', 'section-note', 'dB（デシベル）は音の大きさの単位です。0に近いほど大きく、マイナスが大きいほど小さい音になります。棒が長いほど「大きく絞っている＝小さい音」という意味です。'));
    var volCard = el('div', 'card');
    volCard.appendChild(barChart([
      { label: '演者音声', value: 6, display: '-6.0', unit: 'dB（いちばん大きい）' },
      { label: 'SE', value: 20, display: '-20.0', unit: 'dB' },
      { label: 'BGM', value: 29, display: '-29.0', unit: 'dB（いちばん小さい）' }
    ], { ariaLabel: 'トラック別ハードリミッター最大振幅。演者音声-6.0dB、SE-20.0dB、BGM-29.0dB。演者がいちばん大きく、BGMがいちばん小さい。' }));
    volCard.appendChild(el('p', 'stat-note', 'いずれもハードリミッターの「最大振幅」の値です。演者の声がいちばん大きく聞こえ、BGMがいちばん小さくなります。'));
    volSec.appendChild(volCard);
    host.appendChild(volSec);

    /* 演出頻度の矛盾グラフ */
    var confSec = el('section', 'section');
    confSec.appendChild(el('h3', null, '演出頻度（2つの基準が衝突しています）'));
    confSec.appendChild(el('p', 'section-note', 'マニュアル内に2つの数字があります。どちらが正式かは未決定です。自分で統一せず、ディレクターへ確認してください。'));
    var confCard = el('div', 'card');
    confCard.appendChild(barChart([
      { label: '演出・よくあるミス', value: 6, unit: '秒に1回', conflict: true },
      { label: '提出前チェック', value: 10, unit: '秒に1回', conflict: true }
    ], { ariaLabel: '演出頻度の基準。演出・よくあるミスは6秒に1回、提出前チェックは10秒に1回。' }));
    var confNote = el('div', 'audit-action', '⚠ 要決定：勝手に統一しないでください。案件の参考動画とディレクター確認を優先します。');
    confCard.appendChild(confNote);
    confSec.appendChild(confCard);
    host.appendChild(confSec);

    /* 全数値の表 */
    DATA.numericStandards.forEach(function (group) {
      var sec = el('section', 'section num-group');
      sec.appendChild(el('h3', null, group.group));
      if (group.unitNote) {
        sec.appendChild(el('p', 'unit-note', '用語メモ　' + group.unitNote));
      }

      var scroll = el('div', 'table-scroll');
      var table = el('table');
      var thead = el('thead');
      var trh = el('tr');
      ['項目', '基準値', '種別', '補足'].forEach(function (t) {
        var th = el('th', null, t);
        attr(th, { scope: 'col' });
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.appendChild(thead);

      var tbody = el('tbody');
      group.items.forEach(function (i) {
        var tr = el('tr');
        var th = el('th', null, i.name);
        attr(th, { scope: 'row' });
        tr.appendChild(th);

        var tdv = el('td', 'num');
        tdv.appendChild(document.createTextNode(i.value));
        if (i.unit && i.unit !== '—') {
          tdv.appendChild(el('span', 'unit', i.unit));
        }
        tr.appendChild(tdv);

        var tdt = el('td');
        tdt.appendChild(badge(i.ruleType));
        tr.appendChild(tdt);

        tr.appendChild(el('td', null, i.note || ''));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scroll.appendChild(table);
      sec.appendChild(scroll);
      host.appendChild(sec);
    });

    /* 品質評価基準 */
    var qSec = el('section', 'section');
    qSec.appendChild(el('h3', null, '品質評価基準（月末のロール変更と報酬判断の指標）'));
    qSec.appendChild(el('p', 'section-note', '案件ごとの評価が、月末のロール変更と報酬判断に使われます。目標はレベル1（現場標準）以上です。'));
    var levels = el('div', 'levels');
    DATA.qualityLevels.forEach(function (q) {
      var card = el('div', 'card level-card ' + q.id);
      var head = el('div', 'level-head');
      append(head,
        el('span', 'name', q.label),
        el('span', 'score', (q.score > 0 ? '+' : '') + q.score + '点'),
        el('span', 'caption', q.caption)
      );
      card.appendChild(head);
      card.appendChild(list(q.conditions));
      levels.appendChild(card);
    });
    qSec.appendChild(levels);
    host.appendChild(qSec);
  }

  /* ================================================================ */
  /* 画面3: 事故防止マップ                                              */
  /* ================================================================ */

  function buildAccidents() {
    var host = document.getElementById('panel-accidents');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '③ 事故防止マップ'),
        el('p', 'lead', '「原因 → 起きる事故 → 防止策 → 最終確認」の順に並べています。怖がるためではなく、行動に変えるための一覧です。')
      );
      return h;
    })());
    host.appendChild(buildLegend());

    var official = DATA.accidentMap.filter(function (a) { return a.ruleType !== 'improvement'; });
    var improve = DATA.accidentMap.filter(function (a) { return a.ruleType === 'improvement'; });

    function renderGroup(title, note, items) {
      var sec = el('section', 'section');
      sec.appendChild(el('h3', null, title));
      sec.appendChild(el('p', 'section-note', note));
      var wrap = el('div', 'accidents');
      items.forEach(function (a) {
        var card = el('div', 'card accident type-' + a.ruleType);
        var h4 = el('h4');
        append(h4, document.createTextNode(a.title), badge(a.ruleType));
        card.appendChild(h4);

        var chain = el('div', 'chain');
        [
          ['s1', '① 原因', a.cause],
          ['s2', '② 起きる事故', a.accident],
          ['s3', '③ 防止策', a.prevention],
          ['s4', '④ 最終確認', a.finalCheck]
        ].forEach(function (row) {
          var step = el('div', 'chain-step ' + row[0]);
          append(step, el('span', 'chain-label', row[1]), document.createTextNode(row[2]));
          chain.appendChild(step);
        });
        card.appendChild(chain);
        wrap.appendChild(card);
      });
      sec.appendChild(wrap);
      return sec;
    }

    host.appendChild(renderGroup(
      '正式ルールに基づく事故防止（' + official.length + '件）',
      'マニュアルに明記されているルールから作成しています。'
      , official));

    host.appendChild(renderGroup(
      '改善候補（' + improve.length + '件）※正式ルールではありません',
      '現行マニュアルには正式ルールとして存在しません。事故防止のため追加を検討すべき内容として、正式ルールとは分けて表示しています。',
      improve));
  }

  /* ================================================================ */
  /* 画面4: 提出前チェックリスト                                        */
  /* ================================================================ */

  var checkState = {};   /* 再読み込みでは保持しない（メモリのみ） */

  function buildChecklistSection(hostSec, titleText, noteText, items, keyPrefix, progressId) {
    hostSec.appendChild(el('h3', null, titleText));
    hostSec.appendChild(el('p', 'section-note', noteText));

    var toolbar = el('div', 'check-toolbar');
    var pw = el('div', 'progress-wrap');
    var ptext = el('div', 'progress-text');
    attr(ptext, { id: progressId + '-text', 'aria-live': 'polite' });
    var ptrack = el('div', 'progress-track');
    var pfill = el('div', 'progress-fill');
    ptrack.appendChild(pfill);
    append(pw, ptext, ptrack);
    toolbar.appendChild(pw);

    var resetBtn = el('button', 'btn', 'すべて外す');
    attr(resetBtn, { type: 'button' });
    toolbar.appendChild(resetBtn);
    hostSec.appendChild(toolbar);

    var ul = el('ul', 'checklist');

    function updateProgress() {
      var done = items.filter(function (c) { return checkState[keyPrefix + c.id]; }).length;
      var pct = items.length ? Math.round((done / items.length) * 100) : 0;
      ptext.textContent = done + ' / ' + items.length + ' 項目 完了（' + pct + '%）';
      pfill.style.width = pct + '%';
    }

    items.forEach(function (c) {
      var li = el('li');
      var label = el('label', 'check-item');
      var cb = el('input');
      attr(cb, { type: 'checkbox' });
      cb.checked = !!checkState[keyPrefix + c.id];

      var body = el('div', 'check-body');
      body.appendChild(el('span', 'check-text', c.text));
      if (c.note) { body.appendChild(el('span', 'check-note', '⚠ ' + c.note)); }

      append(label, cb, body);
      if (c.ruleType && c.ruleType !== 'official') { label.appendChild(badge(c.ruleType)); }

      function sync() {
        checkState[keyPrefix + c.id] = cb.checked;
        label.classList.toggle('is-done', cb.checked);
        updateProgress();
      }
      cb.addEventListener('change', sync);
      label.classList.toggle('is-done', cb.checked);

      li.appendChild(label);
      ul.appendChild(li);
    });

    resetBtn.addEventListener('click', function () {
      items.forEach(function (c) { checkState[keyPrefix + c.id] = false; });
      Array.prototype.forEach.call(ul.querySelectorAll('input[type="checkbox"]'), function (cb) {
        cb.checked = false;
        cb.closest('.check-item').classList.remove('is-done');
      });
      updateProgress();
      toast('チェックをすべて外しました');
    });

    hostSec.appendChild(ul);
    updateProgress();
  }

  function buildChecklist() {
    var host = document.getElementById('panel-check');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '④ 提出前チェックリスト'),
        el('p', 'lead', 'チェックはこの画面を開いている間だけ保持されます。ページを再読み込みすると外れます。')
      );
      return h;
    })());

    var s1 = el('section', 'section');
    buildChecklistSection(s1,
      '正式チェックリスト（18項目）',
      'マニュアルに明記されている項目です。すべて確認してから提出してください。',
      DATA.checklist, 'main-', 'progress-main');
    host.appendChild(s1);

    /* 3点提出と矛盾 */
    var tSec = el('section', 'section');
    tSec.appendChild(el('h3', null, '提出物（※方法が矛盾しています）'));
    var tCard = el('div', 'card');
    tCard.appendChild(el('p', null, DATA.submissionTriad.note));
    tCard.appendChild(list(DATA.submissionTriad.items, 'pill-list'));
    var warn = el('div', 'audit-action', '⚠ ' + DATA.submissionTriad.conflict);
    tCard.appendChild(warn);
    var phrase = el('div', 'detail-block what');
    append(phrase,
      el('h4', null, 'ディレクター提出時に記載する文言'),
      el('p', null, '「' + DATA.submissionTriad.directorPhrase + '」')
    );
    tCard.appendChild(phrase);
    var access = el('p', 'stat-note', '共有するチェックシートの一般的なアクセス設定：' + DATA.submissionTriad.sheetAccess.join('／'));
    tCard.appendChild(access);
    tSec.appendChild(tCard);
    host.appendChild(tSec);

    var s2 = el('section', 'section');
    buildChecklistSection(s2,
      '改善候補（12項目）※正式チェックではありません',
      '現行の正式チェックリストには入っていない項目です。事故防止のため追加を検討すべき内容として、正式ルールとは分けています。正式ルールとして扱わないでください。',
      DATA.checklistImprovements, 'imp-', 'progress-imp');
    host.appendChild(s2);

    var s3 = el('section', 'section');
    buildChecklistSection(s3,
      '切り抜き動画 納品前チェック（12項目）',
      '切り抜きを納品する前に確認する項目です。',
      DATA.clipChecklist, 'clip-', 'progress-clip');
    host.appendChild(s3);
  }

  /* ================================================================ */
  /* 画面5: 連絡テンプレート集                                          */
  /* ================================================================ */

  var tplFilter = 'すべて';

  function copyText(text, okMessage) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMessage : 'コピーできませんでした。本文を選択してコピーしてください');
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(okMessage);
      })['catch'](fallback);
    } else {
      fallback();
    }
  }

  function renderTemplates() {
    var wrap = document.getElementById('template-list');
    clear(wrap);

    var items = DATA.templates.filter(function (t) {
      return tplFilter === 'すべて' || t.category === tplFilter;
    });

    if (!items.length) {
      wrap.appendChild(el('p', 'empty-state', '該当するテンプレートがありません。'));
      return;
    }

    items.forEach(function (t) {
      var card = el('div', 'card');
      var head = el('div', 'tpl-head');
      append(head, el('h4', null, t.title), el('span', 'badge badge-official', t.category));
      /* カテゴリ表示はバッジ流用のため記号を消す */
      head.lastChild.className = 'chip';
      card.appendChild(head);

      if (t.purpose) { card.appendChild(el('p', 'tpl-purpose', t.purpose)); }

      var pre = el('pre', 'tpl-body', t.body);
      attr(pre, { tabindex: '0', 'aria-label': t.title + ' の本文' });
      card.appendChild(pre);

      if (t.ng || t.ok) {
        var ngok = el('div', 'ngok');
        if (t.ng) {
          var ngBox = el('div', 'ngok-box ng');
          append(ngBox, el('span', 'ngok-label', '✗ NG例'), list(t.ng));
          ngok.appendChild(ngBox);
        }
        if (t.ok) {
          var okBox = el('div', 'ngok-box ok');
          append(okBox, el('span', 'ngok-label', '✓ OK例'), list(t.ok));
          ngok.appendChild(okBox);
        }
        card.appendChild(ngok);
      }

      if (t.extra) { card.appendChild(el('p', 'stat-note', t.extra)); }

      var btn = el('button', 'btn btn-primary', '本文をコピー');
      attr(btn, { type: 'button' });
      btn.addEventListener('click', function () {
        copyText(t.body, '「' + t.title + '」をコピーしました');
      });
      card.appendChild(btn);

      wrap.appendChild(card);
    });
  }

  function buildTemplates() {
    var host = document.getElementById('panel-templates');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑤ 連絡テンプレート集'),
        el('p', 'lead', 'コピーボタンでそのまま使えます。Macは' + DATA.templateTools.mac + '、Windowsは' + DATA.templateTools.windows + 'へ登録しておくと早く送れます。')
      );
      return h;
    })());

    var whySec = el('section', 'section');
    whySec.appendChild(el('h3', null, 'なぜテンプレートを使うのか'));
    var whyCard = el('div', 'card');
    whyCard.appendChild(list(DATA.templateTools.reasons));
    whyCard.appendChild(el('p', 'stat-note', '⚠ ' + DATA.templateTools.note));
    whySec.appendChild(whyCard);
    host.appendChild(whySec);

    var sec = el('section', 'section');
    sec.appendChild(el('h3', null, 'テンプレート一覧（' + DATA.templates.length + '件）'));

    var cats = ['すべて'];
    DATA.templates.forEach(function (t) {
      if (cats.indexOf(t.category) === -1) { cats.push(t.category); }
    });

    var filter = el('div', 'tpl-filter');
    attr(filter, { role: 'group', 'aria-label': 'カテゴリで絞り込み' });
    cats.forEach(function (c) {
      var chip = el('button', 'chip', c);
      attr(chip, { type: 'button', 'aria-pressed': c === tplFilter ? 'true' : 'false' });
      chip.addEventListener('click', function () {
        tplFilter = c;
        Array.prototype.forEach.call(filter.querySelectorAll('.chip'), function (n) {
          attr(n, { 'aria-pressed': n.textContent === c ? 'true' : 'false' });
        });
        renderTemplates();
      });
      filter.appendChild(chip);
    });
    sec.appendChild(filter);

    var listWrap = el('div', 'templates');
    attr(listWrap, { id: 'template-list' });
    sec.appendChild(listWrap);
    host.appendChild(sec);

    renderTemplates();
  }

  /* ================================================================ */
  /* 画面6: 表記揺れ辞書                                                */
  /* ================================================================ */

  function buildDictionary() {
    var host = document.getElementById('panel-dictionary');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑥ 表記揺れ辞書'),
        el('p', 'lead', '左が誤表記、右が正しい表記です。この一覧の表記を間違えた場合は重大ミスとして扱う記載があります。ユーザー辞書へ登録してください。')
      );
      return h;
    })());

    var all = DATA.dictionary.concat(DATA.splitEditDictionary);
    var groups = ['すべて'];
    all.forEach(function (d) { if (groups.indexOf(d.group) === -1) { groups.push(d.group); } });

    var sec = el('section', 'section');

    var tools = el('div', 'dict-tools');

    var sf = el('div', 'search-field');
    var sl = el('label', null, '誤表記・正しい表記・読みで検索');
    attr(sl, { 'for': 'dict-search' });
    var si = el('input');
    attr(si, { type: 'search', id: 'dict-search', placeholder: '例：すべて / YouTube / うりあげ', autocomplete: 'off' });
    append(sf, sl, si);
    tools.appendChild(sf);

    var gf = el('div', 'select-field');
    var gl = el('label', null, '分類で絞り込み');
    attr(gl, { 'for': 'dict-group' });
    var gs = el('select');
    attr(gs, { id: 'dict-group' });
    groups.forEach(function (g) {
      var o = el('option', null, g);
      attr(o, { value: g });
      gs.appendChild(o);
    });
    append(gf, gl, gs);
    tools.appendChild(gf);

    sec.appendChild(tools);

    var count = el('p', 'dict-count');
    attr(count, { 'aria-live': 'polite' });
    sec.appendChild(count);

    var scroll = el('div', 'table-scroll');
    var table = el('table', 'dict-table');
    var thead = el('thead');
    var trh = el('tr');
    ['誤表記', '正しい表記', '読み方', '分類'].forEach(function (t) {
      var th = el('th', null, t);
      attr(th, { scope: 'col' });
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = el('tbody');
    table.appendChild(tbody);
    scroll.appendChild(table);
    sec.appendChild(scroll);

    var empty = el('p', 'empty-state', '一致する項目がありません。別の言葉で検索してください。');
    empty.hidden = true;
    sec.appendChild(empty);

    function render() {
      var q = si.value.trim().toLowerCase();
      var g = gs.value;
      clear(tbody);

      var rows = all.filter(function (d) {
        if (g !== 'すべて' && d.group !== g) { return false; }
        if (!q) { return true; }
        return (d.wrong + ' ' + d.correct + ' ' + d.reading + ' ' + (d.note || ''))
          .toLowerCase().indexOf(q) !== -1;
      });

      rows.forEach(function (d) {
        var tr = el('tr');
        tr.appendChild(el('td', 'wrong', d.wrong));
        var tdc = el('td', 'correct');
        tdc.appendChild(document.createTextNode(d.correct));
        if (d.note) { tdc.appendChild(el('span', 'note', '※ ' + d.note)); }
        tr.appendChild(tdc);
        tr.appendChild(el('td', null, d.reading));
        tr.appendChild(el('td', null, d.group));
        tbody.appendChild(tr);
      });

      count.textContent = rows.length + ' 件を表示中（全 ' + all.length + ' 件）';
      empty.hidden = rows.length > 0;
      scroll.hidden = rows.length === 0;
    }

    si.addEventListener('input', render);
    gs.addEventListener('change', render);

    host.appendChild(sec);
    render();
  }

  /* ================================================================ */
  /* 画面7: マニュアル監査                                              */
  /* ================================================================ */

  function buildAudit() {
    var host = document.getElementById('panel-audit');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑦ マニュアル監査'),
        el('p', 'lead', 'マニュアル自体の矛盾・古い説明・欠けたリンク・目次の問題です。正式ルールとは分けて表示しています。ここに載っている内容は、自分で判断せずディレクターへ確認してください。')
      );
      return h;
    })());

    /* 矛盾 */
    var cSec = el('section', 'section audit-group');
    cSec.appendChild(el('h3', null, '矛盾・要決定（' + DATA.audit.conflicts.length + '件）'));
    cSec.appendChild(el('p', 'section-note', 'マニュアル内で複数の基準が衝突しています。勝手に統一しないでください。'));
    DATA.audit.conflicts.forEach(function (c) {
      var card = el('div', 'card audit-item sev-' + c.severity);
      var h4 = el('h4');
      append(h4, document.createTextNode(c.title), badge('conflict'));
      card.appendChild(h4);
      card.appendChild(list(c.points, 'audit-points'));
      card.appendChild(el('p', 'audit-status', c.status));
      card.appendChild(el('div', 'audit-action', '→ ' + c.action));
      cSec.appendChild(card);
    });
    host.appendChild(cSec);

    /* 目次の問題 */
    var tSec = el('section', 'section audit-group');
    tSec.appendChild(el('h3', null, '目次の問題（' + DATA.audit.tocIssues.length + '件）'));
    tSec.appendChild(el('p', 'section-note', 'リンク先が存在しない、または目次に載っていない項目です。'));
    tSec.appendChild(list(DATA.audit.tocIssues, 'audit-list toc', function (li, item) {
      append(li, el('span', null, '⚠'), el('span', null, item.text));
    }));
    host.appendChild(tSec);

    /* 欠損説明 */
    var mSec = el('section', 'section audit-group');
    mSec.appendChild(el('h3', null, '欠損説明・参照先欠損（' + DATA.audit.missingLinks.length + '件）'));
    mSec.appendChild(el('p', 'section-note', '解説URLが空欄、または省略されています。'));
    mSec.appendChild(list(DATA.audit.missingLinks, 'audit-list missing', function (li, item) {
      append(li, el('span', 'badge badge-project', item.label), el('span', null, item.text));
    }));
    mSec.appendChild(el('div', 'policy-note', DATA.audit.missingLinkPolicy + '　このビジュアライザーにも、推測したURLは一切載せていません。'));
    host.appendChild(mSec);

    /* 要確認 */
    var qSec = el('section', 'section audit-group');
    qSec.appendChild(el('h3', null, '要確認（' + DATA.audit.needsConfirmation.length + '件）'));
    qSec.appendChild(el('p', 'section-note', 'ルールが記載されていないため、使う前にディレクターへ確認が必要な内容です。'));
    qSec.appendChild(list(DATA.audit.needsConfirmation, 'audit-list missing', function (li, item) {
      append(li, el('span', 'badge badge-project', item.label), el('span', null, item.text));
    }));
    host.appendChild(qSec);

    /* 古い説明 */
    var oSec = el('section', 'section audit-group');
    oSec.appendChild(el('h3', null, '古い説明（' + DATA.audit.outdated.length + '件）'));
    oSec.appendChild(el('p', 'section-note', '現行方針と衝突するため、正式ルールとして統合しないでください。'));
    oSec.appendChild(list(DATA.audit.outdated, 'audit-list toc', function (li, item) {
      var box = el('span');
      append(box, el('span', null, item.text), el('span', 'reason', '理由：' + item.reason));
      append(li, el('span', null, '旧'), box);
    }));
    host.appendChild(oSec);

    /* 改善候補 */
    var iSec = el('section', 'section audit-group');
    iSec.appendChild(el('h3', null, '改善候補（' + DATA.audit.improvements.length + '件）※正式ルールではありません'));
    iSec.appendChild(el('p', 'section-note', '現行マニュアルには正式ルールとして存在しませんが、事故防止のため追加を検討すべき内容です。正式ルールとして扱わないでください。'));
    iSec.appendChild(list(DATA.audit.improvements, 'audit-list improve', function (li, item) {
      var box = el('span');
      append(box, el('span', null, item.text), el('span', 'reason', '現状：' + item.reason));
      append(li, badge('improvement'), box);
    }));
    host.appendChild(iSec);

    /* 目次未掲載 */
    var nSec = el('section', 'section audit-group');
    nSec.appendChild(el('h3', null, '目次に載っていない項目'));
    nSec.appendChild(list(DATA.audit.notInToc, 'audit-list toc', function (li, item) {
      append(li, el('span', null, '⚠'), el('span', null, item.text));
    }));
    host.appendChild(nSec);
  }

  /* ================================================================ */
  /* 画面8: 27項目のマニュアル台帳                                      */
  /* ================================================================ */

  var selectedLedgerId = DATA.ledger[0].id;

  function renderLedgerBody() {
    var host = document.getElementById('ledger-body');
    clear(host);

    var l = DATA.ledger.filter(function (x) { return x.id === selectedLedgerId; })[0];
    if (!l) { return; }

    var card = el('div', 'card');
    var head = el('div', 'detail-head');
    append(head, el('h3', null, l.no + '. ' + l.title), badge(l.ruleType));
    card.appendChild(head);
    card.appendChild(el('p', 'ledger-lead', '結論：' + l.lead.replace(/^結論：/, '')));

    l.sections.forEach(function (s) {
      var sec = el('div', 'ledger-section');
      var h4 = el('h4');
      append(h4, document.createTextNode(s.heading), badge(s.ruleType));
      sec.appendChild(h4);
      sec.appendChild(list(s.items));
      card.appendChild(sec);
    });

    host.appendChild(card);
  }

  function selectLedger(id) {
    selectedLedgerId = id;
    var nav = document.getElementById('ledger-nav');
    if (nav) {
      Array.prototype.forEach.call(nav.querySelectorAll('.ledger-btn'), function (b) {
        attr(b, { 'aria-current': b.getAttribute('data-ledger') === id ? 'true' : 'false' });
      });
    }
    renderLedgerBody();
    var body = document.getElementById('ledger-body');
    if (body) { body.scrollIntoView({ block: 'nearest' }); }
  }

  function buildLedger() {
    var host = document.getElementById('panel-ledger');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑧ マニュアル台帳（全27項目）'),
        el('p', 'lead', '元マニュアルの27項目すべてを収録しています。左の一覧から選んでください。')
      );
      return h;
    })());
    host.appendChild(buildLegend());

    var layout = el('div', 'ledger-layout');

    var nav = el('nav', 'ledger-nav');
    attr(nav, { id: 'ledger-nav', 'aria-label': 'マニュアル27項目' });
    var ol = el('ol');
    DATA.ledger.forEach(function (l) {
      var li = el('li');
      var btn = el('button', 'ledger-btn');
      attr(btn, {
        type: 'button',
        'data-ledger': l.id,
        'aria-current': l.id === selectedLedgerId ? 'true' : 'false'
      });
      append(btn, el('span', 'no', l.no), el('span', null, l.title));
      btn.addEventListener('click', function () { selectLedger(l.id); });
      li.appendChild(btn);
      ol.appendChild(li);
    });
    nav.appendChild(ol);
    layout.appendChild(nav);

    var body = el('div', 'ledger-body');
    attr(body, { id: 'ledger-body', 'aria-live': 'polite' });
    layout.appendChild(body);

    host.appendChild(layout);
    renderLedgerBody();
  }

  /* ================================================================ */
  /* 画面9: 切り抜き動画                                                */
  /* ================================================================ */

  function buildClips() {
    var host = document.getElementById('panel-clips');
    clear(host);
    var C = DATA.clipWorkflow;

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑨ 切り抜き動画の作り方'),
        el('p', 'lead', '結論：クライアントの承認が出たあとの完成mp4だけを使います。最初の2秒で見るかどうかが決まります。')
      );
      return h;
    })());

    var fSec = el('section', 'section');
    fSec.appendChild(el('h3', null, '業務フロー（8ステップ）'));
    fSec.appendChild(list(C.flow, 'steps-flow'));
    var pCard = el('div', 'card');
    pCard.style.marginTop = '12px';
    append(pCard, el('h4', null, 'やってはいけないこと'), list(C.prohibited));
    fSec.appendChild(pCard);
    host.appendChild(fSec);

    var oSec = el('section', 'section');
    oSec.appendChild(el('h3', null, '冒頭2秒がすべて'));
    oSec.appendChild(el('p', 'section-note', C.openingNote));
    var oCard = el('div', 'card');
    append(oCard, el('h4', null, '冒頭に置く候補'), list(C.openingHooks, 'pill-list'));
    oSec.appendChild(oCard);
    host.appendChild(oSec);

    var two = el('section', 'section');
    two.appendChild(el('h3', null, '上下文言とシーン選定'));
    var grid = el('div', 'two-col');
    var c1 = el('div', 'card');
    append(c1, el('h4', null, '上下の文言'), list(C.overlayText));
    var c2 = el('div', 'card');
    append(c2, el('h4', null, 'シーン選定'), list(C.sceneSelection));
    append(grid, c1, c2);
    two.appendChild(grid);
    host.appendChild(two);

    var eSec = el('section', 'section');
    eSec.appendChild(el('h3', null, '書き出し設定と命名'));
    var eCard = el('div', 'card');
    var scroll = el('div', 'table-scroll');
    var table = el('table');
    var thead = el('thead');
    var trh = el('tr');
    ['項目', '縦型', '横型'].forEach(function (t) {
      var th = el('th', null, t); attr(th, { scope: 'col' }); trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tb = el('tbody');
    [
      ['画面比率', '9:16', '16:9'],
      ['解像度', '1,080×1,920 px', '1,920×1,080 px'],
      ['形式', 'MP4 / H.264', 'MP4 / H.264'],
      ['主な投稿先', 'YouTube Shorts / TikTok / Instagramリール', '—']
    ].forEach(function (row) {
      var tr = el('tr');
      var th = el('th', null, row[0]); attr(th, { scope: 'row' }); tr.appendChild(th);
      tr.appendChild(el('td', null, row[1]));
      tr.appendChild(el('td', null, row[2]));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    scroll.appendChild(table);
    eCard.appendChild(scroll);
    eCard.appendChild(el('p', 'stat-note', '命名規則：' + C.naming + '　／　' + C.namingNote));
    eSec.appendChild(eCard);
    host.appendChild(eSec);

    var tSec = el('section', 'section');
    tSec.appendChild(el('h3', null, 'タイトルとコピーの作り方'));
    var tGrid = el('div', 'two-col');

    var t1 = el('div', 'card');
    append(t1, el('h4', null, 'タイトル4要素'), list(C.titleElements, null, function (li, item) {
      li.textContent = item;
    }), el('p', 'stat-note', C.titleNote));
    tGrid.appendChild(t1);

    var t2 = el('div', 'card');
    append(t2,
      el('h4', null, '刺さるコピーの4原則'),
      list(C.copyPrinciples),
      el('p', 'stat-note', C.copyPurpose),
      el('p', 'stat-note', C.copyStructure)
    );
    tGrid.appendChild(t2);
    tSec.appendChild(tGrid);

    var typeCard = el('div', 'card');
    typeCard.style.marginTop = '12px';
    typeCard.appendChild(el('h4', null, 'タイプ別のアプローチ'));
    var tScroll = el('div', 'table-scroll');
    var tTable = el('table');
    var tHead = el('thead');
    var tTr = el('tr');
    ['タイプ', 'アプローチ'].forEach(function (t) {
      var th = el('th', null, t); attr(th, { scope: 'col' }); tTr.appendChild(th);
    });
    tHead.appendChild(tTr);
    tTable.appendChild(tHead);
    var tBody = el('tbody');
    C.copyTypes.forEach(function (ct) {
      var tr = el('tr');
      var th = el('th', null, ct.type); attr(th, { scope: 'row' }); tr.appendChild(th);
      tr.appendChild(el('td', null, ct.approach));
      tBody.appendChild(tr);
    });
    tTable.appendChild(tBody);
    tScroll.appendChild(tTable);
    typeCard.appendChild(tScroll);
    tSec.appendChild(typeCard);

    var ngCard = el('div', 'card');
    ngCard.style.marginTop = '12px';
    var ngBox = el('div', 'ngok-box ng');
    append(ngBox, el('span', 'ngok-label', '✗ コピーの禁止事項'), list(C.copyProhibited));
    append(ngCard, ngBox);
    tSec.appendChild(ngCard);

    host.appendChild(tSec);
  }

  /* ================================================================ */
  /* 画面10: 中級編集者からディレクターへ                                */
  /* ================================================================ */

  function buildGrowth() {
    var host = document.getElementById('panel-growth');
    clear(host);
    var G = DATA.directorPath;

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑩ 中級編集者からディレクターへ'),
        el('p', 'lead', G.definition)
      );
      return h;
    })());

    var cSec = el('section', 'section');
    cSec.appendChild(el('h3', null, 'キャリアの選択肢'));
    var cGrid = el('div', 'levels');
    G.careers.forEach(function (c) {
      var card = el('div', 'card');
      append(card, el('h4', null, c.name), el('p', null, c.detail));
      cGrid.appendChild(card);
    });
    cSec.appendChild(cGrid);
    host.appendChild(cSec);

    var sSec = el('section', 'section');
    sSec.appendChild(el('h3', null, '進み方（現在 → STEP1 → STEP2 → STEP3 → STEP4）'));
    sSec.appendChild(el('p', 'section-note', '見る力 → 伝える力 → 判断する力 → 管理する力の順に伸ばします。'));
    var grid = el('div', 'growth');
    G.steps.forEach(function (s) {
      var card = el('div', 'card growth-card');
      append(card, el('div', 'label', s.label), el('h4', null, s.title), list(s.tasks));
      if (s.skill) { card.appendChild(el('p', 'skill', '身に付く力：' + s.skill)); }
      grid.appendChild(card);
    });
    sSec.appendChild(grid);
    host.appendChild(sSec);

    var iSec = el('section', 'section');
    var iCard = el('div', 'card callout improvement');
    append(iCard, el('strong', null, '＋ 改善候補（正式ルールではありません）'), document.createTextNode(G.improvementNote));
    iSec.appendChild(iCard);
    host.appendChild(iSec);
  }

  /* ================================================================ */
  /* 画面11: 統計グラフ                                                 */
  /* ================================================================ */

  function buildStats() {
    var host = document.getElementById('panel-stats');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑪ マニュアルの数字'),
        el('p', 'lead', 'マニュアルを集計した実測値です。架空の品質スコアは作っていません。')
      );
      return h;
    })());
    host.appendChild(el('p', 'stat-note', DATA.stats.note));

    var k = el('section', 'section');
    k.appendChild(el('h3', null, 'マニュアルによく出てくる言葉'));
    k.appendChild(el('p', 'section-note', '「確認」が94回でいちばん多く出てきます。このマニュアルが何を大事にしているかが分かります。'));
    var kCard = el('div', 'card');
    kCard.appendChild(barChart(DATA.stats.keywordCounts.map(function (x) {
      return { label: x.label, value: x.value, unit: x.unit };
    }), { ariaLabel: '主要語の出現回数。確認94回、必ず55回、ディレクター49回、提出44回、NG35回、連絡29回、絶対12回。' }));
    k.appendChild(kCard);
    host.appendChild(k);

    var m = el('section', 'section');
    m.appendChild(el('h3', null, '画像・動画解説への参照'));
    var mCard = el('div', 'card');
    mCard.appendChild(barChart(DATA.stats.mediaRefs.map(function (x) {
      return { label: x.label, value: x.value, unit: x.unit };
    }), { ariaLabel: '画像という語が80回、動画解説という語が23回。' }));
    m.appendChild(mCard);
    host.appendChild(m);

    var v = el('section', 'section');
    v.appendChild(el('h3', null, '情報量が多い項目（文字数）'));
    v.appendChild(el('p', 'section-note', '文字数が多い項目ほど、覚えることが多い項目です。テロップがいちばん多く4,505文字あります。'));
    var vCard = el('div', 'card');
    vCard.appendChild(barChart(DATA.stats.volume.map(function (x) {
      return { label: x.label, value: x.value, unit: x.unit };
    }), { ariaLabel: '項目別の文字数。テロップ4505文字が最多。' }));
    v.appendChild(vCard);
    host.appendChild(v);
  }

  /* ================================================================ */
  /* 画面12: 用語集                                                     */
  /* ================================================================ */

  function buildGlossary() {
    var host = document.getElementById('panel-glossary');
    clear(host);

    append(host, (function () {
      var h = el('div', 'panel-head');
      append(h,
        el('h2', null, '⑫ 用語集'),
        el('p', 'lead', 'マニュアルに出てくる専門用語を、はじめて聞く人向けに説明しています。')
      );
      return h;
    })());

    var sec = el('section', 'section');

    var sf = el('div', 'search-field');
    sf.style.marginBottom = '14px';
    var sl = el('label', null, '用語を検索');
    attr(sl, { 'for': 'gloss-search' });
    var si = el('input');
    attr(si, { type: 'search', id: 'gloss-search', placeholder: '例：ネスト / dB / セーフマージン', autocomplete: 'off' });
    append(sf, sl, si);
    sec.appendChild(sf);

    var count = el('p', 'dict-count');
    attr(count, { 'aria-live': 'polite' });
    sec.appendChild(count);

    var dl = el('dl', 'glossary');
    sec.appendChild(dl);

    var empty = el('p', 'empty-state', '一致する用語がありません。');
    empty.hidden = true;
    sec.appendChild(empty);

    function render() {
      var q = si.value.trim().toLowerCase();
      clear(dl);
      var rows = DATA.glossary.filter(function (g) {
        if (!q) { return true; }
        return (g.term + ' ' + g.reading + ' ' + g.desc).toLowerCase().indexOf(q) !== -1;
      });
      rows.forEach(function (g) {
        var item = el('div', 'gloss-item');
        var dt = el('dt');
        dt.appendChild(document.createTextNode(g.term));
        if (g.reading) { dt.appendChild(el('span', 'reading', g.reading)); }
        var dd = el('dd', null, g.desc);
        append(item, dt, dd);
        dl.appendChild(item);
      });
      count.textContent = rows.length + ' 件を表示中（全 ' + DATA.glossary.length + ' 件）';
      empty.hidden = rows.length > 0;
    }

    si.addEventListener('input', render);
    host.appendChild(sec);
    render();
  }

  /* ================================================================ */
  /* オフィス                                                           */
  /* ================================================================ */

  /*
   * エージェントの席を等角で描く画面。
   * 絵は office.js、組み立ては office-panel.js が持つ。
   * 役割定義は .claude/agents/*.md が唯一の定義元で、
   * tools/build-office-data.mjs が office-data.js を生成している。
   */
  function buildOffice() {
    var host = document.getElementById('panel-office');
    if (!host) return;

    var missing = [];
    if (typeof OFFICE_DATA === 'undefined') missing.push('office-data.js');
    if (typeof IsoOffice === 'undefined') missing.push('office.js');
    if (typeof OfficePanel === 'undefined') missing.push('office-panel.js');

    /* 白い画面のまま原因が分からない状態を避ける。 */
    if (missing.length) {
      host.innerHTML = '<div class="notice notice-warn"><p>オフィス画面を表示できません。' +
        '次のファイルが読み込まれていません：' + missing.join('、') + '</p>' +
        '<p>office-data.js が無い場合は <code>node tools/build-office-data.mjs</code> を実行してください。</p></div>';
      return;
    }

    try {
      OfficePanel.build(host, OFFICE_DATA, DATA);
    } catch (e) {
      host.innerHTML = '<div class="notice notice-warn"><p>オフィス画面の組み立てに失敗しました：' +
        String(e && e.message ? e.message : e) + '</p></div>';
    }
  }

  /* ================================================================ */
  /* タブ制御                                                           */
  /* ================================================================ */

  var TABS = [
    { id: 'flow',       label: '全体工程マップ',   no: '①' },
    { id: 'numbers',    label: '数値基準',         no: '②' },
    { id: 'accidents',  label: '事故防止マップ',   no: '③' },
    { id: 'check',      label: '提出前チェック',   no: '④' },
    { id: 'templates',  label: '連絡テンプレ',     no: '⑤' },
    { id: 'dictionary', label: '表記揺れ辞書',     no: '⑥' },
    { id: 'audit',      label: 'マニュアル監査',   no: '⑦' },
    { id: 'ledger',     label: '27項目台帳',       no: '⑧' },
    { id: 'clips',      label: '切り抜き',         no: '⑨' },
    { id: 'growth',     label: 'ディレクターへ',   no: '⑩' },
    { id: 'stats',      label: '数字で見る',       no: '⑪' },
    { id: 'glossary',   label: '用語集',           no: '⑫' },
    { id: 'office',     label: 'オフィス',         no: '⑬' }
  ];

  function selectTab(id) {
    TABS.forEach(function (t) {
      var tab = document.getElementById('tab-' + t.id);
      var panel = document.getElementById('panel-' + t.id);
      var active = t.id === id;
      attr(tab, { 'aria-selected': active ? 'true' : 'false', tabindex: active ? '0' : '-1' });
      panel.hidden = !active;
    });
    window.scrollTo({ top: 0 });
  }

  function buildTabs() {
    var nav = document.getElementById('tabs-inner');
    clear(nav);

    TABS.forEach(function (t, index) {
      var btn = el('button', 'tab');
      attr(btn, {
        type: 'button',
        role: 'tab',
        id: 'tab-' + t.id,
        'aria-controls': 'panel-' + t.id,
        'aria-selected': index === 0 ? 'true' : 'false',
        tabindex: index === 0 ? '0' : '-1'
      });
      append(btn, el('span', 'tab-no', t.no), document.createTextNode(t.label));
      btn.addEventListener('click', function () { selectTab(t.id); });

      /* 矢印キーでタブ移動できるようにする */
      btn.addEventListener('keydown', function (e) {
        var delta = 0;
        if (e.key === 'ArrowRight') { delta = 1; }
        else if (e.key === 'ArrowLeft') { delta = -1; }
        else if (e.key === 'Home') { delta = -index; }
        else if (e.key === 'End') { delta = TABS.length - 1 - index; }
        else { return; }
        e.preventDefault();
        var next = (index + delta + TABS.length) % TABS.length;
        selectTab(TABS[next].id);
        document.getElementById('tab-' + TABS[next].id).focus();
      });

      nav.appendChild(btn);
    });
  }

  /* ================================================================ */
  /* 起動                                                               */
  /* ================================================================ */

  function init() {
    buildTabs();
    buildProcessMap();
    buildNumbers();
    buildAccidents();
    buildChecklist();
    buildTemplates();
    buildDictionary();
    buildAudit();
    buildLedger();
    buildClips();
    buildGrowth();
    buildStats();
    buildGlossary();
    buildOffice();
    selectTab('flow');

    var stamp = document.getElementById('data-stamp');
    if (stamp) {
      stamp.textContent =
        '収録データ：制作工程 ' + DATA.processes.length + '工程／' +
        'マニュアル台帳 ' + DATA.ledger.length + '項目／' +
        '数値基準 ' + DATA.numericStandards.reduce(function (n, g) { return n + g.items.length; }, 0) + '件／' +
        '提出前チェック ' + DATA.checklist.length + '項目（改善候補 ' + DATA.checklistImprovements.length + '項目は別管理）／' +
        '連絡テンプレート ' + DATA.templates.length + '件／' +
        '表記揺れ辞書 ' + (DATA.dictionary.length + DATA.splitEditDictionary.length) + '件／' +
        '事故防止 ' + DATA.accidentMap.length + '件／' +
        '用語集 ' + DATA.glossary.length + '件';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
