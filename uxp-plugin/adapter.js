/*
 * adapter.js
 *
 * Premiere Pro の UXP API を呼ぶ処理を、このファイルだけに閉じ込める。
 *
 * ⚠ 重要
 * このファイル内の premierepro API 呼び出しは、Premiere Pro 実機での動作確認を
 * していません。UXP の API はバージョンで差異があるため、初回はここだけを
 * 調整することになります。UI とロジック（app.js）は影響を受けません。
 *
 * Premiere が無い環境（ブラウザ・Node）では自動的にモックへ切り替わり、
 * UI の動作確認ができます。
 *
 * UXPは ESモジュールに対応していないため、グローバルへ代入するUMD形式にしている。
 */

/* eslint-disable no-undef */

(function (root, factory) {
  var api = factory();
  root.PremiereAdapter = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

const IS_UXP = (() => {
  try {
    return typeof require === 'function' && !!require('premierepro');
  } catch (e) {
    return false;
  }
})();

let ppro = null;
if (IS_UXP) {
  try { ppro = require('premierepro'); } catch (e) { ppro = null; }
}

/* ------------------------------------------------------------------ */
/* モック（Premiere が無い環境用）                                       */
/* ------------------------------------------------------------------ */

/* キー名は getActiveSequence() の戻り値と一致させること */
const mockState = {
  name: 'CAMPチャンネル_名古屋校_編集シーケンス',
  videoTracks: 4,
  audioTracks: 4,
  playhead: '00;08;08;44',
  /* 29.97DF。NTSC素材で最もフレームずれが起きやすい設定を既定にしておく */
  fps: 30000 / 1001,
  dropFrame: true,
  inserted: [],
  insertedTelops: [],
  lastSrt: ''
};

/* ------------------------------------------------------------------ */
/* APIの表面を調べる道具                                                */
/* ------------------------------------------------------------------ */

/* JS自体が持っているもの。どのオブジェクトにも出るので読む価値がない。 */
const NOISE = new Set([
  'constructor', 'apply', 'arguments', 'bind', 'call', 'caller', 'length',
  'name', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__proto__',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
]);

/*
 * オブジェクトが実際に持っているメソッド名を返す。
 * UXPのAPIは版差が大きく、あるはずの定数が無いことがある。
 * 失敗したときにこれを一緒に出しておくと、次に何を試すかが決まる。
 *
 * name は Premiere 側の実データでもあるので、
 * クラスの静的側（関数）でだけ雑音として落とす。
 */
function surfaceOf(obj, keepDataNames) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return [];
  const names = new Set();
  let cur = obj;
  for (let depth = 0; cur && cur !== Object.prototype && cur !== Function.prototype && depth < 4; depth++) {
    for (const k of Object.getOwnPropertyNames(cur)) {
      if (NOISE.has(k) && !(keepDataNames && k === 'name')) continue;
      names.add(k);
    }
    cur = Object.getPrototypeOf(cur);
  }
  return [...names].sort();
}

/* ------------------------------------------------------------------ */
/* 公開API                                                             */
/* ------------------------------------------------------------------ */

const adapter = {
  /** Premiere 実機で動いているか */
  isPremiere() {
    return IS_UXP && !!ppro;
  },

  /** 環境名（UI表示用） */
  environment() {
    return this.isPremiere() ? 'Premiere Pro' : 'モック（Premiere外）';
  },

  /**
   * アクティブシーケンスの情報を取得する。
   * @returns {Promise<{name:string, videoTracks:number, audioTracks:number, playhead:string}|null>}
   */
  async getActiveSequence() {
    if (!this.isPremiere()) {
      const { name, videoTracks, audioTracks, playhead } = mockState;
      return { name, videoTracks, audioTracks, playhead };
    }

    /* --- ここから Premiere API（未検証） --- */
    const project = await ppro.Project.getActiveProject();
    if (!project) return null;

    const seq = await project.getActiveSequence();
    if (!seq) return null;

    const videoTracks = await seq.getVideoTrackCount();
    const audioTracks = await seq.getAudioTrackCount();

    let playhead = '';
    try {
      const t = await seq.getPlayerPosition();
      playhead = t && t.seconds !== undefined ? formatSeconds(t.seconds) : '';
    } catch (e) {
      playhead = '';
    }

    return {
      name: await seq.name,
      videoTracks,
      audioTracks,
      playhead
    };
    /* --- ここまで Premiere API --- */
  },

  /**
   * プロジェクトパネル内から、名前が一致するアイテムを探す。
   * @param {string} name
   * @returns {Promise<object|null>}
   */
  async findProjectItem(name) {
    if (!this.isPremiere()) {
      return { name, __mock: true };
    }

    /* --- ここから Premiere API（未検証） --- */
    const project = await ppro.Project.getActiveProject();
    if (!project) return null;
    const root = await project.getRootItem();

    const walk = async (item) => {
      const children = await item.getItems?.();
      if (!children) return null;
      for (const child of children) {
        const childName = await child.name;
        if (childName === name) return child;
        const found = await walk(child);
        if (found) return found;
      }
      return null;
    };
    return await walk(root);
    /* --- ここまで Premiere API --- */
  },

  /**
   * 再生ヘッド位置へ、指定トラックにクリップを挿入（上書き）する。
   *
   * マニュアル準拠の注意:
   *  - トラックターゲットを間違えると必要なクリップが消える（事故防止マップ A02）
   *  - そのため挿入前に対象トラック番号を必ず確認する
   *
   * @param {{name:string, trackType:'video'|'audio', trackIndex:number}} opts
   * @returns {Promise<{ok:boolean, message:string}>}
   */
  async insertAtPlayhead({ name, trackType, trackIndex }) {
    if (!this.isPremiere()) {
      mockState.inserted.push({ name, trackType, trackIndex, at: mockState.playhead });
      return {
        ok: true,
        message: `［モック］${name} を ${trackType === 'video' ? 'V' : 'A'}${trackIndex} へ挿入しました`
      };
    }

    /* --- ここから Premiere API（未検証） --- */
    const project = await ppro.Project.getActiveProject();
    if (!project) return { ok: false, message: 'プロジェクトが開かれていません' };

    const seq = await project.getActiveSequence();
    if (!seq) return { ok: false, message: 'シーケンスが選択されていません' };

    const item = await this.findProjectItem(name);
    if (!item) {
      return { ok: false, message: `プロジェクトパネルに「${name}」が見つかりません` };
    }

    const track = trackType === 'video'
      ? await seq.getVideoTrack(trackIndex - 1)
      : await seq.getAudioTrack(trackIndex - 1);

    if (!track) {
      return { ok: false, message: `トラック ${trackType === 'video' ? 'V' : 'A'}${trackIndex} が存在しません` };
    }

    const pos = await seq.getPlayerPosition();

    /* 上書き（overwrite）で挿入する。insert だと後続クリップがずれるため。 */
    await project.lockedAccess(() => {
      project.executeTransaction((tx) => {
        const action = track.createOverwriteItemAction(item, pos, true, true);
        tx.addAction(action);
      }, `トンマナパレット: ${name} を挿入`);
    });

    return {
      ok: true,
      message: `${name} を ${trackType === 'video' ? 'V' : 'A'}${trackIndex} へ挿入しました`
    };
    /* --- ここまで Premiere API --- */
  },

  /**
   * 演出スロットの位置へマーカーをまとめて打つ。
   *
   * === なぜマーカーなのか ===
   *
   * 案件マニュアルは「演出は6秒に1回入れる」「演出はデザインテロップ・SE・
   * 画角変化をセットにする」と定めている。このうちテロップの作成は、
   * ソーステキストの値をAPIから読めないため今はできない。
   *
   * 一方で「どこに演出が要るか」は計算で出せる。
   * そこを目印として置いておけば、編集者はマーカーを辿って埋めるだけになる。
   *
   * マーカーは既存のクリップを一切変更しない。失敗しても消せる。
   * 書き込み系のAPIが実際に動くかを確かめる最初の一歩としても、いちばん安全。
   *
   * @param {{startFrame:number, endFrame:number, intervalSec:number,
   *          rate:object, label?:string, comment?:string}} opts
   * @returns {Promise<{ok:boolean, placed:number, message:string}>}
   */
  async addDirectionMarkers(opts) {
    const o = opts || {};
    const rate = o.rate;
    if (!rate || !rate.exact) throw new Error('フレームレートが指定されていません。');

    /* 位置は呼び出し側が決めて渡す。
       打つ前に画面へ出した一覧と、実際に打つ位置を必ず同じものにするため。
       ここでも計算すると、片方だけ直したときに食い違う。 */
    const points = Array.isArray(o.points) ? o.points : [];
    if (!points.length) throw new Error('打つ位置がありません。');
    const label = o.label || '演出';

    if (!this.isPremiere()) {
      for (const p of points) {
        mockState.inserted.push({ marker: `${label}${p.no}`, at: p.frame, comment: p.comment || '' });
      }
      return {
        ok: true, placed: points.length,
        message: `［モック］マーカーを${points.length}個 計算しました。実際には打っていません。`
      };
    }

    /* --- ここから Premiere API（未検証） --- */
    const TICKS_PER_SECOND = 254016000000;
    const project = await ppro.Project.getActiveProject();
    if (!project) return { ok: false, placed: 0, message: 'プロジェクトが開かれていません' };
    const seq = await project.getActiveSequence();
    if (!seq) return { ok: false, placed: 0, message: 'シーケンスが選択されていません' };

    const markers = await ppro.Markers.getMarkers(seq);
    if (!markers) return { ok: false, placed: 0, message: 'マーカーを取得できませんでした' };

    /*
     * マーカー種別の渡し方が版で違う。
     * Premiere 26 の Constants には MarkerType が無く（あるのは MarkerColor）、
     * 定数を決め打ちすると全件が「Cannot read properties of undefined」で落ちる。
     *
     * 実機で通ったのは「種別を省略した3引数」だったので、それを先頭に置く。
     * 他の形も残してあるのは、別の版で動かしたときの保険。
     * 通った形を1回だけ決めて使い回す。全件で総当たりすると失敗が積み上がる。
     */
    const typeCandidates = [];
    typeCandidates.push({ label: '種別を省略', value: undefined });
    const MT = ppro.Constants && ppro.Constants.MarkerType;
    if (MT && MT.COMMENT !== undefined) {
      typeCandidates.push({ label: 'Constants.MarkerType.COMMENT', value: MT.COMMENT });
    }
    typeCandidates.push({ label: '"Comment"', value: 'Comment' });
    typeCandidates.push({ label: '"comment"', value: 'comment' });
    typeCandidates.push({ label: '0', value: 0 });

    let chosen = null;
    const attempts = [];

    const makeAction = (name, comment, time) => {
      const build = (c) => (c.value === undefined
        ? markers.createAddMarkerAction(name, comment, time)
        : markers.createAddMarkerAction(name, comment, time, c.value));

      if (chosen) return build(chosen);

      let lastErr = null;
      for (const c of typeCandidates) {
        try {
          const a = build(c);
          if (a) { chosen = c; return a; }
          attempts.push(`${c.label}: 何も返らなかった`);
        } catch (e) {
          lastErr = e;
          attempts.push(`${c.label}: ${e && e.message ? e.message : String(e)}`);
        }
      }
      throw lastErr || new Error('マーカーの作り方が分かりませんでした');
    };

    /* 1つの取り消し単位にまとめる。件数分が個別に残ると取り消しが面倒になる。 */
    let placed = 0;
    const errors = [];
    await project.lockedAccess(() => {
      project.executeTransaction((tx) => {
        for (const p of points) {
          try {
            const ticks = String(Math.round((p.frame / rate.exact) * TICKS_PER_SECOND));
            const t = ppro.TickTime.createWithTicks(ticks);
            /* コメントは位置ごとに違う。その場面で何を話しているかを入れておくと、
               マーカーパネルがそのまま作業リストになる。 */
            tx.addAction(makeAction(`${label}${p.no}`, p.comment || o.comment || '', t));
            placed++;
          } catch (e) {
            errors.push(`${label}${p.no}: ${e && e.message ? e.message : String(e)}`);
            /* 1件目で全候補が落ちたなら、残りも落ちる。件数分待たせない。 */
            if (!chosen) break;
          }
        }
      }, `編集アシスタント: ${label}マーカー ${points.length}個`);
    });

    if (placed === points.length) {
      return {
        ok: true, placed,
        message: `マーカーを${placed}個 打ちました（${chosen ? chosen.label : '既定'}）。` +
                 '取り消しは1回で戻せます。'
      };
    }

    if (placed === 0) {
      /* 何が使えるのかを一緒に返す。「打てませんでした」だけでは直しようがない。 */
      return {
        ok: false, placed: 0,
        message:
          'マーカーを打てませんでした。\n\n' +
          '試した渡し方:\n- ' + [...new Set(attempts)].join('\n- ') + '\n\n' +
          'Markers が持つもの:\n  ' + surfaceOf(markers, true).join(', ') + '\n\n' +
          'Constants にあるキー:\n  ' +
          (ppro.Constants ? surfaceOf(ppro.Constants).join(', ') : '(Constants なし)') +
          '\n\nこの内容をそのままチャットへ貼ってください。'
      };
    }

    return {
      ok: true, placed,
      message: `${points.length}個中 ${placed}個を打ちました。\n打てなかったもの:\n- ` +
               errors.slice(0, 10).join('\n- ')
    };
    /* --- ここまで Premiere API --- */
  },

  /**
   * 指定シーケンスの指定トラックにあるテキストレイヤーを調査する。
   *
   * === なぜ「変換」ではなく「調査」なのか ===
   *
   * 段落テキストとポイントテキストの切り替えが premierepro API で
   * できるかどうか、公開されている情報の中では確認が取れていない。
   * テキスト系で確認できるのは文字列とスタイル（フォント・サイズ・色）までで、
   * レイヤーの種類を切り替える口があるとは限らない。
   *
   * 動くかどうか分からないAPIを、動く前提で書いてはいけない。
   * そこで先に「その環境のAPIが実際に何を公開しているか」を書き出す。
   * 結果を見てから変換を実装する。
   *
   * 見つからなければ「見つからなかった」と書く。それが答えになる。
   *
   * @param {{sequenceName?:string, trackIndex?:number, maxItems?:number}} opts
   *        trackIndex は1始まり（V3なら3）
   * @returns {Promise<object>} 調査結果。report が人が読む用の本文。
   */
  async inspectTextLayers(opts) {
    const o = opts || {};
    const trackIndex = Number.isFinite(o.trackIndex) ? o.trackIndex : 3;
    const maxItems = Number.isFinite(o.maxItems) ? o.maxItems : 5;
    const wantName = o.sequenceName || '';

    if (!this.isPremiere()) {
      return {
        ok: false,
        environment: this.environment(),
        sequence: { requested: wantName, found: null },
        trackIndex,
        items: [],
        errors: [],
        report:
          'モック環境のため調査できません。\n' +
          'Premiere Pro で「編集アシスタント」パネルを開いて実行してください。'
      };
    }

    /* --- ここから Premiere API（未検証） --- */
    const errors = [];
    const lines = [];
    const say = (s) => lines.push(s);

    /* 呼び方が版で違うので、候補を順に試して通ったものを使う */
    const tryCall = async (obj, names, args) => {
      for (const n of names) {
        try {
          if (typeof obj[n] === 'function') {
            const v = await obj[n].apply(obj, args || []);
            if (v !== undefined && v !== null) return { ok: true, via: n + '()', value: v };
          } else if (obj[n] !== undefined && obj[n] !== null) {
            const v = await obj[n];
            if (v !== undefined && v !== null) return { ok: true, via: n, value: v };
          }
        } catch (e) {
          errors.push(`${n}: ${e && e.message ? e.message : String(e)}`);
        }
      }
      return { ok: false, via: null, value: null };
    };

    /* --- まずAPI全体を見る ---
       クリップを辿る前に、そもそもどんなクラスと定数があるかを出す。
       段落／ポイントの切り替えがあるなら、この一覧に痕跡が出るはず。 */
    /* 段落／ポイントの切り替えを指しそうな名前。
       「ポイント」単体は入れない。「アンカーポイント」に当たって
       関係のないものが大量に候補として出る。 */
    const KEY = /(boxText|box_text|pointText|point_text|areaText|area_text|textBox|text_box|paragraph|段落|ポイントテキスト|段落テキスト|layerType|textType|TextLayer|TextDocument)/i;

    say('══ premierepro が公開しているもの');
    const pproNames = surfaceOf(ppro);
    say('  ' + (pproNames.length ? pproNames.join(', ') : '(取得できませんでした)'));
    const pproHits = pproNames.filter((n) => KEY.test(n));
    say('  → 該当しそうな名前: ' + (pproHits.length ? pproHits.join(', ') : 'なし'));
    say('');

    if (ppro.Constants) {
      const constNames = surfaceOf(ppro.Constants);
      say('══ premierepro.Constants');
      say('  ' + constNames.join(', '));
      const constHits = constNames.filter((n) => KEY.test(n));
      say('  → 該当しそうな名前: ' + (constHits.length ? constHits.join(', ') : 'なし'));
      /* 該当した定数は中身まで出す */
      for (const n of constHits) {
        try { say(`    ${n} = ${JSON.stringify(ppro.Constants[n])}`); } catch (e) { /* 出せなくても続ける */ }
      }
      say('');
    }

    /* テキスト関連のクラスは、静的メソッドまで見ておく */
    for (const cls of ['SourceTextValue', 'TextStyle', 'TextLayer', 'TextDocument', 'ComponentParam']) {
      if (!ppro[cls]) continue;
      say(`══ premierepro.${cls}`);
      const statics = surfaceOf(ppro[cls]);
      say('  静的: ' + (statics.length ? statics.join(', ') : '(なし)'));
      if (ppro[cls].prototype) {
        const protos = surfaceOf(ppro[cls].prototype, true);
        say('  実体: ' + (protos.length ? protos.join(', ') : '(なし)'));
      }
      say('');
    }

    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error('プロジェクトが開かれていません。');

    /* --- シーケンスを名前で探す --- */
    let seq = null;
    let seqName = '';
    const seqList = await tryCall(project, ['getSequences', 'getSequenceList'], []);

    /* 名前が空なら、開いているシーケンスを使う。
       一覧の先頭を黙って使ってはいけない。別のシーケンスを調べた結果を
       目的のシーケンスの結果だと読み違える。 */
    if (!wantName) {
      seq = await project.getActiveSequence();
      const n = seq && await tryCall(seq, ['name', 'getName'], []);
      seqName = n && n.ok ? String(n.value) : '';
      say('⚠ シーケンス名が空欄でした。開いているシーケンスを対象にしています。');
      say('  別のシーケンスを調べたい場合は、名前を入力してから実行してください。');
      say('');
    } else if (seqList.ok && seqList.value && seqList.value.length) {
      for (const s of seqList.value) {
        const n = await tryCall(s, ['name', 'getName'], []);
        const nm = n.ok ? String(n.value) : '';
        if (nm === wantName) { seq = s; seqName = nm; break; }
      }
      if (!seq) {
        const all = [];
        for (const s of seqList.value) {
          const n = await tryCall(s, ['name', 'getName'], []);
          all.push(n.ok ? String(n.value) : '(名前不明)');
        }
        say(`シーケンス「${wantName}」が見つかりませんでした。`);
        say('このプロジェクトにあるシーケンス:');
        for (const a of all) say('  - ' + a);
        return {
          ok: false, environment: this.environment(),
          sequence: { requested: wantName, found: null, available: all },
          trackIndex, items: [], errors, report: lines.join('\n')
        };
      }
    } else {
      /* 一覧が取れない版では、開いているシーケンスで代用する */
      seq = await project.getActiveSequence();
      const n = seq && await tryCall(seq, ['name', 'getName'], []);
      seqName = n && n.ok ? String(n.value) : '';
      say('シーケンス一覧APIが使えないため、アクティブなシーケンスを対象にしました。');
      if (wantName && seqName && seqName !== wantName) {
        say(`⚠ 対象が指定と違います。指定「${wantName}」／ 実際「${seqName}」`);
        say('  目的のシーケンスを開いてから、もう一度実行してください。');
      }
    }
    if (!seq) throw new Error('シーケンスを取得できませんでした。');

    say(`シーケンス : ${seqName || '(名前不明)'}`);
    if (wantName && seqName && seqName !== wantName) {
      say(`⚠ 指定「${wantName}」と違うシーケンスを見ています。結果は指定のものではありません。`);
    }
    say(`対象トラック: V${trackIndex}`);
    say('');

    /* シーケンス自体の口も出す。fpsや尺の取り方がここで分かる。 */
    say('══ Sequence が持つもの');
    say('  ' + surfaceOf(seq, true).join(', '));
    try {
      const st = await seq.getSettings();
      if (st) {
        say('══ getSettings() が持つもの');
        say('  ' + [...new Set(Object.keys(st).concat(surfaceOf(st, true)))].join(', '));
        for (const k of ['videoFrameRate', 'videoDisplayFormat', 'videoFrameWidth', 'videoFrameHeight']) {
          if (st[k] === undefined) continue;
          let shown;
          try { shown = JSON.stringify(st[k]); } catch (e) { shown = String(st[k]); }
          say(`    ${k} = ${shown}  (型 ${typeof st[k]})`);
        }
      } else {
        say('══ getSettings() は null を返しました');
      }
    } catch (e) {
      say('══ getSettings() でエラー: ' + (e && e.message ? e.message : String(e)));
    }
    say('');
    say('');

    /* --- トラックとクリップ --- */
    const track = await seq.getVideoTrack(trackIndex - 1);
    if (!track) throw new Error(`V${trackIndex} が存在しません。`);

    let items = [];
    const TT = (ppro.Constants && ppro.Constants.TrackItemType) || {};
    const got = await tryCall(track, ['getTrackItems'], [TT.CLIP !== undefined ? TT.CLIP : 1, false]);
    if (got.ok) items = got.value;
    else {
      const got2 = await tryCall(track, ['getTrackItems'], []);
      if (got2.ok) items = got2.value;
    }
    items = Array.isArray(items) ? items : [];

    say(`クリップ数 : ${items.length}`);
    say('');

    if (!items.length) {
      say('V' + trackIndex + ' にクリップがありません。トラック番号を確認してください。');
      return {
        ok: false, environment: this.environment(),
        sequence: { requested: wantName, found: seqName },
        trackIndex, items: [], errors, report: lines.join('\n')
      };
    }

    /* --- 先頭数件の中身を書き出す --- */
    const dumped = [];
    /* ソーステキストの値の中に見つかった候補。パラメータ名とは別に集める。 */
    const valueHits = [];
    /* 同じ構造のクリップを何度も書かない。
       テロップは同じテンプレートから作るので中身がそっくりになり、
       全部出すと読むべき差分が埋もれる。 */
    const seenShape = new Map();
    let shownTrackItemSurface = false;

    for (let i = 0; i < Math.min(items.length, maxItems); i++) {
      const it = items[i];
      const nm = await tryCall(it, ['name', 'getName'], []);
      /* いったん溜めてから、既出の構造かどうかで出し方を決める */
      const buf = [];
      const say = (s) => buf.push(s);

      if (!shownTrackItemSurface) {
        say('  TrackItem が持つもの:');
        say('    ' + surfaceOf(it, true).join(', '));
        shownTrackItemSurface = true;
      }

      const chainRes = await tryCall(it, ['getComponentChain'], []);
      if (!chainRes.ok) {
        /* ここで抜けると溜めた分が捨てられるので、直接書き出す */
        lines.push(`── クリップ ${i + 1}: ${nm.ok ? nm.value : '(名前不明)'}`);
        for (const l of buf) lines.push(l);
        lines.push('  ⚠ コンポーネントチェーンを取得できませんでした。');
        lines.push('');
        continue;
      }
      const chain = chainRes.value;
      const cntRes = await tryCall(chain, ['getComponentCount'], []);
      const count = cntRes.ok ? Number(cntRes.value) : 0;
      say(`  コンポーネント数: ${count}`);

      const comps = [];
      for (let c = 0; c < count; c++) {
        const compRes = await tryCall(chain, ['getComponentAtIndex'], [c]);
        if (!compRes.ok) continue;
        const comp = compRes.value;
        const mn = await tryCall(comp, ['getMatchName', 'matchName'], []);
        const cn = await tryCall(comp, ['getComponentName', 'name', 'getName', 'displayName'], []);
        const pcRes = await tryCall(comp, ['getParamCount'], []);
        const pc = pcRes.ok ? Number(pcRes.value) : 0;
        say(`    [${c}] ${cn.ok ? cn.value : '?'}  (matchName: ${mn.ok ? mn.value : '?'})  パラメータ${pc}件`);
        if (c === 0) say(`        Component が持つもの: ${surfaceOf(comp, true).join(', ')}`);

        const params = [];
        for (let p = 0; p < pc; p++) {
          const prRes = await tryCall(comp, ['getParam'], [p]);
          if (!prRes.ok) continue;
          const prm = prRes.value;
          const dn = await tryCall(prm, ['displayName', 'getDisplayName'], []);
          const label = dn.ok ? String(dn.value) : '(名前不明)';
          params.push(label);

          /* テキストらしいパラメータだけ、値の中身まで踏み込む */
          const looksText = /text|テキスト|source ?text|ソース/i.test(label);
          if (!looksText) continue;
          say(`        ▸ テキストらしいパラメータ: ${label}`);
          say(`          ComponentParam が持つもの: ${surfaceOf(prm, true).join(', ')}`);

          let val = null;
          const valRes = await tryCall(prm, ['getStartValue', 'getValue', 'value'], []);
          if (valRes.ok) {
            val = valRes.value;
            say(`          値の取得: ${valRes.via} で成功`);
          } else {
            /* Premiereは読み取りでも lockedAccess の中でないと通らないものがある。
               素で失敗したときは、その中でもう一度試す。

               ロックの中で await はできないので、Promise だけ受け取って外で解く。
               ここで解かずに渡すと Promise 自体を調べてしまい、
               then / catch / finally しか見えない。 */
            let pending = null;
            try {
              await project.lockedAccess(() => { pending = prm.getStartValue(); });
              val = await pending;
              if (val) say('          値の取得: lockedAccess 内の getStartValue() で成功');
            } catch (e) {
              errors.push('lockedAccess+getStartValue: ' + (e && e.message ? e.message : String(e)));
            }
          }
          if (val === null || val === undefined) { say('          値を取得できませんでした。'); continue; }

          /* 値そのものを、形を変えて何通りか出す。
             どれか1つでも中身が見えれば、段落／ポイントの持ち方が分かる。 */
          say(`          値の型: ${typeof val}`);
          say(`          値が持つもの: ${surfaceOf(val, true).join(', ') || '(なし)'}`);
          try {
            const keys = Object.keys(val).concat(surfaceOf(val, true));
            if (keys.length) say(`          列挙できるキー: ${[...new Set(keys)].join(', ')}`);
            /* 段落／ポイントの持ち方は、パラメータ名ではなく
               この値の中にある可能性が高い。ここも候補として拾う。 */
            for (const k of new Set(keys)) {
              if (KEY.test(k)) valueHits.push(`ソーステキストの値 → ${k}`);
            }
          } catch (e) { /* 列挙できなくても続ける */ }
          try {
            const s = String(val);
            say(`          文字列化: ${s.length > 600 ? s.slice(0, 600) + ' …(以下略)' : s}`);
          } catch (e) { /* 出せなくても続ける */ }
          try {
            const j = JSON.stringify(val);
            if (j && j !== '{}') say(`          JSON: ${j.length > 900 ? j.slice(0, 900) + ' …(以下略)' : j}`);
          } catch (e) { /* 循環参照などは出せない */ }

          for (const m of ['getText', 'getTextStyle', 'getSegments', 'getTextSegments']) {
            const r = await tryCall(val, [m], []);
            if (!r.ok) continue;
            const inner = await r.value;
            say(`          ${m}() → ${surfaceOf(inner, true).join(', ') || String(inner).slice(0, 200)}`);
          }
        }
        if (params.length) say(`        パラメータ名: ${params.join(' / ')}`);
        comps.push({ index: c, matchName: mn.value || null, name: cn.value || null, params });
      }
      dumped.push({ index: i, name: nm.value || null, components: comps });

      /* 構造の指紋。コンポーネントとパラメータ名がすべて同じなら同じ形。 */
      const shape = comps.map((c) => c.matchName + ':' + c.params.join(',')).join('|');
      const label = `── クリップ ${i + 1}: ${nm.ok ? nm.value : '(名前不明)'}`;
      if (seenShape.has(shape)) {
        lines.push(`${label} — 構造はクリップ${seenShape.get(shape)}と同じ（内容を省略）`);
      } else {
        seenShape.set(shape, i + 1);
        lines.push(label);
        for (const l of buf) lines.push(l);
      }
      lines.push('');
    }

    if (items.length > maxItems) {
      say(`※ 先頭${maxItems}件のみ書き出しました（全${items.length}件）。`);
      say('');
    }

    /* --- 段落／ポイントの切り替え口があるかを機械的に探す（KEY は冒頭で定義） --- */
    const hits = [];
    for (const d of dumped) {
      for (const c of d.components) {
        for (const p of c.params) if (KEY.test(p)) hits.push(`${c.name || c.matchName} → ${p}`);
      }
    }
    for (const v of new Set(valueHits)) hits.push(v);

    say('── 段落／ポイントの切り替えらしい項目');
    if (hits.length) {
      for (const h of new Set(hits)) say('  ' + h);
      say('');
      say('候補が見つかりました。この出力をチャットへ貼ってください。変換の実装に進めます。');
    } else {
      say('  見つかりませんでした。');
      say('');
      say('この結果だけでは「APIに無い」と断定はできません（名前が想定と違う可能性）。');
      say('上の「持っているもの」の一覧ごとチャットへ貼ってください。こちらで確認します。');
    }

    if (errors.length) {
      say('');
      say('── 試したが通らなかった呼び出し（参考。失敗自体は想定内）');
      for (const e of [...new Set(errors)].slice(0, 20)) say('  ' + e);
    }

    return {
      ok: true,
      environment: this.environment(),
      sequence: { requested: wantName, found: seqName },
      trackIndex,
      itemCount: items.length,
      items: dumped,
      candidates: hits,
      errors,
      report: lines.join('\n')
    };
    /* --- ここまで Premiere API --- */
  },

  /**
   * 再生ヘッド位置のタイムコードを取得する。
   * カット記録（PDCA）で修正箇所を残すのに使う。
   * @returns {Promise<string>} 例 "00;08;08;44"
   */
  async getPlayheadTimecode() {
    if (!this.isPremiere()) {
      return mockState.playhead;
    }

    /* --- ここから Premiere API（未検証） --- */
    const project = await ppro.Project.getActiveProject();
    if (!project) return '';
    const seq = await project.getActiveSequence();
    if (!seq) return '';
    const t = await seq.getPlayerPosition();
    return t && t.seconds !== undefined ? formatSeconds(t.seconds) : '';
    /* --- ここまで Premiere API --- */
  },

  /**
   * 再生ヘッド位置へシーケンスマーカーを追加する。
   * 修正箇所やカット候補を残すのに使う。
   * @param {{name:string, comment?:string}} opts
   */
  async addMarker({ name, comment = '' }) {
    if (!this.isPremiere()) {
      mockState.inserted.push({ marker: name, comment, at: mockState.playhead });
      return { ok: true, message: `［モック］マーカー「${name}」を ${mockState.playhead} に追加しました` };
    }

    /* --- ここから Premiere API（未検証） --- */
    const project = await ppro.Project.getActiveProject();
    if (!project) return { ok: false, message: 'プロジェクトが開かれていません' };
    const seq = await project.getActiveSequence();
    if (!seq) return { ok: false, message: 'シーケンスが選択されていません' };

    const markers = await ppro.Markers.getMarkers(seq);
    const pos = await seq.getPlayerPosition();

    await project.lockedAccess(() => {
      project.executeTransaction((tx) => {
        tx.addAction(markers.createAddMarkerAction(name, comment, pos, ppro.Constants.MarkerType.COMMENT));
      }, `編集アシスタント: マーカー ${name}`);
    });

    return { ok: true, message: `マーカー「${name}」を追加しました` };
    /* --- ここまで Premiere API --- */
  },

  /**
   * シーケンスのフレームレートを取得する。
   *
   * Premiere は内部時間を「ticks」で持つ。1秒 = 254,016,000,000 ticks。
   * timebase（1フレームあたりのticks）から fps を割り出す。
   * 29.97fps なら timebase = 8475667.2 → fps = 29.97002997...
   *
   * 取得できない場合は null を返す。呼び出し側で既定値を使うこと。
   * 勝手に30fpsとみなすと、29.97素材で1分あたり約1.8フレームずれる。
   *
   * @returns {Promise<{fps:number, dropFrame:boolean}|null>}
   */
  async getSequenceFrameRate() {
    if (!this.isPremiere()) {
      return { fps: mockState.fps ?? 29.97, dropFrame: mockState.dropFrame ?? true };
    }

    /* --- ここから Premiere API（未検証） --- */
    const TICKS_PER_SECOND = 254016000000;

    const project = await ppro.Project.getActiveProject();
    if (!project) return null;
    const seq = await project.getActiveSequence();
    if (!seq) return null;

    let fps = null;
    let dropFrame = false;
    /* どの経路を試して何が返ったかを残す。
       「取得できませんでした」だけでは直しようがないため。 */
    const tried = [];

    /* 値の形が版で違う。1フレームのticksで来ることも、fpsそのもので来ることもある。 */
    const toFps = (v, where) => {
      if (v === null || v === undefined) { tried.push(`${where}: なし`); return null; }
      const raw = (typeof v === 'object')
        ? (v.ticksPerFrame ?? v.ticks ?? v.value ?? v.seconds ?? null)
        : v;
      const n = Number(raw);
      if (!isFinite(n) || n <= 0) { tried.push(`${where}: 読めない値 ${JSON.stringify(raw)}`); return null; }
      /* ticks なら大きい数、fps ならせいぜい数百 */
      const asFps = n > 10000 ? TICKS_PER_SECOND / n : n;
      if (!isFinite(asFps) || asFps <= 0 || asFps > 1000) {
        tried.push(`${where}: 範囲外 ${asFps}`);
        return null;
      }
      tried.push(`${where}: ${asFps}`);
      return asFps;
    };

    /* 経路1: シーケンス設定 */
    try {
      const settings = await seq.getSettings();
      if (settings) {
        fps = toFps(settings.videoFrameRate, 'getSettings().videoFrameRate');
        const disp = settings.videoDisplayFormat;
        dropFrame = disp !== undefined && String(disp).toLowerCase().includes('drop');
      } else {
        tried.push('getSettings(): null');
      }
    } catch (e) {
      tried.push('getSettings(): ' + (e && e.message ? e.message : String(e)));
    }

    /* 経路2: timebase を直接見る */
    if (!fps) {
      try { fps = toFps(await seq.timebase, 'timebase'); }
      catch (e) { tried.push('timebase: ' + (e && e.message ? e.message : String(e))); }
    }

    /* 経路3: メソッド形式で持っている版 */
    if (!fps) {
      for (const m of ['getVideoFrameRate', 'getFrameRate', 'getTimebase']) {
        if (typeof seq[m] !== 'function') continue;
        try { fps = toFps(await seq[m](), m + '()'); if (fps) break; }
        catch (e) { tried.push(`${m}(): ` + (e && e.message ? e.message : String(e))); }
      }
    }

    if (!fps || !isFinite(fps)) {
      return { fps: null, dropFrame: false, error: '試した経路:\n- ' + tried.join('\n- ') };
    }
    return { fps, dropFrame };
    /* --- ここまで Premiere API --- */
  },

  /**
   * テロップをシーケンスへ配置する。
   *
   * 配置経路を順に試し、成功したものを報告する。
   * どれも使えない場合でも SRT ファイルは必ず書き出すので、
   * 「何も残らない」状態にはならない。
   *
   * items は timecode.js の snapToFrames が返した、フレーム確定済みの配列。
   * ここで秒へ戻して丸め直すことはしない（それがフレームずれの原因になる）。
   *
   * @param {Array} items snapToFrames の戻り値
   * @param {{rate:object, trackIndex:number, mogrtPath?:string, srtText:string}} opts
   * @returns {Promise<{method:string, placed:number, filePath?:string, note:string}>}
   */
  async insertTelops(items, opts) {
    const o = opts || {};

    if (!this.isPremiere()) {
      mockState.insertedTelops = items.map((i) => ({
        inFrame: i.inFrame, outFrame: i.outFrame, text: i.text,
        layer: i.layer || 0,
        track: (Number.isFinite(o.trackIndex) ? o.trackIndex : 1) + (i.layer || 0)
      }));
      return {
        method: 'mock',
        placed: items.length,
        note: 'モック環境のため実際には配置していません。Premiere内で実行してください。'
      };
    }

    /* --- ここから Premiere API（未検証） --- */
    const TICKS_PER_SECOND = 254016000000;
    const trackIndex = Number.isFinite(o.trackIndex) ? o.trackIndex : 1;
    const errors = [];

    const project = await ppro.Project.getActiveProject();
    const seq = project && await project.getActiveSequence();
    if (!seq) throw new Error('アクティブなシーケンスがありません。シーケンスを開いてから実行してください。');

    /* フレーム番号 → ticks。整数フレームからの変換なので誤差は入らない */
    const frameToTicks = (frame) => {
      const rate = o.rate;
      return Math.round((frame / rate.exact) * TICKS_PER_SECOND);
    };

    /* 経路1: MOGRT テンプレートを各位置へ配置する */
    if (o.mogrtPath) {
      try {
        let placed = 0;
        for (const it of items) {
          const t = await ppro.TickTime.createWithTicks(String(frameToTicks(it.inFrame)));
          /* 同時発言は上のトラックへ（マニュアル: 2人目のテロップを上に重ねる） */
          const target = trackIndex + (it.layer || 0);
          const mgt = await seq.importMGT(o.mogrtPath, t, target, 0);
          if (mgt) placed++;
        }
        if (placed > 0) {
          return {
            method: 'mogrt',
            placed,
            note: `MOGRTテンプレートを ${placed}件 配置しました` +
                  (o.layers > 1
                    ? `（V${trackIndex + 1}〜V${trackIndex + o.layers}。同時発言を上のトラックへ分けています）`
                    : `（V${trackIndex + 1}）`) +
                  '。テキストの流し込みは手動で行ってください。'
          };
        }
      } catch (e) {
        errors.push(`MOGRT配置: ${e.message}`);
      }
    }

    /* 経路2: SRT をキャプションとして取り込む */
    let filePath = null;
    try {
      filePath = await this.writeSrtFile(o.srtText, o.fileName || 'telop.srt');
    } catch (e) {
      errors.push(`SRT書き出し: ${e.message}`);
    }

    if (filePath) {
      try {
        const ok = await project.importFiles([filePath], true, await project.getRootItem(), false);
        if (ok) {
          return {
            method: 'srt-import',
            placed: items.length,
            filePath,
            note: `SRTをプロジェクトへ取り込みました（${items.length}件）。` +
                  'キャプショントラックへドラッグするか、キャプション→キャプションを作成 で配置してください。'
          };
        }
      } catch (e) {
        errors.push(`SRT取り込み: ${e.message}`);
      }

      /* 経路3: 書き出しだけは成功している */
      return {
        method: 'srt-file',
        placed: items.length,
        filePath,
        note: `SRTを書き出しました（${items.length}件）。ファイル→読み込み から取り込んでください。\n` +
              `保存先: ${filePath}` +
              (errors.length ? `\n\n試したが使えなかった経路:\n- ${errors.join('\n- ')}` : '')
      };
    }

    throw new Error(
      '配置に失敗しました。\n- ' + (errors.length ? errors.join('\n- ') : '原因不明') +
      '\n\n「SRTでコピー」でクリップボードへ出し、手動でファイル保存してください。'
    );
    /* --- ここまで Premiere API --- */
  },

  /**
   * SRTファイルを書き出す。保存先はユーザーが選ぶ。
   * @returns {Promise<string>} 保存したパス
   */
  async writeSrtFile(text, fileName) {
    if (!this.isPremiere()) {
      mockState.lastSrt = text;
      return `(モック)/${fileName}`;
    }

    /* --- ここから Premiere API（未検証） --- */
    const uxp = require('uxp');
    const fs = uxp.storage.localFileSystem;
    const file = await fs.getFileForSaving(fileName, { types: ['srt'] });
    if (!file) throw new Error('保存先が選択されませんでした');
    await file.write(text);
    return file.nativePath || file.name;
    /* --- ここまで Premiere API --- */
  },

  /**
   * クリップボードへコピーする。
   * UXPでは navigator.clipboard が使えるため、Premiere内でもそのまま動く。
   */
  async copyToClipboard(text) {
    /* 経路1: 標準のクリップボードAPI */
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return { ok: true, message: 'コピーしました' };
      }
    } catch (e) { /* 次の経路へ */ }

    /* 経路2: UXP のクリップボード。
       UXPでは navigator.clipboard が無い版があるため、こちらも試す。
       呼び方が版で違うので、通ったものを使う。 */
    try {
      const uxp = require('uxp');
      const cb = uxp && uxp.clipboard;
      if (cb) {
        if (typeof cb.setContent === 'function') {
          await cb.setContent({ 'text/plain': text });
          return { ok: true, message: 'コピーしました' };
        }
        if (typeof cb.writeText === 'function') {
          await cb.writeText(text);
          return { ok: true, message: 'コピーしました' };
        }
      }
    } catch (e) { /* 次の経路へ */ }

    return { ok: false, message: 'コピーできませんでした。「ファイルに保存」を使ってください' };
  },

  /**
   * テキストファイルを書き出す。保存先はユーザーが選ぶ。
   *
   * クリップボードは環境によって通らないことがある。
   * 調査結果のように長い出力は、取り出せないと意味がないので、
   * ファイルという確実な経路を必ず用意しておく。
   *
   * @returns {Promise<string>} 保存したパス
   */
  async writeTextFile(text, fileName) {
    if (!this.isPremiere()) {
      mockState.lastSrt = text;
      return `(モック)/${fileName}`;
    }

    /* --- ここから Premiere API（未検証） --- */
    const uxp = require('uxp');
    const fs = uxp.storage.localFileSystem;
    const file = await fs.getFileForSaving(fileName, { types: ['txt'] });
    if (!file) throw new Error('保存先が選択されませんでした');
    await file.write(text);
    return file.nativePath || file.name;
    /* --- ここまで Premiere API --- */
  },

  /** モック時の挿入履歴（テスト用） */
  /** モック時に配置したテロップを取り出す（検証用） */
  __mockTelops() {
    return mockState.insertedTelops.slice();
  },

  /** モック時に書き出したSRTを取り出す（検証用） */
  __mockSrt() {
    return mockState.lastSrt;
  },

  __mockInserted() {
    return mockState.inserted.slice();
  },

  /** モック状態をリセット（テスト用） */
  __setMockFrameRate(fps, dropFrame) {
    mockState.fps = fps;
    mockState.dropFrame = !!dropFrame;
  },

  __resetMock() {
    mockState.inserted = [];
    mockState.insertedTelops = [];
    mockState.lastSrt = '';
  }
};

/* ------------------------------------------------------------------ */

function formatSeconds(sec) {
  const f = Math.floor((sec % 1) * 30);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)};${p(m)};${p(s)};${p(f)}`;
}

  return adapter;
});
