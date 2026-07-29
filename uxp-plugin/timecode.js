/*
 * timecode.js
 *
 * フレーム単位の時間計算。テロップのフレームずれを防ぐための中核。
 *
 * === なぜこのファイルが必要か ===
 *
 * SRT/VTT のタイムコードは「実時間の秒」で書かれている（00:00:01,500 = 1.5秒）。
 * 一方 Premiere のタイムラインは「フレーム」でしか位置を持てない。
 *
 * 秒のまま渡すと、Premiere 側で切り捨て・四捨五入がどう行われるか分からず、
 * 1フレームずれる。マニュアルではフレームずれが5箇所以上でレベルマイナス（-5点）。
 *
 * そこでこのファイルで「秒 → フレーム番号」へ確定させてから Premiere へ渡す。
 * 一度フレーム番号にすれば、以降の計算に丸め誤差は入らない。
 *
 * === 29.97fps の扱い ===
 *
 * 29.97fps は正確には 30000/1001 = 29.970029... fps。
 * 「30fps で計算して後で直す」ことはできない。1分で約1.8フレームずれる。
 * 必ず 30000/1001 で計算する。
 *
 * ドロップフレーム（DF）は「タイムコードの表記法」であって、
 * フレームが実際に抜けるわけではない。表示のときだけ変換する。
 *
 * このファイルは依存なし。ブラウザ・UXP・Node のどれでも動く。
 */

(function (root, factory) {
  var api = factory();
  root.TimecodeUtils = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* フレームレート                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * よく使うフレームレート。
   * exact は実際の値、nominal はタイムコード表記に使う整数。
   * drop はドロップフレーム表記を使うかどうか。
   */
  const RATES = {
    '23.976': { exact: 24000 / 1001, nominal: 24, drop: false, label: '23.976fps' },
    '24':     { exact: 24,           nominal: 24, drop: false, label: '24fps' },
    '25':     { exact: 25,           nominal: 25, drop: false, label: '25fps (PAL)' },
    '29.97':  { exact: 30000 / 1001, nominal: 30, drop: true,  label: '29.97fps (NTSC DF)' },
    '29.97ND':{ exact: 30000 / 1001, nominal: 30, drop: false, label: '29.97fps (NTSC NDF)' },
    '30':     { exact: 30,           nominal: 30, drop: false, label: '30fps' },
    '50':     { exact: 50,           nominal: 50, drop: false, label: '50fps' },
    '59.94':  { exact: 60000 / 1001, nominal: 60, drop: true,  label: '59.94fps (NTSC DF)' },
    '60':     { exact: 60,           nominal: 60, drop: false, label: '60fps' }
  };

  /**
   * Premiere から取得した数値のフレームレートを、既知の設定へ寄せる。
   * 29.97000000001 のような値でも正しく判定する。
   */
  function resolveRate(fps, preferDrop) {
    if (!fps || !isFinite(fps)) return RATES['29.97'];

    let best = null;
    let bestDiff = Infinity;
    for (const key of Object.keys(RATES)) {
      const r = RATES[key];
      const diff = Math.abs(r.exact - fps);
      if (diff < bestDiff) { bestDiff = diff; best = { key, ...r }; }
    }

    /* 0.01fps 以上ずれていたら、既知でない実測値としてそのまま使う */
    if (bestDiff > 0.01) {
      const nominal = Math.round(fps);
      return { key: String(fps), exact: fps, nominal, drop: false, label: `${fps.toFixed(3)}fps` };
    }

    /* NTSC系はDF/NDFの指定に従う（指定がなければ既定のまま） */
    if (preferDrop === false && best.drop) {
      const nd = RATES[best.key + 'ND'];
      if (nd) return { key: best.key + 'ND', ...nd };
      return { ...best, drop: false };
    }
    return best;
  }

  /* ---------------------------------------------------------------- */
  /* 秒 ⇄ フレーム                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * 実時間の秒 → フレーム番号。
   *
   * 四捨五入する。切り捨てにすると、境界付近（例: 1.4999秒）で
   * 表示が1フレーム早く始まってしまう。
   *
   * @param {number} seconds
   * @param {{exact:number}} rate
   * @returns {number} 0以上の整数
   */
  function secondsToFrames(seconds, rate) {
    if (!isFinite(seconds) || seconds < 0) return 0;
    return Math.max(0, Math.round(seconds * rate.exact));
  }

  /**
   * フレーム番号 → 実時間の秒。
   * Premiere へ秒で渡す必要がある場合に使う。
   */
  function framesToSeconds(frames, rate) {
    return frames / rate.exact;
  }

  /* ---------------------------------------------------------------- */
  /* タイムコード文字列 ⇄ フレーム                                      */
  /* ---------------------------------------------------------------- */

  /**
   * 1分あたりに間引くフレーム数。
   * 29.97DF は2、59.94DF は4。
   */
  function dropPerMinute(rate) {
    if (!rate.drop) return 0;
    return rate.nominal === 60 ? 4 : 2;
  }

  /**
   * フレーム番号 → タイムコード表記（HH:MM:SS:FF / DFは HH;MM;SS;FF）。
   */
  function framesToTimecode(frames, rate) {
    const f = Math.max(0, Math.round(frames));
    const nominal = rate.nominal;

    if (!rate.drop) {
      const ff = f % nominal;
      const totalSec = Math.floor(f / nominal);
      const ss = totalSec % 60;
      const mm = Math.floor(totalSec / 60) % 60;
      const hh = Math.floor(totalSec / 3600);
      return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
    }

    /*
     * ドロップフレーム表記へ変換（SMPTE標準アルゴリズム）
     *
     * 10分ごとに 9回分の間引きが入る（毎分間引くが、10分目だけ間引かない）。
     * 29.97DF なら 10分 = 17982フレーム、1分 = 1798フレーム。
     */
    const dpm = dropPerMinute(rate);
    const framesPer10Min = nominal * 600 - dpm * 9;   // 17982
    const framesPerMin = nominal * 60 - dpm;          // 1798

    const d = Math.floor(f / framesPer10Min);
    const m = f % framesPer10Min;

    let adjusted = f + dpm * 9 * d;
    if (m >= dpm) {
      adjusted += dpm * Math.floor((m - dpm) / framesPerMin);
    }

    const ff = adjusted % nominal;
    const totalSec = Math.floor(adjusted / nominal);
    const ss = totalSec % 60;
    const mm = Math.floor(totalSec / 60) % 60;
    const hh = Math.floor(totalSec / 3600);
    return `${p(hh)};${p(mm)};${p(ss)};${p(ff)}`;
  }

  /**
   * タイムコード表記 → フレーム番号。
   * HH:MM:SS:FF / HH;MM;SS;FF / HH:MM:SS.mmm / HH:MM:SS,mmm を受け付ける。
   */
  function timecodeToFrames(tc, rate) {
    if (!tc) return 0;
    const s = String(tc).trim();

    /* ミリ秒表記（SRT/VTT） */
    const ms = /^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(s);
    if (ms) {
      const sec =
        Number(ms[1]) * 3600 + Number(ms[2]) * 60 + Number(ms[3]) +
        Number(ms[4].padEnd(3, '0')) / 1000;
      return secondsToFrames(sec, rate);
    }

    /* フレーム表記 */
    const fr = /^(\d{1,2})[:;](\d{2})[:;](\d{2})[:;](\d{2,3})$/.exec(s);
    if (!fr) return 0;

    const hh = Number(fr[1]);
    const mm = Number(fr[2]);
    const ss = Number(fr[3]);
    const ff = Number(fr[4]);
    const isDf = s.includes(';');
    const nominal = rate.nominal;

    let frames = ((hh * 60 + mm) * 60 + ss) * nominal + ff;

    if (isDf && rate.drop) {
      const dpm = dropPerMinute(rate);
      const totalMinutes = hh * 60 + mm;
      frames -= dpm * (totalMinutes - Math.floor(totalMinutes / 10));
    }
    return Math.max(0, frames);
  }

  /* ---------------------------------------------------------------- */
  /* テロップの配置計算                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * テロップ列をフレーム境界へ確定させる。
   *
   * やること:
   *  1. in/out を秒からフレームへ確定（以降 丸めは発生しない）
   *  2. 子音発声の1フレーム前に出すオフセットを適用（マニュアル準拠）
   *  3. 重なりを解消（前のテロップのoutを次のinまで詰める）
   *  4. 最短表示フレーム数を確保
   *  5. 隙間が1フレーム未満なら詰めて、チラつきを防ぐ
   *
   * @param {Array<{start:number, end:number, text:string}>} items 秒単位
   * @param {object} opts
   * @returns {{items:Array, warnings:Array}}
   */
  function snapToFrames(items, opts) {
    const o = opts || {};
    const rate = o.rate || RATES['29.97'];
    /* マニュアル: カットがない場所での切り替えは子音発声の1フレーム前が目安 */
    const leadFrames = Number.isFinite(o.leadFrames) ? o.leadFrames : 1;
    /* 短すぎるテロップは読めない。既定は最低12フレーム（約0.4秒） */
    const minFrames = Number.isFinite(o.minFrames) ? o.minFrames : 12;
    /* 隙間がこれ未満なら前のテロップを伸ばして詰める */
    const closeGapFrames = Number.isFinite(o.closeGapFrames) ? o.closeGapFrames : 2;
    /* シーケンス上の開始位置（素材の先頭が0でない場合） */
    const offsetFrames = Number.isFinite(o.offsetFrames) ? o.offsetFrames : 0;

    const warnings = [];
    const out = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];

      let inF = secondsToFrames(it.start, rate) - leadFrames + offsetFrames;
      let outF = secondsToFrames(it.end, rate) + offsetFrames;

      if (inF < 0) {
        warnings.push({ index: i + 1, kind: '先頭', detail: `${leadFrames}フレーム前倒しすると負になるため0にしました` });
        inF = 0;
      }

      if (outF <= inF) {
        outF = inF + minFrames;
        warnings.push({ index: i + 1, kind: '長さ', detail: `終了が開始以前だったため${minFrames}フレームにしました` });
      }

      out.push({
        index: out.length + 1,
        inFrame: inF,
        outFrame: outF,
        text: it.text,
        speaker: it.speaker || '',
        sourceIndex: it.sourceIndex
      });
    }

    /* 並び順を保証（タイムコードが前後している素材への保険） */
    out.sort((a, b) => a.inFrame - b.inFrame);

    /* 重なり・隙間の解消 */
    for (let i = 0; i < out.length - 1; i++) {
      const cur = out[i];
      const next = out[i + 1];

      if (cur.outFrame > next.inFrame) {
        /* 重なり: 前を次の開始まで詰める */
        const overlap = cur.outFrame - next.inFrame;
        cur.outFrame = next.inFrame;
        warnings.push({
          index: cur.index, kind: '重なり',
          detail: `次のテロップと${overlap}フレーム重なるため詰めました`
        });
      } else {
        const gap = next.inFrame - cur.outFrame;
        if (gap > 0 && gap <= closeGapFrames) {
          /* 1〜2フレームの隙間はチラつくので詰める */
          cur.outFrame = next.inFrame;
        }
      }

      /* 詰めた結果、短くなりすぎた場合 */
      if (cur.outFrame - cur.inFrame < minFrames) {
        warnings.push({
          index: cur.index, kind: '短すぎ',
          detail: `${cur.outFrame - cur.inFrame}フレーム（最低${minFrames}）。文字数を減らすか前後の間隔を空けてください`
        });
      }
    }

    /* 全項目の整合性を最終確認 */
    for (const it of out) {
      it.durationFrames = it.outFrame - it.inFrame;
      it.inTc = framesToTimecode(it.inFrame, rate);
      it.outTc = framesToTimecode(it.outFrame, rate);
      it.inSeconds = framesToSeconds(it.inFrame, rate);
      it.outSeconds = framesToSeconds(it.outFrame, rate);

      if (!Number.isInteger(it.inFrame) || !Number.isInteger(it.outFrame)) {
        warnings.push({ index: it.index, kind: '内部エラー', detail: 'フレーム番号が整数ではありません' });
      }
    }

    return { items: out, warnings, rate };
  }

  /**
   * 配置結果を検証する。フレームずれが残っていないかの最終確認。
   * @returns {{ok:boolean, problems:Array}}
   */
  function verifyPlacement(items) {
    const problems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!Number.isInteger(it.inFrame) || !Number.isInteger(it.outFrame)) {
        problems.push({ index: it.index, detail: 'フレーム番号が整数ではありません' });
      }
      if (it.outFrame <= it.inFrame) {
        problems.push({ index: it.index, detail: '長さが0以下です' });
      }
      if (i > 0 && items[i - 1].outFrame > it.inFrame) {
        problems.push({ index: it.index, detail: `前のテロップと重なっています（${items[i - 1].outFrame} > ${it.inFrame}）` });
      }
    }
    return { ok: problems.length === 0, problems };
  }

  /* ---------------------------------------------------------------- */
  /* ヘルパー                                                          */
  /* ---------------------------------------------------------------- */

  function p(n, w) {
    return String(n).padStart(w || 2, '0');
  }

  /** SRT用のミリ秒表記へ（フレーム番号から生成するのでずれない） */
  function framesToSrtTime(frames, rate) {
    const sec = framesToSeconds(frames, rate);
    const h = Math.floor(sec / 3600);
    const m = Math.floor(sec / 60) % 60;
    const s = Math.floor(sec) % 60;
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    /* 四捨五入で1000msになった場合の繰り上げ */
    if (ms === 1000) return `${p(h)}:${p(m)}:${p(s + 1)},000`;
    return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
  }

  return {
    RATES,
    resolveRate,
    secondsToFrames,
    framesToSeconds,
    framesToTimecode,
    timecodeToFrames,
    framesToSrtTime,
    snapToFrames,
    verifyPlacement
  };
});
