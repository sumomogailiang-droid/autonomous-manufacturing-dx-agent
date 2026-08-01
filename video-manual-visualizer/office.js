/*
 * office.js
 *
 * エージェントのオフィスを等角投影（アイソメトリック）で描く。
 *
 * === なぜ手描きのドット絵ではないのか ===
 *
 * agents/sprites.mjs のドット絵は正面向きの16x16で、ターミナル用に作られている。
 * 斜め見下ろしにするには7体すべてを角度つきで描き直す必要があり、
 * しかも机・椅子・床との接地や陰影を1ピクセルずつ合わせることになる。
 *
 * そこで、箱（直方体）を計算で組み上げる方式にした。
 *   - 陰影が全部屋で自動的に揃う（上面・左面・右面の明度が常に同じ比率）
 *   - 席を足すとき座標を1行足すだけで済む
 *   - 拡大しても線がぼけない
 *
 * === 色の出どころ ===
 *
 * 人の色（役割色）は office-data.js 経由で agents/sprites.mjs の PALETTE から来る。
 * ターミナルのドット絵とブラウザのオフィスで、同じ役割が同じ色になる。
 *
 * 家具・床・植木の色は役割と関係がないので、このファイルの SCENE で持つ。
 *
 * === 等角投影の座標 ===
 *
 *   画面X = (x - y) * TW/2      x が増えると右下、y が増えると左下
 *   画面Y = (x + y) * TH/2 - z * TZ
 *
 * 手前ほど (x + y) が大きい。描画順は (x + y) の昇順にして、
 * 手前のものを後から描く（画家のアルゴリズム）。
 *
 * === 吹き出しの位置 ===
 *
 * 吹き出しはSVGではなくHTMLで出す（文字の折り返しと可読性のため）。
 * このファイルは各エージェントの頭の位置をviewBox座標で返すので、
 * 呼び出し側がそれをパーセントに直して重ねる。
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
    floorOversight: '#d9ccb8',
    rug: '#cbb9a0',
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
    wallDark: '#e8dfd0'
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
  /* 描画部品                                                           */
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

  /* ---------------------------------------------------------------- */
  /* 設備・装飾                                                         */
  /* ---------------------------------------------------------------- */

  /** MCPサーバーはラック。人ではないので椅子も机も置かない。 */
  function rack(bx, by, a) {
    var g = [];
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
    return box(x, y, 0, 0.42, 0.42, 0.34, SCENE.plantPot) +
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

  /** 奥の壁に掛かる案件ボード。文字はHTML側で出すので、ここでは行だけ示す。 */
  function board(x, y) {
    var g = [];
    g.push(box(x, y, 1.05, 3.4, 0.12, 1.25, SCENE.board));
    for (var i = 0; i < 5; i++) {
      g.push(box(x + 0.22, y - 0.01, 1.22 + i * 0.19, 1.4 + (i % 2) * 0.8, 0.02, 0.07, SCENE.boardLine));
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
   * @returns {{svg: string, anchors: object, viewBox: object}}
   *          anchors は各エージェントの頭上の位置（viewBox座標）。吹き出しの基準に使う。
   */
  function render(data) {
    var p = data.palette;
    var W = data.floor.w;
    var D = data.floor.d;
    var parts = [];
    var x, y, i;

    /* --- 奥の壁 ---------------------------------------------------- */
    parts.push(box(0, -0.30, 0, W, 0.30, 2.9, SCENE.wall));
    parts.push(box(-0.30, 0, 0, 0.30, D, 2.9, SCENE.wallDark));
    parts.push(board(2.6, -0.2));

    /* --- 床 -------------------------------------------------------- */
    parts.push('<g class="iso-floor">');
    for (y = 0; y < D; y++) {
      for (x = 0; x < W; x++) {
        var oversight = y < 2.5;
        var base = oversight ? SCENE.floorOversight : ((x + y) % 2 === 0 ? SCENE.floorA : SCENE.floorB);
        parts.push(tile(x, y, 1, 1, base));
      }
    }
    parts.push('</g>');

    /* 制作フロアの敷物。CTO席との境目を床で示す。 */
    parts.push(tile(0.2, 2.7, W - 0.4, D - 3.0, SCENE.rug, 'opacity="0.5"'));

    /* --- 天井の照明 ------------------------------------------------ */
    for (i = 0; i < 3; i++) parts.push(lamp(1.2 + i * 3.0, 4.2));

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
        /* CTOは一段高い台に座る。制作チームの外から見ていることを高さで示す。 */
        body = box(bx + 0.05, by + 0.05, 0, 2.65, 2.45, 0.34, SCENE.metalDark) +
          '<g transform="translate(0,' + (-0.34 * TZ).toFixed(1) + ')">' +
          person(bx, by, a, p) + deskUnit(bx, by, a) + '</g>';
        anchors[a.id] = project(bx + 1.0, by + 0.5, 2.05);
      } else {
        body = person(bx, by, a, p) + deskUnit(bx, by, a);
        anchors[a.id] = project(bx + 1.0, by + 0.5, 1.7);
      }

      /* 足元の敷き板。稼働中に光らせる。 */
      var glow = tile(bx + 0.05, by + 0.05, 2.6, 2.4, a.accent, 'class="iso-glow"');

      parts.push(
        '<g class="iso-agent" data-agent="' + a.id + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(a.label) + 'の席を開く">' + glow + body + '</g>'
      );
    }

    /* --- 植木（手前の角） ------------------------------------------ */
    parts.push(plant(-0.05, D - 0.9));
    parts.push(plant(W - 0.5, 0.15));

    /* --- 表示範囲 -------------------------------------------------- */
    var corners = [project(0, 0, 0), project(W, 0, 0), project(0, D, 0), project(W, D, 0)];
    var xs = corners.map(function (c) { return c.x; });
    var ys = corners.map(function (c) { return c.y; });
    var minX = Math.min.apply(null, xs) - 30;
    var maxX = Math.max.apply(null, xs) + 30;
    var minY = Math.min.apply(null, ys) - 3.7 * TZ;
    var maxY = Math.max.apply(null, ys) + 26;

    var vb = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

    return {
      viewBox: vb,
      anchors: anchors,
      svg: '<svg class="iso-svg" viewBox="' + vb.x.toFixed(1) + ' ' + vb.y.toFixed(1) + ' ' +
        vb.w.toFixed(1) + ' ' + vb.h.toFixed(1) +
        '" role="img" aria-label="エージェントのオフィス見取り図">' + parts.join('') + '</svg>'
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
    SCENE: SCENE,
    TW: TW, TH: TH, TZ: TZ
  };
});
