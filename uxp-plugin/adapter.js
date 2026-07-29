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
        inFrame: i.inFrame, outFrame: i.outFrame, text: i.text
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
          const mgt = await seq.importMGT(o.mogrtPath, t, trackIndex, 0);
          if (mgt) placed++;
        }
        if (placed > 0) {
          return {
            method: 'mogrt',
            placed,
            note: `MOGRTテンプレートを V${trackIndex + 1} へ ${placed}件 配置しました。テキストの流し込みは手動で行ってください。`
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
