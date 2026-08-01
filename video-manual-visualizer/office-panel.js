/*
 * office-panel.js
 *
 * ENGULF のオフィス画面の組み立て。
 * 等角の絵（office.js）に、稼働状況・吹き出し・会話・作業ログ・役割定義を重ねる。
 *
 * === 本物と再現の区別 ===
 *
 * この画面には2種類の動きがある。混ぜないことが一番大事。
 *
 * 1. 作業ボタンの実行 …… 本物。MANUAL_DATA から実際に値を引く。
 * 2. 働いている風景   …… 再現。移動・会話はアンビエントで、
 *    台詞の内容は office-ambient.js にある実在ルールの台本から出る。
 *
 * どちらであるかは画面にも明記する（凡例とログの種別）。
 * ブラウザは stdio の MCP サーバーへ直接つながらないため、
 * ターミナル側の稼働そのものは映せない。できないことをできるように見せない。
 */

(function (root, factory) {
  var api = factory();
  root.OfficePanel = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATE_LABEL = { idle: '待機中', working: '作業中', talking: '会話中', away: '離席中' };

  /* ---------------------------------------------------------------- */
  /* 作業の定義（本物。MANUAL_DATA から実際に値を引く）                  */
  /* ---------------------------------------------------------------- */

  function buildJobs(D) {
    function countStandards() {
      return D.numericStandards.reduce(function (n, g) { return n + g.items.length; }, 0);
    }

    return [
      {
        id: 'notation', agent: 'common-manual', label: '表記チェック',
        say: '表記揺れ辞書と照合します',
        work: function () {
          var n = D.dictionary.length + D.splitEditDictionary.length;
          return {
            headline: '表記揺れ辞書 ' + n + '件と照合できます',
            rows: D.dictionary.slice(0, 6).map(function (e) {
              return (e.wrong || '') + ' → ' + (e.right || '');
            }),
            note: '本編辞書 ' + D.dictionary.length + '件／分割編集シート ' +
              D.splitEditDictionary.length + '件。この一覧の表記を間違えた場合は重大ミスとして扱う記載があります。'
          };
        }
      },
      {
        id: 'numbers', agent: 'common-manual', label: '数値基準を引く',
        say: '数字は丸めずそのまま出します',
        work: function () {
          var rows = [];
          D.numericStandards.forEach(function (g) {
            g.items.slice(0, 2).forEach(function (it) {
              rows.push(g.group + '：' + it.name + ' = ' + it.value + (it.unit ? ' ' + it.unit : ''));
            });
          });
          return {
            headline: '数値基準 ' + countStandards() + '件',
            rows: rows.slice(0, 8),
            note: '数字・単位・条件は変更しません。-6.0dB を「約-6dB」に丸めない、15〜18文字を「16文字」にしない。'
          };
        }
      },
      {
        id: 'conflicts', agent: 'project-manual', label: '未決定の確認',
        say: '案件側で上書きされているか見ます',
        work: function () {
          var rows = (D.audit && D.audit.conflicts ? D.audit.conflicts : []).map(function (c) {
            return (c.topic || c.title || '') + '：' + (c.summary || c.detail || '');
          });
          return {
            headline: '未決定・矛盾 ' + rows.length + '件',
            rows: rows,
            note: '勝手に解決しません。案件マニュアルに記載があればそちらが優先されます（クライアント指定 → 案件 → チャンネル → 共通）。'
          };
        }
      },
      {
        id: 'cutrules', agent: 'cutter', label: 'カット基準を引く',
        say: '候補はフレーム番号で出します',
        work: function () {
          var proc = (D.processes || []).filter(function (pr) {
            return /粗カット|細カット/.test(pr.title || pr.name || '');
          });
          var rows = [];
          proc.forEach(function (pr) {
            (pr.actions || pr.what || []).slice(0, 3).forEach(function (t) { rows.push(t); });
          });
          if (!rows.length) rows.push('工程4（粗カット）・工程5（細カット）の詳細は全体工程マップ参照');
          return {
            headline: 'カットの基準（工程4・5）',
            rows: rows.slice(0, 8),
            note: '自動ツールの出力も必ず目視確認します。ケバは取りすぎると不自然になります。カット対象は案件マニュアルが優先です。'
          };
        }
      },
      {
        id: 'design', agent: 'design', label: '図解ルールを引く',
        say: '生成前に制約を確認します',
        work: function () {
          var g = D.numericStandards.filter(function (x) {
            return /画像|演出|画角/.test(x.group);
          });
          var rows = [];
          g.forEach(function (grp) {
            grp.items.forEach(function (it) {
              rows.push(it.name + ' = ' + it.value + (it.unit ? ' ' + it.unit : ''));
            });
          });
          return {
            headline: '図解・画像の制約',
            rows: rows.slice(0, 8).concat([
              '使用色は3色以内',
              '完了条件：音量を0にして図解だけを見ても内容が理解できること'
            ]),
            note: '実際の画像生成は Codex 側で行います。Claude Code は画像を作れません。'
          };
        }
      },
      {
        id: 'telop', agent: 'telop', label: 'テロップ規定を引く',
        say: '改行位置と表記だけ整えます',
        work: function () {
          var grp = D.numericStandards.filter(function (x) { return /テロップ/.test(x.group); })[0];
          var rows = (grp ? grp.items : []).map(function (it) {
            return it.name + ' = ' + it.value + (it.unit ? ' ' + it.unit : '');
          });
          return {
            headline: 'テロップの基準',
            rows: rows,
            note: '文字起こしの文章は綺麗に書き換えません。話し言葉はそのまま残します。'
          };
        }
      },
      {
        id: 'audio', agent: 'mixer', label: '音量基準を引く',
        say: 'dB値は丸めません',
        work: function () {
          var grp = D.numericStandards.filter(function (x) { return /音量|音声/.test(x.group); })[0];
          var rows = (grp ? grp.items : []).map(function (it) {
            return it.name + ' = ' + it.value + (it.unit ? ' ' + it.unit : '');
          });
          return {
            headline: '音量・音声処理の基準',
            rows: rows.slice(0, 9),
            note: 'SEは演出テロップ・画像・画角変化とセット。同じSEを連続で使いません。BGMは最後に入れます。'
          };
        }
      },
      {
        id: 'quality', agent: 'director', label: '品質評価レベル',
        say: '提出してよいか決めます',
        work: function () {
          var rows = (D.qualityLevels || []).map(function (q) {
            return (q.score != null ? q.score + '点' : '') + '：' + (q.label || q.name || '') +
              (q.detail ? ' — ' + q.detail : '');
          });
          return {
            headline: '品質評価レベル ' + rows.length + '段階',
            rows: rows,
            note: '演出頻度と提出方法の確定はディレクターの権限です。'
          };
        }
      },
      {
        id: 'audit', agent: 'cto', label: '全体監査',
        say: '印象では判断しません',
        work: function () {
          var a = D.audit || {};
          var rows = [
            '矛盾：' + ((a.conflicts || []).length) + '件',
            '欠損リンク：' + ((a.missingLinks || a.missing || []).length) + '件',
            '要確認：' + ((a.needsCheck || a.unclear || []).length) + '件',
            '提出前チェック（正式）：' + D.checklist.length + '項目',
            '改善候補（正式ではない）：' + D.checklistImprovements.length + '項目'
          ];
          return {
            headline: 'ブラウザ側で見える範囲の集計',
            rows: rows,
            note: '出荷可否（GO / NO-GO）の判定は node agents/governance.mjs の実行結果に基づきます。' +
              'この画面はデータの集計だけで、判定ではありません。'
          };
        }
      }
    ];
  }

  /* 実在の生成物。成果物モニターに出す。 */
  var DELIVERABLES = [
    { file: 'agents/knowledge/common-manual.md', desc: '共通マニュアル知識ベース（自動生成）' },
    { file: 'uxp-plugin/data/manual-snapshot.js', desc: 'Premiereプラグイン用スナップショット' },
    { file: 'video-manual-visualizer/office-data.js', desc: '役割定義の写し（11席）' },
    { file: 'agents/roadmap-frame-zero.md', desc: 'FRAME ZERO 完全自動化ロードマップ' },
    { file: 'dist/index.html', desc: '配布用1ファイルWebアプリ' }
  ];

  /* ---------------------------------------------------------------- */
  /* ユーティリティ                                                     */
  /* ---------------------------------------------------------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function now() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------------------------------------------------------------- */
  /* 組み立て                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * @param {HTMLElement} host  描画先
   * @param {object} office     office-data.js
   * @param {object} D          manual-data.js
   */
  function build(host, office, D) {
    var Iso = root_get('IsoOffice', 'office.js');
    var AMB = root_get('OFFICE_AMBIENT', 'office-ambient.js');
    var scene = Iso.render(office);
    var jobs = buildJobs(D);
    var byId = {};
    office.agents.forEach(function (a) { byId[a.id] = a; });

    var reduceMotion = false;
    try {
      reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { /* Node環境では無視 */ }

    var co = office.company || { name: 'ENGULF', project: '', mission: '' };

    host.innerHTML =
      '<div class="office">' +
        '<div class="office-main">' +

          /* --- 会社ヘッダー --- */
          '<header class="engulf-head">' +
            '<div class="engulf-brand">' +
              '<span class="engulf-logo">' + esc(co.name) + '</span>' +
              '<span class="engulf-project">PROJECT: ' + esc(co.project) + '</span>' +
            '</div>' +
            '<p class="engulf-mission">' + esc(co.mission) + '</p>' +
            '<div class="engulf-meta">' +
              '<span class="engulf-chip engulf-chip-gold">Claude Code チーム ' +
                office.agents.filter(function (a) { return a.runtime === 'Claude Code'; }).length + '名</span>' +
              '<span class="engulf-chip engulf-chip-ocean">Codex チーム ' +
                office.agents.filter(function (a) { return a.runtime === 'Codex'; }).length + '名</span>' +
              '<button type="button" class="engulf-toggle" id="ambient-toggle" aria-pressed="true">' +
                '働く風景の再現：ON</button>' +
            '</div>' +
          '</header>' +

          /* --- 舞台 --- */
          '<div class="office-stage" id="office-stage">' +
            scene.svg +
            '<div class="office-bubbles" id="office-bubbles"></div>' +
            '<div class="office-zonelabels" id="office-zonelabels"></div>' +
            '<div class="office-badge" id="office-badge">' +
              '<span class="office-dot"></span><span data-badge>全員待機中</span></div>' +
          '</div>' +

          '<p class="office-legend">会話・移動は体制ルールとマニュアルに基づく<strong>再現</strong>です。' +
            '下の<strong>作業ボタン</strong>の実行だけが実データ照会です。</p>' +

          /* --- 制作プラン（現状確認 → 残り工程） --- */
          '<div class="office-planner">' +
            '<div class="office-planner-head"><strong>制作プラン</strong>' +
              '<span>今どこまで終わったかを選ぶと、残りの工程と効率の型を実データから組み立てます</span></div>' +
            '<div class="office-planner-controls">' +
              '<label for="plan-done">完了した工程</label>' +
              '<select id="plan-done"></select>' +
              '<button type="button" class="office-plan-btn" id="plan-run">プランを立てる</button>' +
            '</div>' +
          '</div>' +

          '<div class="office-jobs" id="office-jobs" role="group" aria-label="実行できる作業"></div>' +
          '<div class="office-result" id="office-result" aria-live="polite"></div>' +
        '</div>' +

        '<aside class="office-side">' +
          '<h3 class="office-h">在席</h3>' +
          '<div id="office-roster"></div>' +
          '<h3 class="office-h">成果物モニター</h3>' +
          '<ul class="office-deliv" id="office-deliv"></ul>' +
          '<h3 class="office-h">作業ログ</h3>' +
          '<ol class="office-log" id="office-log" aria-live="polite"></ol>' +
        '</aside>' +
      '</div>';

    var stage = host.querySelector('#office-stage');
    var svgEl = stage.querySelector('svg');
    var walkLayer = stage.querySelector('#iso-walkers');
    var bubbles = host.querySelector('#office-bubbles');
    var zoneLabels = host.querySelector('#office-zonelabels');
    var roster = host.querySelector('#office-roster');
    var log = host.querySelector('#office-log');
    var result = host.querySelector('#office-result');
    var jobsBox = host.querySelector('#office-jobs');
    var badge = host.querySelector('#office-badge');
    var delivBox = host.querySelector('#office-deliv');
    var toggleBtn = host.querySelector('#ambient-toggle');

    var vb = scene.viewBox;

    /* viewBox座標 → ステージ内の% */
    function toPct(pt) {
      return {
        left: (((pt.x - vb.x) / vb.w) * 100).toFixed(2) + '%',
        top: (((pt.y - vb.y) / vb.h) * 100).toFixed(2) + '%'
      };
    }

    /* --- 部門ラベル ------------------------------------------------ */
    [
      { key: 'audit', text: '監査室', cls: '' },
      { key: 'claude', text: '制作部門｜Claude Code チーム', cls: 'is-gold' },
      { key: 'codex', text: '制作部門｜Codex チーム', cls: 'is-ocean' }
    ].forEach(function (z) {
      var pos = toPct(scene.zoneLabels[z.key]);
      var el = document.createElement('span');
      el.className = 'office-zonelabel ' + z.cls;
      el.textContent = z.text;
      el.style.left = pos.left;
      el.style.top = pos.top;
      zoneLabels.appendChild(el);
    });

    /* --- 吹き出し --------------------------------------------------- */
    office.agents.forEach(function (a) {
      var pos = toPct(scene.anchors[a.id]);
      var b = document.createElement('div');
      b.className = 'office-bubble';
      b.dataset.agent = a.id;
      b.style.left = pos.left;
      b.style.top = pos.top;
      bubbles.appendChild(b);
    });
    /* 会話用の追加吹き出し（歩行者・テーブル用） */
    var freeBubble = document.createElement('div');
    freeBubble.className = 'office-bubble office-bubble-free';
    bubbles.appendChild(freeBubble);

    /* --- 在席一覧（部門ごと） --------------------------------------- */
    var teams = office.teams || {};
    var order = Object.keys(teams).sort(function (a, b) {
      return (teams[a].order || 9) - (teams[b].order || 9);
    });
    order.forEach(function (tk) {
      var members = office.agents.filter(function (a) { return a.team === tk; });
      if (!members.length) return;
      var h = document.createElement('h4');
      h.className = 'office-team-h' +
        (tk === 'claude' ? ' is-gold' : tk === 'codex' ? ' is-ocean' : '');
      h.textContent = teams[tk].label;
      roster.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'office-roster';
      members.forEach(function (a) {
        var li = document.createElement('li');
        li.className = 'office-seat';
        li.dataset.agent = a.id;
        li.innerHTML =
          '<button type="button" class="office-seat-btn">' +
            '<span class="office-chip" style="background:' + esc(a.accent) + '"></span>' +
            '<span class="office-seat-name">' + esc(a.label) + '</span>' +
            '<span class="office-seat-role">' + esc(a.runtime) + '</span>' +
            '<span class="office-seat-state" data-state>待機中</span>' +
          '</button>';
        li.querySelector('button').addEventListener('click', function () { showRole(a.id); });
        ul.appendChild(li);
      });
      roster.appendChild(ul);
    });

    /* --- 成果物モニター --------------------------------------------- */
    DELIVERABLES.forEach(function (d) {
      var li = document.createElement('li');
      li.innerHTML = '<code>' + esc(d.file) + '</code><span>' + esc(d.desc) + '</span>';
      delivBox.appendChild(li);
    });

    /* --- 作業ボタン -------------------------------------------------- */
    jobs.forEach(function (j) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'office-job';
      b.style.setProperty('--job-color', byId[j.agent] ? byId[j.agent].accent : '#555');
      b.innerHTML = '<span class="office-job-agent">' +
        esc(byId[j.agent] ? byId[j.agent].label : j.agent) + '</span>' +
        '<span class="office-job-label">' + esc(j.label) + '</span>';
      b.addEventListener('click', function () { run(j); });
      jobsBox.appendChild(b);
    });

    /* --- 状態の管理 -------------------------------------------------- */

    function seatGroup(id) {
      return stage.querySelector('.iso-agent[data-agent="' + id + '"]');
    }

    function setState(id, state) {
      var g = seatGroup(id);
      if (g) {
        g.classList.toggle('is-working', state === 'working' || state === 'talking');
        g.classList.toggle('is-away', state === 'away');
      }
      var seat = roster.querySelector('.office-seat[data-agent="' + id + '"] [data-state]');
      if (seat) {
        seat.textContent = STATE_LABEL[state] || state;
        seat.className = 'office-seat-state is-' + state;
      }
      refreshBadge();
    }

    /* バッジは実際に動いている席の数を出す。常時「稼働中」と出すと嘘になる。 */
    function refreshBadge() {
      var n = stage.querySelectorAll('.iso-agent.is-working').length +
        walkLayer.querySelectorAll('.iso-walker').length;
      badge.querySelector('[data-badge]').textContent = n ? n + '名が活動中' : '全員待機中';
      badge.classList.toggle('is-live', n > 0);
    }

    function say(id, text) {
      var b = bubbles.querySelector('.office-bubble[data-agent="' + id + '"]');
      if (!b) return;
      b.textContent = text;
      b.classList.toggle('is-on', !!text);
    }

    function sayAt(pt, text) {
      if (!text) { freeBubble.classList.remove('is-on'); return; }
      var pos = toPct(pt);
      freeBubble.style.left = pos.left;
      freeBubble.style.top = pos.top;
      freeBubble.textContent = text;
      freeBubble.classList.add('is-on');
    }

    function addLog(kind, who, what, color) {
      var li = document.createElement('li');
      li.className = 'is-' + kind;
      li.innerHTML =
        '<time>' + now() + '</time>' +
        '<span class="office-chip" style="background:' + esc(color || '#888') + '"></span>' +
        '<span class="office-log-who">' + esc(who) + '</span>' +
        '<span class="office-log-what">' + esc(what) + '</span>';
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 14) log.removeChild(log.lastChild);
    }

    /* --- 本物の作業（実データ照会） ---------------------------------- */

    var busy = false;

    function run(job) {
      if (busy) return;
      busy = true;

      var a = byId[job.agent];
      setState(job.agent, 'working');
      setState('mcp', 'working');
      say(job.agent, job.say);
      addLog('real', a.label, job.label + ' を開始（実データ照会）', a.accent);

      var out;
      try {
        out = job.work();
      } catch (e) {
        out = { headline: '取得できませんでした', rows: [String(e && e.message || e)], note: '' };
      }

      window.setTimeout(function () {
        setState(job.agent, 'idle');
        setState('mcp', 'idle');
        say(job.agent, '');
        addLog('real', a.label, job.label + ' を完了', a.accent);

        result.innerHTML =
          '<div class="office-result-head">' +
            '<span class="office-chip" style="background:' + esc(a.accent) + '"></span>' +
            '<strong>' + esc(a.label) + '</strong>' +
            '<span class="office-result-title">' + esc(out.headline) + '</span>' +
          '</div>' +
          '<ul class="office-result-rows">' +
            (out.rows || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') +
          '</ul>' +
          (out.note ? '<p class="office-result-note">' + esc(out.note) + '</p>' : '');
        busy = false;
      }, 700);
    }

    /* --- 役割定義 ----------------------------------------------------- */

    function showRole(id) {
      var a = byId[id];
      if (!a) return;
      result.innerHTML =
        '<div class="office-result-head">' +
          '<span class="office-chip" style="background:' + esc(a.accent) + '"></span>' +
          '<strong>' + esc(a.title) + '</strong>' +
          '<span class="office-result-title">' + esc(a.runtime) +
            (a.model ? '／' + esc(a.model) : '') + '</span>' +
        '</div>' +
        '<p class="office-role-desc">' + esc(a.description) + '</p>' +
        (a.sections && a.sections.length
          ? '<ul class="office-result-rows">' +
            a.sections.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
          : '') +
        '<p class="office-result-note">定義元：' + esc(a.sourceFile) +
        '　この1箇所を Claude Code と Codex の両方が読みます。</p>';
    }

    Array.prototype.forEach.call(stage.querySelectorAll('.iso-agent'), function (g) {
      g.addEventListener('click', function () { showRole(g.dataset.agent); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showRole(g.dataset.agent); }
      });
    });

    /* ================================================================ */
    /* アンビエント（働いている風景の再現）                                */
    /* ================================================================ */

    var ambientOn = !reduceMotion;
    var ambientTimer = null;
    var visitActive = false;

    toggleBtn.setAttribute('aria-pressed', ambientOn ? 'true' : 'false');
    toggleBtn.textContent = '働く風景の再現：' + (ambientOn ? 'ON' : 'OFF');
    toggleBtn.addEventListener('click', function () {
      ambientOn = !ambientOn;
      toggleBtn.setAttribute('aria-pressed', ambientOn ? 'true' : 'false');
      toggleBtn.textContent = '働く風景の再現：' + (ambientOn ? 'ON' : 'OFF');
      if (ambientOn) scheduleAmbient(1200);
      else if (ambientTimer) { clearTimeout(ambientTimer); ambientTimer = null; }
    });

    function gridCenter(id) {
      var a = byId[id];
      return { x: a.seat[0] + 1.0, y: a.seat[1] + 0.5 };
    }

    /** 席の前（手前側）の立ち位置 */
    function gridFront(id) {
      var a = byId[id];
      return { x: a.seat[0] + 1.0, y: a.seat[1] + 2.6 };
    }

    /**
     * 歩行者。立ち姿を transform で動かす。
     * 投影が線形なので、grid座標を補間して project するだけで直線移動になる。
     */
    function makeWalker(agent) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'iso-walker');
      g.innerHTML = Iso.standingPerson(agent, office.palette);
      walkLayer.appendChild(g);
      return {
        el: g,
        moveTo: function (grid) {
          var pt = Iso.project(grid.x - 0.5, grid.y - 0.5, 0);
          g.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
          this.grid = grid;
        },
        headPoint: function () {
          return Iso.project(this.grid.x, this.grid.y, 1.9);
        },
        walkingClass: function (on) { g.classList.toggle('is-walking', on); },
        remove: function () { g.remove(); refreshBadge(); }
      };
    }

    /** grid間を歩く。速度は一定。 */
    function walk(walker, from, to, done) {
      var dist = Math.hypot(to.x - from.x, to.y - from.y);
      var dur = Math.max(600, dist * 260);
      var t0 = performance.now();
      walker.walkingClass(true);
      function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        /* 緩やかに出て緩やかに止まる */
        var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        walker.moveTo({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
        if (k < 1 && ambientOn) requestAnimationFrame(step);
        else { walker.walkingClass(false); done(); }
      }
      requestAnimationFrame(step);
    }

    /** 会話シーンを1本再生する */
    function playScene(sc) {
      if (visitActive) return;
      var from = byId[sc.from];
      var to = byId[sc.to];
      if (!from || !to) return;
      visitActive = true;

      var start = gridCenter(sc.from);
      var goal = sc.place === 'meeting'
        ? { x: scene.meeting.grid[0] - 0.9, y: scene.meeting.grid[1] + 0.3 }
        : gridFront(sc.to);

      setState(sc.from, 'away');
      addLog('scene', from.label, to.label + 'のところへ相談に向かう（再現）', from.accent);

      var walker = makeWalker(from);
      walker.moveTo(start);
      refreshBadge();

      walk(walker, start, goal, function () {
        setState(sc.to, 'talking');
        var i = 0;
        function nextLine() {
          if (!ambientOn || i >= sc.lines.length) {
            sayAt(null, '');
            say(sc.to, '');
            setState(sc.to, 'idle');
            addLog('scene', 'ENGULF', '出典：' + sc.source, '#8a8f98');
            walk(walker, goal, start, function () {
              walker.remove();
              setState(sc.from, 'idle');
              visitActive = false;
            });
            return;
          }
          var line = sc.lines[i];
          var speaker = byId[line[0]];
          if (line[0] === sc.from) {
            say(sc.to, '');
            sayAt(walker.headPoint(), line[1]);
          } else {
            sayAt(null, '');
            say(sc.to, line[1]);
          }
          addLog('scene', speaker.label, line[1], speaker.accent);
          i++;
          window.setTimeout(nextLine, 2600);
        }
        nextLine();
      });
    }

    /** 席で作業する様子を1回見せる */
    function playWorkPulse() {
      var ids = Object.keys(AMB.WORK_LINES).filter(function (id) {
        var g = seatGroup(id);
        return g && !g.classList.contains('is-away') && !g.classList.contains('is-working');
      });
      if (!ids.length) return;
      var id = ids[Math.floor(Math.random() * ids.length)];
      var lines = AMB.WORK_LINES[id];
      var text = lines[Math.floor(Math.random() * lines.length)];
      var a = byId[id];
      setState(id, 'working');
      say(id, text);
      addLog('scene', a.label, text, a.accent);
      window.setTimeout(function () {
        say(id, '');
        setState(id, 'idle');
      }, 2400);
    }

    var sceneIndex = 0;

    function ambientTick() {
      if (!ambientOn) return;
      /* 会話シーンは順番に、作業パルスはランダムに。 */
      if (!visitActive && Math.random() < 0.45) {
        playScene(AMB.SCENES[sceneIndex % AMB.SCENES.length]);
        sceneIndex++;
      } else {
        playWorkPulse();
      }
      scheduleAmbient(4200 + Math.random() * 3800);
    }

    function scheduleAmbient(delay) {
      if (ambientTimer) clearTimeout(ambientTimer);
      ambientTimer = window.setTimeout(ambientTick, delay);
    }

    /* ================================================================ */
    /* 制作プラン（現状確認 → 残り工程）                                   */
    /*                                                                    */
    /* MANUAL_DATA.processes（13工程）から残りを組み立てる実データ照会。   */
    /* 効率の型は共通マニュアルの一括処理手順から。出典を各行に付ける。    */
    /* ================================================================ */

    var planSelect = host.querySelector('#plan-done');
    var planBtn = host.querySelector('#plan-run');

    (D.processes || []).forEach(function (pr) {
      var opt = document.createElement('option');
      opt.value = String(pr.no);
      opt.textContent = '工程' + pr.no + '：' + pr.title + ' まで完了';
      planSelect.appendChild(opt);
    });
    /* 既定は工程7（テロップまで完了）。冒頭3分の完成がだいたいここに当たる。 */
    planSelect.value = '9';

    /* 一括処理の型。すべて共通マニュアルの正式記載から。 */
    var BATCH_TIPS = [
      { text: 'テロップ位置は1つ調整→モーションをコピー→全選択ペーストで一括', src: 'テロップ位置調整（XML文字起こし後）' },
      { text: '画角変更はラベル色で分類→ラベルグループ選択→モーションを一括適用', src: '定点動画の画角変更' },
      { text: '同じ演出はサブシーケンスにまとめて一括挿入', src: '用語集（サブシーケンス）' },
      { text: 'BGMは最後に入れる。カット・テロップ・演出の確定前に入れると手戻りになる', src: '工程9・工程15' },
      { text: '冒頭3分の完成見本が全体の基準。残り尺は冒頭の設定・色・頻度をそのまま流用する', src: '数値基準（冒頭の完成見本 3分）' }
    ];

    function runPlan() {
      if (busy) return;
      busy = true;
      var doneNo = parseInt(planSelect.value, 10);
      var procs = D.processes || [];
      var remaining = procs.filter(function (pr) { return pr.no > doneNo; });
      var current = procs.filter(function (pr) { return pr.no === doneNo; })[0];
      var next = remaining[0];

      ['cto', 'director', 'mcp'].forEach(function (id) { setState(id, 'working'); });
      say('director', '現状を確認して残り工程を組み立てます');
      addLog('real', 'ディレクター', '制作プラン作成（工程' + doneNo + 'まで完了として）', byId.director.accent);

      window.setTimeout(function () {
        ['cto', 'director', 'mcp'].forEach(function (id) { setState(id, 'idle'); });
        say('director', '');
        addLog('real', 'ディレクター', '残り' + remaining.length + '工程のプランを提示', byId.director.accent);

        var h = [];
        h.push('<div class="office-result-head">' +
          '<span class="office-chip" style="background:' + esc(byId.director.accent) + '"></span>' +
          '<strong>制作プラン</strong>' +
          '<span class="office-result-title">工程' + doneNo + '（' + esc(current ? current.title : '') +
          '）まで完了 → 残り' + remaining.length + '工程</span></div>');

        if (next) {
          h.push('<p class="office-plan-next">次の一手：<strong>工程' + next.no + ' ' +
            esc(next.title) + '</strong> — ' + esc(next.summary) + '</p>');
        } else {
          h.push('<p class="office-plan-next">全13工程が完了しています。保存期間（プロマネ・素材1年間）の管理へ。</p>');
        }

        if (remaining.length) {
          h.push('<ol class="office-plan-list">');
          remaining.forEach(function (pr) {
            h.push('<li' + (pr.ruleType === 'conflict' ? ' class="is-conflict"' : '') + '>' +
              '<span class="office-plan-no">工程' + pr.no + '</span>' +
              '<strong>' + esc(pr.title) + '</strong>' +
              '<span>' + esc(pr.summary) + '</span>' +
              (pr.ruleType === 'conflict' ? '<em>⚠ 未決定の矛盾あり。勝手に統一しない</em>' : '') +
              '</li>');
          });
          h.push('</ol>');
        }

        h.push('<p class="office-plan-h">効率の型（共通マニュアルの一括処理）</p>');
        h.push('<ul class="office-result-rows">');
        BATCH_TIPS.forEach(function (t) {
          h.push('<li>' + esc(t.text) + '<span class="office-plan-src">出典：' + esc(t.src) + '</span></li>');
        });
        h.push('</ul>');

        var conflicts = (D.audit && D.audit.conflicts ? D.audit.conflicts : []).length;
        h.push('<p class="office-result-note">確認してから進むもの：未決定の矛盾 ' + conflicts +
          '件（演出頻度・提出方法など。確定はディレクター権限）／進捗報告は毎日21時まで' +
          '（プロマネURL付き）／案件独自の提出物は project-manual（get_project_rules）で照合。</p>');

        result.innerHTML = h.join('');
        busy = false;
      }, 800);
    }

    planBtn.addEventListener('click', runPlan);

    /* --- 起動 -------------------------------------------------------- */
    addLog('real', 'MCPサーバー', '接続を待機しています', byId.mcp ? byId.mcp.accent : '#888');
    showRole('cto');
    if (ambientOn) scheduleAmbient(1600);
  }

  function root_get(name, file) {
    var g = (typeof globalThis !== 'undefined' ? globalThis : window);
    if (!g[name]) throw new Error(file + ' が読み込まれていません');
    return g[name];
  }

  return { build: build, buildJobs: buildJobs };
});
