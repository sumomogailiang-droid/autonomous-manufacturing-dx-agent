/*
 * office-ambient.js
 *
 * オフィスの「働いている風景」の台本。
 *
 * === 正直さについての取り決め ===
 *
 * 移動と会話は再現（アンビエント）であり、実際のツール呼び出しではない。
 * ただし台詞の内容はすべて実在のルールに基づく。
 *   - 数値はマニュアルの数値をそのまま使う（丸めない・創作しない）
 *   - 未決定の矛盾は未決定のまま話す（会話の中でも解決させない）
 *   - 各シーンに source（出典）を付け、ログに表示する
 *
 * 見せかけと本物の区別はUI側にも表示される：
 * 「作業ボタンの実行だけが実データ照会。風景は体制ルールの再現」
 *
 * === シーンの形 ===
 *
 * from が席を立ち、to の席（または place:'meeting' でテーブル）へ歩き、
 * lines を交互に喋って戻る。
 */

(function (root, factory) {
  var api = factory();
  root.OFFICE_AMBIENT = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
   * 席で作業しているときの独り言。
   * 各役割の実際の担当作業から取る。数値はマニュアル値。
   */
  var WORK_LINES = {
    cto: [
      '監査結果を確認中。印象では判断しない',
      'ブロッカーが1件でもあれば NO-GO'
    ],
    director: [
      '品質評価レベルで採点中（-5 / 0 / 3 / 5点）',
      '演出頻度の確定は私の権限。急がせない'
    ],
    'common-manual': [
      '表記揺れ辞書122件と照合中',
      '提出前チェックの正式項目は18個',
      '1行15〜18文字。句読点は半角スペースへ'
    ],
    'project-manual': [
      '案件の上書きを確認中。順位はクライアント→案件→チャンネル→共通',
      '未確定の項目は「確認が必要」と返す'
    ],
    design: [
      '図解は使用色3色以内で作図中',
      '音量0で見ても分かるかを検品中',
      '全画面は 1,920×1,080 未満を使わない'
    ],
    telop: [
      'テロップは子音発声の1フレーム前',
      '話し言葉はそのまま。直すのは改行と表記だけ',
      'Caption Fit のずれは5フレーム以内'
    ],
    cutter: [
      '無音区間を洗い出し中。候補はフレーム番号で出す',
      'ケバは取りすぎると不自然。候補止まりにする'
    ],
    mixer: [
      'SE -20.0dB / BGM -29.0dB を検査中',
      '同じSEの連続使用がないか確認中'
    ],
    observer: [
      '手動編集の意図を記録中',
      '数値にならない判断はニュアンスメモへ'
    ],
    recruiter: [
      '人材要件を聞き取り中',
      'ドラフトはCTO承認まで正式配属しない'
    ]
  };

  /*
   * 会話シーン。台詞の根拠を source に明記する。
   */
  var SCENES = [
    {
      id: 'freq-conflict',
      from: 'common-manual', to: 'director',
      source: '共通マニュアルの矛盾（演出頻度）',
      lines: [
        ['common-manual', '演出頻度、演出ページは6秒に1回、提出前チェックは10秒に1回で割れています'],
        ['director', '未決定のまま統一しない。確定は私の権限だから、それまで両方提示で進めて'],
        ['common-manual', '了解です。勝手に解決せず、両方出します']
      ]
    },
    {
      id: 'precedence',
      from: 'project-manual', to: 'common-manual',
      source: 'ルールの優先順位',
      lines: [
        ['project-manual', '案件側に指定が出たので、共通のこの項目は上書きします'],
        ['common-manual', 'クライアント → 案件 → チャンネル → 共通、ですね。共通側は根拠だけ添えます'],
        ['project-manual', '未確定の項目は確定させず「確認が必要」で返します']
      ]
    },
    {
      id: 'frame-accuracy',
      from: 'telop', to: 'cutter', place: 'meeting',
      source: 'テロップ表示タイミング／フレーム換算',
      lines: [
        ['telop', 'テロップは子音の1フレーム前に出します。カット点、ずれていませんか'],
        ['cutter', '候補は全部フレーム番号で渡しています。秒のままだと丸めで1フレームずれるので'],
        ['telop', 'フレームずれ5箇所以上でレベル-5。ここだけは絶対に守りましょう']
      ]
    },
    {
      id: 'design-check',
      from: 'design', to: 'director',
      source: '図解・画像の制作ルール',
      lines: [
        ['design', '図解は3色以内、音量0で見ても分かるところまで作り込みました'],
        ['director', 'セーフマージンと顔被りを最終確認して。装飾はスケール150以上で'],
        ['design', '全画面用は 1,920×1,080 未満を使っていません']
      ]
    },
    {
      id: 'se-pairing',
      from: 'mixer', to: 'telop', place: 'meeting',
      source: '音量基準／SEの付け方',
      lines: [
        ['mixer', 'SEは-20.0dB、BGMは-29.0dBで置きます。数値は丸めません'],
        ['telop', 'デザインテロップの箇所、テロップ・画角変化・SEがセットになっているか見ましょう'],
        ['mixer', '同じSEの連続使用もここで潰します']
      ]
    },
    {
      id: 'observe-report',
      from: 'observer', to: 'cto',
      source: 'リアルタイム監査の役割定義',
      lines: [
        ['observer', '手動編集の観察メモがまとまりました。数値にならない判断はニュアンスメモです'],
        ['cto', '確定はしない。改善候補の印を付けて、governanceの結果とは分けて扱う'],
        ['observer', 'はい。見ていない判断は「観察できていない」と書いてあります']
      ]
    },
    {
      id: 'recruit-draft',
      from: 'recruiter', to: 'cto',
      source: '人材派遣の役割定義',
      lines: [
        ['recruiter', '制作部門から聞き取った人材要件のドラフトです。既存役割との重複は確認済みです'],
        ['cto', '承認まで正式配属はなし。席の監査（C5-17）が強制する'],
        ['recruiter', 'ドラフトのまま knowledge/drafts に置いてあります']
      ]
    },
    {
      id: 'cut-target',
      from: 'cutter', to: 'project-manual',
      source: 'カット対象の案件優先',
      lines: [
        ['cutter', 'この案件、カット対象の指定はありますか。共通基準だけでは候補を出しません'],
        ['project-manual', '案件マニュアルを照合します。記載がなければ「マニュアルに記載がありません」と返します'],
        ['cutter', '候補は全部フレーム番号で、根拠の本文つきで出します']
      ]
    },
    {
      id: 'nuance-handoff',
      from: 'common-manual', to: 'design', place: 'meeting',
      source: 'Claude Code と Codex の分担',
      lines: [
        ['common-manual', 'この場面は和やかなので、強い演出を避ける判断です。生成をお願いします'],
        ['design', '受け取りました。判断はそちら、生成はこちら。同じMCPの根拠で作ります'],
        ['common-manual', '断言している発言に「？」を付けない、もお願いします']
      ]
    },
    {
      id: 'auto-roadmap',
      from: 'observer', to: 'recruiter',
      source: 'FRAME ZERO ロードマップ',
      lines: [
        ['observer', '修正指示で同じ種類の指摘が繰り返されています。自動化の候補です'],
        ['recruiter', '既存の役割で足りるか先に確認します。足りなければ人材要件に起こします'],
        ['observer', '判断の根拠はメモに残してあります。改善候補の印つきで渡します']
      ]
    }
  ];

  return { WORK_LINES: WORK_LINES, SCENES: SCENES };
});
