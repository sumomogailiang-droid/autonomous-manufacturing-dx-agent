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

    /* オブジェクトが実際に持っているメソッド名を出す。
       APIの版差はここを見るのが一番早い。 */
    const surfaceOf = (obj) => {
      if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return [];
      const names = new Set();
      let cur = obj;
      for (let depth = 0; cur && cur !== Object.prototype && depth < 4; depth++) {
        for (const k of Object.getOwnPropertyNames(cur)) {
          if (k === 'constructor') continue;
          names.add(k);
        }
        cur = Object.getPrototypeOf(cur);
      }
      return [...names].sort();
    };

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

    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error('プロジェクトが開かれていません。');

    /* --- シーケンスを名前で探す --- */
    let seq = null;
    let seqName = '';
    const seqList = await tryCall(project, ['getSequences', 'getSequenceList'], []);
    if (seqList.ok && seqList.value && seqList.value.length) {
      for (const s of seqList.value) {
        const n = await tryCall(s, ['name', 'getName'], []);
        const nm = n.ok ? String(n.value) : '';
        if (!wantName || nm === wantName) { seq = s; seqName = nm; break; }
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
    say(`対象トラック: V${trackIndex}`);
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
    for (let i = 0; i < Math.min(items.length, maxItems); i++) {
      const it = items[i];
      const nm = await tryCall(it, ['name', 'getName'], []);
      say(`── クリップ ${i + 1}: ${nm.ok ? nm.value : '(名前不明)'}`);
      say('  TrackItem が持つもの:');
      say('    ' + surfaceOf(it).join(', '));

      const chainRes = await tryCall(it, ['getComponentChain'], []);
      if (!chainRes.ok) {
        say('  ⚠ コンポーネントチェーンを取得できませんでした。');
        say('');
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
        const cn = await tryCall(comp, ['getComponentName', 'name'], []);
        const pcRes = await tryCall(comp, ['getParamCount'], []);
        const pc = pcRes.ok ? Number(pcRes.value) : 0;
        say(`    [${c}] ${cn.ok ? cn.value : '?'}  (matchName: ${mn.ok ? mn.value : '?'})  パラメータ${pc}件`);

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
          const valRes = await tryCall(prm, ['getStartValue', 'getValue'], []);
          if (!valRes.ok) { say('          値を取得できませんでした。'); continue; }
          const val = valRes.value;
          say(`          値が持つもの: ${surfaceOf(val).join(', ')}`);
          const styleRes = await tryCall(val, ['getTextStyle'], []);
          if (styleRes.ok) {
            say(`          TextStyle が持つもの: ${surfaceOf(styleRes.value).join(', ')}`);
          }
        }
        if (params.length) say(`        パラメータ名: ${params.join(' / ')}`);
        comps.push({ index: c, matchName: mn.value || null, name: cn.value || null, params });
      }
      dumped.push({ index: i, name: nm.value || null, components: comps });
      say('');
    }

    if (items.length > maxItems) {
      say(`※ 先頭${maxItems}件のみ書き出しました（全${items.length}件）。`);
      say('');
    }

    /* --- 段落／ポイントの切り替え口があるかを機械的に探す --- */
    const KEY = /(boxText|box_text|pointText|point_text|areaText|textBox|paragraph|段落|ポイント|layerType|textType)/i;
    const hits = [];
    for (const d of dumped) {
      for (const c of d.components) {
        for (const p of c.params) if (KEY.test(p)) hits.push(`${c.name || c.matchName} → ${p}`);
      }
    }
    say('── 段落／ポイントの切り替えらしい項目');
    if (hits.length) {
      for (const h of hits) say('  ' + h);
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

    /* 経路1: シーケンス設定から取る */
    try {
      const settings = await seq.getSettings();
      if (settings) {
        const tb = Number(settings.videoFrameRate?.ticks ?? settings.videoFrameRate);
        if (isFinite(tb) && tb > 0) fps = TICKS_PER_SECOND / tb;
        dropFrame = !!settings.videoDisplayFormat &&
          String(settings.videoDisplayFormat).toLowerCase().includes('drop');
      }
    } catch (e) { /* 経路2へ */ }

    /* 経路2: timebase を直接見る */
    if (!fps) {
      try {
        const tb = Number(await seq.timebase);
        if (isFinite(tb) && tb > 0) fps = TICKS_PER_SECOND / tb;
      } catch (e) { /* 取得できず */ }
    }

    if (!fps || !isFinite(fps)) return null;
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
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return { ok: true, message: 'コピーしました' };
      }
    } catch (e) { /* 下のフォールバックへ */ }
    return { ok: false, message: 'コピーできませんでした。本文を選択してコピーしてください' };
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
