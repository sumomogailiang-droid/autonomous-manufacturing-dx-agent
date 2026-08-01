/*
 * office-panel.js
 *
 * オフィス画面の組み立て。等角の絵（office.js）に、
 * 稼働状況・吹き出し・作業ログ・役割定義を重ねる。
 *
 * === 「誰が今動いているか」をどう出すか ===
 *
 * ブラウザは stdio の MCP サーバーへ直接つながらない。
 * つまりターミナルで動いているエージェントの様子は、そのままでは見えない。
 *
 * そこで、このページ自身が実際に行える作業だけを並べ、
 * それを実行している間だけ担当エージェントの席を動かす。
 * 見せかけのアニメーションではなく、本当にその場で根拠を引いている。
 *
 *   表記チェック  → common-manual が辞書122件と照合する
 *   数値照会      → common-manual が数値基準を引く
 *   演出頻度の確認 → project-manual が矛盾を確認する
 *   図解ルール    → design が制作ルールを引く
 *   テロップ規定  → telop がテロップの基準を引く
 *   品質判定      → director が品質評価レベルを引く
 *   全体監査      → cto が監査結果を集計する
 *
 * どの作業でも MCP サーバー（ラック）が光る。全員の接続口だから。
 *
 * ターミナル側の稼働まで映したい場合はローカルサーバーが要る。
 * このファイルはそこまではやらない（できないことをできるように見せない）。
 */

(function (root, factory) {
  var api = factory();
  root.OfficePanel = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATE_LABEL = { idle: '待機中', working: '作業中', done: '完了' };

  /* ---------------------------------------------------------------- */
  /* 作業の定義                                                         */
  /*                                                                    */
  /* work は MANUAL_DATA から本当に値を引いて結果を返す関数。            */
  /* 記憶で文章を作らない。データに無いことは「記載なし」と返す。        */
  /* ---------------------------------------------------------------- */

  function buildJobs(D) {
    function countStandards() {
      return D.numericStandards.reduce(function (n, g) { return n + g.items.length; }, 0);
    }

    return [
      {
        id: 'notation',
        agent: 'common-manual',
        label: '表記チェック',
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
        id: 'numbers',
        agent: 'common-manual',
        label: '数値基準を引く',
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
        id: 'conflicts',
        agent: 'project-manual',
        label: '未決定の確認',
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
        id: 'design',
        agent: 'design',
        label: '図解ルールを引く',
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
        id: 'telop',
        agent: 'telop',
        label: 'テロップ規定を引く',
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
        id: 'quality',
        agent: 'director',
        label: '品質評価レベル',
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
        id: 'audit',
        agent: 'cto',
        label: '全体監査',
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

  /* ---------------------------------------------------------------- */
  /* 組み立て                                                           */
  /* ---------------------------------------------------------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * @param {HTMLElement} host  描画先
   * @param {object} office     office-data.js
   * @param {object} D          manual-data.js
   */
  function build(host, office, D) {
    var scene = root_IsoOffice().render(office);
    var jobs = buildJobs(D);
    var byId = {};
    office.agents.forEach(function (a) { byId[a.id] = a; });

    host.innerHTML =
      '<div class="office">' +
        '<div class="office-main">' +
          '<div class="office-stage" id="office-stage">' +
            scene.svg +
            '<div class="office-bubbles" id="office-bubbles"></div>' +
            '<div class="office-badge" id="office-badge">' +
            '<span class="office-dot"></span><span data-badge>全員待機中</span></div>' +
          '</div>' +
          '<div class="office-jobs" id="office-jobs" role="group" aria-label="実行できる作業"></div>' +
          '<div class="office-result" id="office-result" aria-live="polite"></div>' +
        '</div>' +
        '<aside class="office-side">' +
          '<h3 class="office-h">在席</h3>' +
          '<ul class="office-roster" id="office-roster"></ul>' +
          '<h3 class="office-h">作業ログ</h3>' +
          '<ol class="office-log" id="office-log" aria-live="polite"></ol>' +
        '</aside>' +
      '</div>';

    var stage = host.querySelector('#office-stage');
    var bubbles = host.querySelector('#office-bubbles');
    var roster = host.querySelector('#office-roster');
    var log = host.querySelector('#office-log');
    var result = host.querySelector('#office-result');
    var jobsBox = host.querySelector('#office-jobs');
    var badge = host.querySelector('#office-badge');

    /* --- 吹き出しの土台を席の数だけ用意する --------------------- */
    var vb = scene.viewBox;
    office.agents.forEach(function (a) {
      var p = scene.anchors[a.id];
      var b = document.createElement('div');
      b.className = 'office-bubble';
      b.dataset.agent = a.id;
      /* viewBox座標を％へ直す。SVGが伸縮しても位置がずれない。 */
      b.style.left = (((p.x - vb.x) / vb.w) * 100).toFixed(2) + '%';
      b.style.top = (((p.y - vb.y) / vb.h) * 100).toFixed(2) + '%';
      bubbles.appendChild(b);
    });

    /* --- 在席一覧 ------------------------------------------------- */
    /* AGENTS.md の体制順に並べる。CTOは制作チームの外なので先頭、設備は末尾。 */
    var ORDER = ['cto', 'director', 'common-manual', 'project-manual', 'design', 'telop', 'mcp'];
    var rosterOrder = office.agents.slice().sort(function (x, z) {
      return ORDER.indexOf(x.id) - ORDER.indexOf(z.id);
    });

    rosterOrder.forEach(function (a) {
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
      roster.appendChild(li);
    });

    /* --- 実行できる作業 ------------------------------------------- */
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

    /* --- 稼働の切り替え ------------------------------------------- */
    function setState(id, state) {
      var g = stage.querySelector('[data-agent="' + id + '"]');
      if (g) g.classList.toggle('is-working', state === 'working');
      var seat = roster.querySelector('.office-seat[data-agent="' + id + '"] [data-state]');
      if (seat) {
        seat.textContent = STATE_LABEL[state] || state;
        seat.className = 'office-seat-state is-' + state;
      }
      refreshBadge();
    }

    /* バッジは実際に動いている席の数を出す。常時「稼働中」と出すと嘘になる。 */
    function refreshBadge() {
      if (!badge) return;
      var n = stage.querySelectorAll('.iso-agent.is-working').length;
      badge.querySelector('[data-badge]').textContent = n ? n + '名が作業中' : '全員待機中';
      badge.classList.toggle('is-live', n > 0);
    }

    function say(id, text) {
      var b = bubbles.querySelector('.office-bubble[data-agent="' + id + '"]');
      if (!b) return;
      b.textContent = text;
      b.classList.toggle('is-on', !!text);
    }

    function addLog(agentLabel, text, color) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="office-chip" style="background:' + esc(color) + '"></span>' +
        '<span class="office-log-who">' + esc(agentLabel) + '</span>' +
        '<span class="office-log-what">' + esc(text) + '</span>';
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 12) log.removeChild(log.lastChild);
    }

    var busy = false;

    function run(job) {
      if (busy) return;
      busy = true;

      var a = byId[job.agent];
      var mcp = byId.mcp;

      setState(job.agent, 'working');
      setState('mcp', 'working');
      say(job.agent, job.say);
      addLog(a.label, job.label + ' を開始', a.accent);

      /* 実際にデータを引く。失敗しても席が動いたままにならないようにする。 */
      var out;
      try {
        out = job.work();
      } catch (e) {
        out = { headline: '取得できませんでした', rows: [String(e && e.message || e)], note: '' };
      }

      /* 席が動いているのを見せるための最小の間。処理そのものは即座に終わっている。 */
      window.setTimeout(function () {
        setState(job.agent, 'idle');
        setState('mcp', 'idle');
        say(job.agent, '');
        addLog(a.label, job.label + ' を完了', a.accent);
        if (mcp) addLog(mcp.label, '根拠を返しました', mcp.accent);

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

    /* --- 役割定義 -------------------------------------------------- */
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

    /* 席をクリックしても役割が出る */
    Array.prototype.forEach.call(stage.querySelectorAll('.iso-agent'), function (g) {
      g.addEventListener('click', function () { showRole(g.dataset.agent); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showRole(g.dataset.agent); }
      });
    });

    addLog('MCPサーバー', '接続を待機しています', byId.mcp ? byId.mcp.accent : '#888');
    showRole('cto');
  }

  /* office.js はグローバルへ載る。読み込み順が崩れたときに気づけるようにする。 */
  function root_IsoOffice() {
    var g = (typeof globalThis !== 'undefined' ? globalThis : window);
    if (!g.IsoOffice) throw new Error('office.js が読み込まれていません');
    return g.IsoOffice;
  }

  return { build: build, buildJobs: buildJobs };
});
