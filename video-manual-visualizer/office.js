/*
 * office.js
 *
 * ENGULF（エンガルフ）のオフィスを等角投影（アイソメトリック）で描く。
 *
 * === なぜ手描きのドット絵ではないのか ===
 *
 * agents/sprites.mjs のドット絵は正面向きの16x16で、ターミナル用に作られている。
 * 斜め見下ろしにするには全員を角度つきで描き直す必要があり、
 * しかも机・椅子・床との接地や陰影を1ピクセルずつ合わせることになる。
 *
 * そこで、箱（直方体）を計算で組み上げる方式にした。
 *   - 陰影が全席で自動的に揃う（上面・左面・右面の明度が常に同じ比率）
 *   - 席を足すとき座標を1行足すだけで済む
 *   - 拡大しても線がぼけない
 *
 * === 色の出どころ ===
 *
 * 人の色（役割色）は office-data.js 経由で agents/sprites.mjs の PALETTE から来る。
 * ターミナルのドット絵とブラウザのオフィスで、同じ役割が同じ色になる。
 * 家具・床・植木など役割と関係のない色は、このファイルの SCENE で持つ。
 *
 * === 等角投影の座標 ===
 *
 *   画面X = (x - y) * TW/2      x が増えると右下、y が増えると左下
 *   画面Y = (x + y) * TH/2 - z * TZ
 *
 * 手前ほど (x + y) が大きい。描画順は (x + y) の昇順にして、
 * 手前のものを後から描く（画家のアルゴリズム）。
 *
 * 投影は線形なので、grid(x,y) への移動は画面座標の平行移動と等しい。
 * 歩行アニメーションはこれを使い、原点で作った立ち姿を translate で動かす。
 *
 * === 壁の文字 ===
 *
 * 奥の壁の面は「グリッドx → 右下へ傾き0.5、高さz → 垂直」なので、
 * matrix(1, 0.5, 0, 1) で文字を壁に貼り付けられる。社名サインに使う。
 *
 * このファイルはブラウザ・Node のどちらでも読める（依存なし）。
 */

(function (root, factory) {
  var api = factory();
  root.IsoOffice = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* タイル1枚の大きさ。2:1 の等角。 */
  var TW = 58;
  var TH = 29;
  var TZ = 23;

  /* 面ごとの明るさ。光源は左上からの想定。 */
  var SHADE_TOP = 1.0;
  var SHADE_LEFT = 0.78;
  var SHADE_RIGHT = 0.58;

  /* 役割と関係のない色。木・床・植木など。 */
  var SCENE = {
    floorA: '#e8ded0',
    floorB: '#e0d4c3',
    floorAudit: '#d9ccb8',
    wood: '#c1905c',
    woodDark: '#9a6f42',
    metal: '#8d8377',
    metalDark: '#6b6359',
    chair: '#7b7168',
    chairDark: '#5d554e',
    screen: '#2f3743',
    plantPot: '#b5714b',
    plant: '#5f8f5a',
    plantDark: '#4a7247',
    lamp: '#3c3833',
    lampGlow: '#f5d99a',
    board: '#2c2f36',
    boardLine: '#6f7684',
    wall: '#f6f0e6',
    wallDark: '#e8dfd0',
    sign: '#1f232b',
    signText: '#f2ede2',
    zoneClaude: '#1d4ed8',
    zoneCodex: '#5b3fb5',
    zoneSales: '#0f766e',
    floorSales: '#e4e6df',
    floorSalesB: '#dbdfd4',
    shadow: 'rgba(30, 24, 12, 0.13)'
  };

  /* ---------------------------------------------------------------- */
  /* 色                                                                 */
  /* ---------------------------------------------------------------- */

  function hexToRgb(hex) {
    var h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  /** 明度を掛ける。1.0で元の色、0.5で半分の明るさ。 */
  function shade(hex, factor) {
    var c = hexToRgb(hex);
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(v * factor))); };
    return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')';
  }

  /* ---------------------------------------------------------------- */
  /* 投影                                                               */
  /* ---------------------------------------------------------------- */

  function project(x, y, z) {
    return {
      x: (x - y) * (TW / 2),
      y: (x + y) * (TH / 2) - (z || 0) * TZ
    };
  }

  function pts(list) {
    return list.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  }

  function poly(points, fill, extra) {
    return '<polygon points="' + pts(points) + '" fill="' + fill + '"' +
      (extra ? ' ' + extra : '') + '/>';
  }

  /* ---------------------------------------------------------------- */
  /* 基本部品                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * 直方体。手前から見える3面（上・左・右）だけを描く。
   * 裏側は見えないので描かない（要素数を減らすため）。
   */
  function box(x, y, z, w, d, h, color, extra) {
    var top = [
      project(x, y, z + h), project(x + w, y, z + h),
      project(x + w, y + d, z + h), project(x, y + d, z + h)
    ];
    var left = [
      project(x, y + d, z + h), project(x + w, y + d, z + h),
      project(x + w, y + d, z), project(x, y + d, z)
    ];
    var right = [
      project(x + w, y, z + h), project(x + w, y + d, z + h),
      project(x + w, y + d, z), project(x + w, y, z)
    ];
    return poly(left, shade(color, SHADE_LEFT), extra) +
      poly(right, shade(color, SHADE_RIGHT), extra) +
      poly(top, shade(color, SHADE_TOP), extra);
  }

  /** 床タイル1枚（高さのない菱形） */
  function tile(x, y, w, d, color, extra) {
    return poly(
      [project(x, y, 0), project(x + w, y, 0), project(x + w, y + d, 0), project(x, y + d, 0)],
      color, extra
    );
  }

  /** 接地影。楕円1つで机や人の浮きを消す。 */
  function shadowAt(cx, cy, r) {
    var c = project(cx, cy, 0);
    return '<ellipse cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) +
      '" rx="' + (r * TW * 0.5).toFixed(1) + '" ry="' + (r * TH * 0.5).toFixed(1) +
      '" fill="' + SCENE.shadow + '"/>';
  }

  /* ---------------------------------------------------------------- */
  /* 人                                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * 椅子に座った人。奥から手前へ 椅子 → 体 → 頭 の順。
   * 胴を細くして頭を大きめに取ると、板ではなく人に見える。
   */
  function person(bx, by, a, p) {
    var g = [];

    /* 椅子。背もたれが人の後ろに立つ。 */
    g.push(box(bx + 0.44, by - 0.06, 0, 1.10, 0.13, 1.16, SCENE.chairDark));
    g.push(box(bx + 0.44, by - 0.06, 0.44, 1.10, 0.78, 0.10, SCENE.chair));

    /* 後頭部の髪は顔より先に描く。あとから描くと顔を覆ってしまう。 */
    if (a.hair) g.push(box(bx + 0.68, by + 0.24, 1.10, 0.60, 0.10, 0.42, a.hair));

    /* 胴。役割色。 */
    g.push('<g class="iso-person">');
    g.push(box(bx + 0.62, by + 0.30, 0.52, 0.74, 0.50, 0.60, a.accent));
    g.push('</g>');

    /* 腕。胴の左右に接して置く。作業中はここが上下する。 */
    g.push('<g class="iso-arm">');
    g.push(box(bx + 0.52, by + 0.42, 0.68, 0.13, 0.62, 0.13, a.accentLight));
    g.push(box(bx + 1.30, by + 0.42, 0.68, 0.13, 0.62, 0.13, a.accentLight));
    g.push('</g>');

    /* 首と頭。 */
    g.push('<g class="iso-person">');
    g.push(box(bx + 0.86, by + 0.46, 1.06, 0.28, 0.20, 0.08, p.skin));
    g.push(box(bx + 0.74, by + 0.36, 1.12, 0.52, 0.38, 0.42, p.skin));
    /* 前髪。厚くすると兜のようになるので薄く乗せる。 */
    if (a.hair) g.push(box(bx + 0.72, by + 0.34, 1.50, 0.56, 0.42, 0.08, a.hair));
    g.push('</g>');

    return g.join('');
  }

  /** 机とノートPC。人より手前に置くので、胴が隠れて顔と肩だけが見える。 */
  function deskUnit(bx, by, a) {
    var g = [];

    g.push(shadowAt(bx + 1.25, by + 1.55, 1.05));

    /* 天板 */
    g.push(box(bx + 0.24, by + 0.94, 0.62, 1.80, 0.86, 0.08, SCENE.wood));
    /* 脚 */
    g.push(box(bx + 0.32, by + 1.00, 0, 0.10, 0.10, 0.62, SCENE.woodDark));
    g.push(box(bx + 1.92, by + 1.00, 0, 0.10, 0.10, 0.62, SCENE.woodDark));
    g.push(box(bx + 0.32, by + 1.70, 0, 0.10, 0.10, 0.62, SCENE.woodDark));

    /* ノートPC。奥側に画面が立ち、手前にキーボードが寝る。
       画面は縁を残して内側だけ光らせる。全面を役割色にすると板に見える。 */
    g.push(box(bx + 0.72, by + 1.06, 0.68, 0.62, 0.05, 0.40, SCENE.screen));
    g.push('<g class="iso-screen">');
    g.push(box(bx + 0.76, by + 1.10, 0.72, 0.54, 0.02, 0.31, a.accentLight));
    g.push('</g>');
    g.push(box(bx + 0.72, by + 1.11, 0.68, 0.62, 0.40, 0.02, SCENE.metal));

    /* 役割ごとの持ち物。書類の束。 */
    g.push('<g class="iso-tool">');
    g.push(box(bx + 1.44, by + 1.16, 0.70, 0.36, 0.28, 0.06, a.accent));
    g.push(box(bx + 1.47, by + 1.19, 0.76, 0.30, 0.22, 0.03, '#f6f2ea'));
    g.push('</g>');

    /* マグカップ */
    g.push(box(bx + 0.42, by + 1.26, 0.70, 0.15, 0.15, 0.17, '#e7e2d8'));

    return g.join('');
  }

  /**
   * 立ち姿。歩行アニメーション用。
   * グリッド原点(0,0)に立った状態で作り、呼び出し側が transform で動かす。
   */
  /*
   * オーロラのグラデーション定義。
   * Claude Code チーム = 黄金、Codex チーム = 海（青緑から深い青へ）。
   * 中心を濃くせず輪郭側を光らせ、体を縁取る「枠」に見せる。
   */
  function auraDefs() {
    return '<defs>' +
      '<radialGradient id="aura-gold">' +
        '<stop offset="0.45" stop-color="#ffd76a" stop-opacity="0"/>' +
        '<stop offset="0.78" stop-color="#ffcf4d" stop-opacity="0.5"/>' +
        '<stop offset="0.92" stop-color="#f5b31f" stop-opacity="0.75"/>' +
        '<stop offset="1" stop-color="#e8a200" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<radialGradient id="aura-ocean">' +
        '<stop offset="0.45" stop-color="#5eead4" stop-opacity="0"/>' +
        '<stop offset="0.74" stop-color="#38cfd9" stop-opacity="0.5"/>' +
        '<stop offset="0.9" stop-color="#2e9fe6" stop-opacity="0.75"/>' +
        '<stop offset="1" stop-color="#1d4ed8" stop-opacity="0"/>' +
      '</radialGradient>' +
    '</defs>';
  }

  function standingPerson(a, p) {
    var g = [];
    var auraKind = a.runtime === 'Claude Code' ? 'gold' : (a.runtime === 'Codex' ? 'ocean' : '');
    if (auraKind) {
      var ac = project(0.5, 0.5, 0.85);
      g.push('<ellipse class="iso-aura" cx="' + ac.x.toFixed(1) + '" cy="' + ac.y.toFixed(1) +
        '" rx="30" ry="42" fill="url(#aura-' + auraKind + ')"/>');
    }
    g.push(shadowAt(0.5, 0.55, 0.44));
    /* 脚2本。歩行中はCSSで交互に振る。 */
    g.push('<g class="iso-leg iso-leg-l">' + box(0.32, 0.4, 0, 0.17, 0.22, 0.44, SCENE.chairDark) + '</g>');
    g.push('<g class="iso-leg iso-leg-r">' + box(0.56, 0.4, 0, 0.17, 0.22, 0.44, SCENE.chairDark) + '</g>');
    /* 胴 */
    g.push(box(0.24, 0.32, 0.42, 0.58, 0.4, 0.58, a.accent));
    /* 腕 */
    g.push(box(0.15, 0.38, 0.55, 0.1, 0.3, 0.38, a.accentLight));
    g.push(box(0.83, 0.38, 0.55, 0.1, 0.3, 0.38, a.accentLight));
    /* 頭 */
    if (a.hair) g.push(box(0.26, 0.28, 1.0, 0.52, 0.09, 0.36, a.hair));
    g.push(box(0.28, 0.32, 1.0, 0.46, 0.34, 0.38, p.skin));
    if (a.hair) g.push(box(0.26, 0.3, 1.36, 0.5, 0.38, 0.08, a.hair));
    return g.join('');
  }

  /* ---------------------------------------------------------------- */
  /* 設備・装飾                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * 空席。まだ人がいない窓口。
   * 起動していない席を人つきで描くと動いているように見えるので、机だけを置く。
   */
  function vacantDesk(bx, by) {
    var a = { accent: SCENE.metal, accentLight: SCENE.metal };
    return '<g class="iso-vacant" aria-hidden="true">' +
      box(bx + 0.44, by - 0.06, 0, 1.10, 0.13, 1.16, SCENE.chairDark) +
      box(bx + 0.44, by - 0.06, 0.44, 1.10, 0.78, 0.10, SCENE.chair) +
      deskUnit(bx, by, a) + '</g>';
  }

  /** MCPサーバーはラック。人ではないので椅子も机も置かない。 */
  function rack(bx, by, a) {
    var g = [];
    g.push(shadowAt(bx + 1.25, by + 1.1, 0.95));
    g.push(box(bx + 0.62, by + 0.55, 0, 1.20, 0.95, 2.25, SCENE.metalDark));
    g.push('<g class="iso-tool">');
    for (var i = 0; i < 5; i++) {
      g.push(box(bx + 0.66, by + 1.48, 0.24 + i * 0.40, 1.12, 0.02, 0.24, a.accentLight));
    }
    g.push('</g>');
    return g.join('');
  }

  /** 観葉植物。角の余白を埋めて、部屋らしく見せる。 */
  function plant(x, y) {
    return shadowAt(x + 0.22, y + 0.24, 0.34) +
      box(x, y, 0, 0.42, 0.42, 0.34, SCENE.plantPot) +
      box(x + 0.06, y + 0.06, 0.34, 0.30, 0.30, 0.44, SCENE.plant) +
      box(x + 0.01, y + 0.10, 0.56, 0.40, 0.22, 0.30, SCENE.plantDark) +
      box(x + 0.12, y - 0.02, 0.62, 0.22, 0.36, 0.34, SCENE.plant);
  }

  /** 天井のペンダントライト。吊り下げの線と傘。 */
  function lamp(x, y) {
    var top = project(x + 0.2, y + 0.2, 3.4);
    var bot = project(x + 0.2, y + 0.2, 2.6);
    return '<line x1="' + top.x.toFixed(1) + '" y1="' + top.y.toFixed(1) +
      '" x2="' + bot.x.toFixed(1) + '" y2="' + bot.y.toFixed(1) + '" class="iso-cord"/>' +
      box(x, y, 2.25, 0.44, 0.44, 0.32, SCENE.lamp) +
      tile(x + 0.03, y + 0.03, 0.38, 0.38, SCENE.lampGlow, 'opacity="0.9" transform="translate(0,' +
        (-2.25 * TZ).toFixed(1) + ')"');
  }

  /**
   * 奥の壁の進行ボード。
   * 数字はすべて実データ（席数・工程数）から来る。飾りの数字を書かない。
   */
  function board(x, data) {
    var g = [];
    g.push(box(x, -0.18, 1.05, 3.5, 0.12, 1.35, SCENE.board));
    var o = project(x + 0.25, 0, 2.1);
    g.push('<g transform="matrix(1,0.5,0,1,' + o.x.toFixed(1) + ',' + o.y.toFixed(1) + ')">');
    g.push('<text class="iso-board-title" x="0" y="0">' + esc(data.company.project) + '</text>');
    g.push('<text class="iso-board-line" x="0" y="12">高品質編集の完全自動化</text>');
    g.push('<text class="iso-board-line" x="0" y="22">在籍' + data.agents.length +
      '席・工程13</text>');
    g.push('</g>');
    return g.join('');
  }

  /** 社名サイン。奥の壁に貼る。 */
  function signage(data) {
    var o = project(0.7, 0, 2.35);
    var g = [];
    g.push('<g transform="matrix(1,0.5,0,1,' + o.x.toFixed(1) + ',' + o.y.toFixed(1) + ')">');
    g.push('<text class="iso-sign-main" x="0" y="0">' + esc(data.company.name) + '</text>');
    g.push('<text class="iso-sign-sub" x="1.5" y="15">AUTONOMOUS VIDEO STUDIO</text>');
    g.push('</g>');
    return g.join('');
  }

  /** 壁掛け時計。針は動かさない（時刻の嘘を表示しないため）。 */
  function clock(x, z) {
    var o = project(x, 0, z);
    return '<g transform="matrix(1,0.5,0,1,' + o.x.toFixed(1) + ',' + o.y.toFixed(1) + ')">' +
      '<circle cx="0" cy="0" r="7.5" fill="' + SCENE.signText + '" stroke="' + SCENE.lamp + '" stroke-width="1.6"/>' +
      '<line x1="0" y1="0" x2="0" y2="-4.6" stroke="' + SCENE.lamp + '" stroke-width="1.3"/>' +
      '<line x1="0" y1="0" x2="3.2" y2="1.4" stroke="' + SCENE.lamp + '" stroke-width="1.1"/>' +
      '</g>';
  }

  /**
   * ミーティングテーブル。チーム間の相談はここで起きる。
   * 等角では床の円は横2:縦1の楕円になる。
   */
  function meetingTable(cx, cy) {
    var g = [];
    var r = 0.92;
    var top = project(cx, cy, 0.6);
    var side = project(cx, cy, 0.48);
    g.push(shadowAt(cx, cy, r * 1.1));
    g.push(box(cx - 0.08, cy - 0.08, 0, 0.16, 0.16, 0.5, SCENE.woodDark));
    g.push('<ellipse cx="' + side.x.toFixed(1) + '" cy="' + side.y.toFixed(1) +
      '" rx="' + (r * TW * 0.5).toFixed(1) + '" ry="' + (r * TH * 0.5).toFixed(1) +
      '" fill="' + shade(SCENE.wood, 0.72) + '"/>');
    g.push('<ellipse cx="' + top.x.toFixed(1) + '" cy="' + top.y.toFixed(1) +
      '" rx="' + (r * TW * 0.5).toFixed(1) + '" ry="' + (r * TH * 0.5).toFixed(1) +
      '" fill="' + shade(SCENE.wood, 1.02) + '"/>');
    var stools = [[cx - 1.3, cy + 0.35], [cx + 0.6, cy - 1.05], [cx + 0.55, cy + 0.85]];
    for (var i = 0; i < stools.length; i++) {
      g.push(shadowAt(stools[i][0] + 0.22, stools[i][1] + 0.22, 0.3));
      g.push(box(stools[i][0], stools[i][1], 0, 0.44, 0.44, 0.42, SCENE.chair));
    }
    return g.join('');
  }

  /* ---------------------------------------------------------------- */
  /* 全体                                                               */
  /* ---------------------------------------------------------------- */

  /**
   * オフィス全体を描く。
   *
   * @param {object} data office-data.js の中身
   * @returns {{svg, anchors, viewBox, meeting, zoneLabels}}
   *   anchors    各エージェントの頭上の位置（viewBox座標）。吹き出しの基準。
   *   meeting    ミーティングテーブルの位置（grid と viewBox座標）
   *   zoneLabels 部門ラベルを置く位置（viewBox座標）
   */
  function render(data) {
    var p = data.palette;
    var W = data.floor.w;
    var D = data.floor.d;
    var parts = [];
    var x, y, i;

    /* --- 奥の壁・サイン・ボード・時計 ------------------------------ */
    parts.push(box(0, -0.30, 0, W, 0.30, 2.9, SCENE.wall));
    parts.push(box(-0.30, 0, 0, 0.30, D, 2.9, SCENE.wallDark));
    parts.push(signage(data));
    parts.push(clock(6.1, 2.2));
    parts.push(board(7.3, data));

    /* --- 床 -------------------------------------------------------- */
    parts.push('<g class="iso-floor">');
    for (y = 0; y < D; y++) {
      for (x = 0; x < W; x++) {
        var audit = y < 2.7;
        var base = audit ? SCENE.floorAudit : ((x + y) % 2 === 0 ? SCENE.floorA : SCENE.floorB);
        parts.push(tile(x, y, Math.min(1, W - x), Math.min(1, D - y), base));
      }
    }
    parts.push('</g>');

    /* --- 部門ゾーン。制作部門を2チームに分ける ---------------------- */
    parts.push(tile(0.15, 3.0, 6.1, D - 3.2, SCENE.zoneClaude, 'opacity="0.06"'));
    parts.push(tile(6.75, 3.0, W - 6.95, D - 3.2, SCENE.zoneCodex, 'opacity="0.06"'));

    /* 監査室との境界と、チーム間の通路 */
    var a1 = project(0, 2.85, 0), a2 = project(W, 2.85, 0);
    parts.push('<line x1="' + a1.x.toFixed(1) + '" y1="' + a1.y.toFixed(1) +
      '" x2="' + a2.x.toFixed(1) + '" y2="' + a2.y.toFixed(1) + '" class="iso-divider"/>');
    var b1 = project(6.55, 3.0, 0), b2 = project(6.55, D, 0);
    parts.push('<line x1="' + b1.x.toFixed(1) + '" y1="' + b1.y.toFixed(1) +
      '" x2="' + b2.x.toFixed(1) + '" y2="' + b2.y.toFixed(1) + '" class="iso-divider"/>');

    /* --- 営業部フロアの構造（壁・床・サイン） ------------------------
       席より先に描く。あとから描くと営業部の席を壁が上塗りしてしまう。 */
    var sf = data.salesFloor;
    if (sf) {
      /* 制作フロアと営業フロアを仕切る壁 */
      parts.push(box(W + 0.15, 0, 0, 0.42, D, 2.9, SCENE.wallDark));
      /* 営業フロアの奥壁 */
      parts.push(box(sf.x, -0.30, 0, sf.w, 0.30, 2.9, SCENE.wall));

      parts.push('<g class="iso-floor">');
      for (y = 0; y < sf.d; y++) {
        for (x = 0; x < sf.w; x++) {
          parts.push(tile(sf.x + x, y, Math.min(1, sf.w - x), Math.min(1, sf.d - y),
            (x + y) % 2 === 0 ? SCENE.floorSales : SCENE.floorSalesB));
        }
      }
      parts.push('</g>');
      parts.push(tile(sf.x + 0.15, 0.4, sf.w - 0.4, sf.d - 0.8, SCENE.zoneSales, 'opacity="0.07"'));

      var so = project(sf.x + 0.5, 0, 2.3);
      parts.push('<g transform="matrix(1,0.5,0,1,' + so.x.toFixed(1) + ',' + so.y.toFixed(1) + ')">' +
        '<text class="iso-sign-floor" x="0" y="0">SALES</text>' +
        '<text class="iso-sign-sub" x="1" y="13">CLIENT INTAKE</text></g>');
    }

    /* --- 天井の照明 ------------------------------------------------ */
    for (i = 0; i < 4; i++) parts.push(lamp(1.4 + i * 3.1, 4.4));
    if (sf) parts.push(lamp(sf.x + 1.6, 4.4));

    /* --- 席（奥から手前へ） ---------------------------------------- */
    var seated = data.agents.slice().sort(function (a, b) {
      return (a.seat[0] + a.seat[1]) - (b.seat[0] + b.seat[1]);
    });

    var anchors = {};

    for (i = 0; i < seated.length; i++) {
      var a = seated[i];
      var bx = a.seat[0];
      var by = a.seat[1];
      var body;

      if (a.furniture === 'rack') {
        body = rack(bx, by, a);
        anchors[a.id] = project(bx + 1.2, by + 1.0, 2.5);
      } else if (a.furniture === 'platform') {
        /* CTOは一段高い台に座る。制作部門の外から見ていることを高さで示す。 */
        body = box(bx + 0.05, by + 0.05, 0, 2.65, 2.45, 0.34, SCENE.metalDark) +
          '<g transform="translate(0,' + (-0.34 * TZ).toFixed(1) + ')">' +
          person(bx, by, a, p) + deskUnit(bx, by, a) + '</g>';
        anchors[a.id] = project(bx + 1.0, by + 0.5, 2.1);
      } else {
        body = person(bx, by, a, p) + deskUnit(bx, by, a);
        anchors[a.id] = project(bx + 1.0, by + 0.5, 1.75);
      }

      /* 足元の敷き板。稼働中に光らせる。 */
      var glow = tile(bx + 0.05, by + 0.05, 2.6, 2.4, a.accent, 'class="iso-glow"');

      /* オーロラ。実行環境で色が決まる。
         Claude Code = 黄金、Codex = 海。人の後ろに置き、体の枠のように見せる。 */
      var aura = '';
      var auraKind = a.runtime === 'Claude Code' ? 'gold' : (a.runtime === 'Codex' ? 'ocean' : '');
      if (auraKind && a.furniture !== 'rack') {
        var ac = project(bx + 1.02, by + 0.52, a.furniture === 'platform' ? 1.35 : 1.0);
        aura = '<ellipse class="iso-aura" cx="' + ac.x.toFixed(1) + '" cy="' + ac.y.toFixed(1) +
          '" rx="34" ry="46" fill="url(#aura-' + auraKind + ')"/>';
      }

      parts.push(
        '<g class="iso-agent" data-agent="' + a.id + '" data-aura="' + auraKind + '" ' +
        'tabindex="0" role="button" ' +
        'aria-label="' + esc(a.label) + 'の席を開く">' + glow + aura + body + '</g>'
      );
    }

    /* --- 営業部フロアの家具（席と同じ深さ帯なので席の後） ------------ */
    if (sf) {
      parts.push(plant(sf.x + sf.w - 0.7, 0.2));
      /* 未起動の窓口は人を描かず机だけ置く。人つきだと動いて見える。 */
      (data.vacant || []).forEach(function (v) {
        parts.push(vacantDesk(v.seat[0], v.seat[1]));
      });
    }

    /* --- ミーティングテーブル（Codexブロックの手前） ---------------- */
    var meetGrid = [10.9, 7.3];
    parts.push(meetingTable(meetGrid[0], meetGrid[1]));

    /* --- 植木 ------------------------------------------------------ */
    parts.push(plant(-0.05, D - 0.9));
    parts.push(plant(W - 0.55, 2.95));
    parts.push(plant(6.7, 2.95));

    /* --- 歩行者レイヤー。会話シーンのとき panel が中へ描く ---------- */
    parts.push('<g class="iso-walkers" id="iso-walkers"></g>');

    /* --- 表示範囲 -------------------------------------------------- */
    var farX = data.salesFloor ? data.salesFloor.x + data.salesFloor.w : W;
    var corners = [project(0, 0, 0), project(farX, 0, 0), project(0, D, 0), project(farX, D, 0)];
    var xs = corners.map(function (c) { return c.x; });
    var ys = corners.map(function (c) { return c.y; });
    var minX = Math.min.apply(null, xs) - 30;
    var maxX = Math.max.apply(null, xs) + 30;
    var minY = Math.min.apply(null, ys) - 3.9 * TZ;
    var maxY = Math.max.apply(null, ys) + 26;

    var vb = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

    return {
      viewBox: vb,
      anchors: anchors,
      meeting: { grid: meetGrid, screen: project(meetGrid[0], meetGrid[1], 1.3) },
      zoneLabels: {
        claude: project(2.2, 3.35, 0),
        codex: project(9.0, 3.35, 0),
        audit: project(1.9, 0.4, 0),
        sales: data.salesFloor
          ? project(data.salesFloor.x + 1.4, 0.5, 0)
          : null
      },
      svg: '<svg class="iso-svg" viewBox="' + vb.x.toFixed(1) + ' ' + vb.y.toFixed(1) + ' ' +
        vb.w.toFixed(1) + ' ' + vb.h.toFixed(1) +
        '" role="img" aria-label="ENGULFのオフィス見取り図">' + auraDefs() + parts.join('') + '</svg>'
    };
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    render: render,
    project: project,
    shade: shade,
    box: box,
    standingPerson: standingPerson,
    SCENE: SCENE,
    TW: TW, TH: TH, TZ: TZ
  };
});
