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
  inserted: []
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
  __mockInserted() {
    return mockState.inserted.slice();
  },

  /** モック状態をリセット（テスト用） */
  __resetMock() {
    mockState.inserted = [];
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
