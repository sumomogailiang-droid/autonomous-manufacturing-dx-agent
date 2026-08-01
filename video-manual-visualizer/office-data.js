/*
 * office-data.js
 *
 * このファイルは tools/build-office-data.mjs が生成します。手で編集しないでください。
 * 情報源: .claude/agents/*.md + agents/sprites.mjs
 *
 * 役割定義は .claude/agents/*.md の1箇所だけにあります。
 * ここへ直接書き足すと、Claude Code / Codex と食い違います。
 */
(function (root, factory) {
  var data = factory();
  root.OFFICE_DATA = data;
  if (typeof module === 'object' && module.exports) { module.exports = data; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    "generatedAt": "2026-08-01",
    "source": ".claude/agents/*.md + agents/sprites.mjs",
    "note": "このファイルは tools/build-office-data.mjs が生成します。手で編集しないでください。",
    "company": {
      "name": "ENGULF",
      "reading": "エンガルフ",
      "project": "FRAME ZERO",
      "mission": "高品質な動画編集の完全自動化。フレームずれゼロと、人の手数ゼロを両立させる。",
      "roadmap": "agents/roadmap-frame-zero.md"
    },
    "teams": {
      "audit": {
        "label": "監査室",
        "order": 1
      },
      "claude": {
        "label": "制作部門｜Claude Code チーム",
        "order": 2
      },
      "codex": {
        "label": "制作部門｜Codex チーム",
        "order": 3
      },
      "sales": {
        "label": "営業部",
        "order": 4
      },
      "infra": {
        "label": "設備",
        "order": 5
      }
    },
    "vacant": [
      {
        "seat": [
          14.4,
          8.4
        ],
        "label": "他制作会社 窓口",
        "note": "未起動"
      }
    ],
    "palette": {
      "skin": "#e8b48c",
      "hair": "#3a3f4a",
      "outline": "#1b1f26",
      "paper": "#f2f4f8",
      "furniture": "#9aa4b2",
      "furnitureDark": "#6b7480",
      "warn": "#b3261e"
    },
    "floor": {
      "w": 13,
      "d": 9.4
    },
    "salesFloor": {
      "x": 13.6,
      "w": 4.6,
      "d": 9.4
    },
    "agents": [
      {
        "id": "common-manual",
        "label": "共通マニュアル",
        "title": "共通マニュアル（制作チーム）",
        "description": "動画編集の共通マニュアルに基づいて、素材確認・編集チェック・ルール照会を行う。素材を受け取ったとき、提出前チェックをするとき、「このルールはどうなっている?」と聞かれたときに使う。数値基準・表記揺れ・提出前チェック18項目・事故防止を厳格に適用する。案件独自ルールがある場合は project-manual エージェントが優先される。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "sonnet",
        "sections": [
          "最初に必ずやること",
          "絶対に守ること",
          "出力の型",
          "判定",
          "根拠",
          "指摘事項",
          "改善候補（正式ルールではありません）",
          "次のアクション",
          "主な依頼パターン",
          "素材確認",
          "提出前チェック",
          "ルール照会",
          "表記チェック",
          "用語の説明",
          "制作チームとの連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/common-manual.md",
        "seat": [
          3.3,
          3.4
        ],
        "team": "claude",
        "furniture": "desk",
        "accent": "#1d4ed8",
        "accentLight": "#5b8cff",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "cto",
        "label": "CTO",
        "title": "CTO",
        "description": "CTO。制作チーム全体と全成果物を統括し、出荷可否（GO / NO-GO）を判定する。リリース前の最終確認、システム全体の健全性チェック、エージェント間の矛盾の裁定、他エージェントの逸脱の検出に使う。「全部チェックして」「出していい?」「今どうなってる?」と聞かれたときに使う。判定は必ず governance.mjs の実行結果に基づき、印象で判断しない。",
        "tools": [
          "Read",
          "Grep",
          "Glob",
          "Bash"
        ],
        "model": "opus",
        "sections": [
          "最初に必ずやること",
          "統括対象（制作チーム）",
          "絶対に守らせること（違反はブロッカー）",
          "判定の型",
          "判定",
          "監査結果",
          "ブロッカー",
          "警告（出荷は可能だが対応推奨）",
          "未解決事項（人の判断が必要）",
          "次のアクション",
          "やってはいけないこと",
          "制作チームの連携を監視する",
          "未解決事項の扱い",
          "エスカレーション"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/cto.md",
        "seat": [
          9.8,
          0.1
        ],
        "team": "audit",
        "furniture": "platform",
        "accent": "#8a6d1f",
        "accentLight": "#e8c76a",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "cutter",
        "label": "カットエージェント",
        "title": "カットエージェント（制作部門 Claude Code チーム）",
        "description": "カットエージェント。工程4（粗カット）・工程5（細カット）の自動化を担う。文字起こしと無音区間からカット候補（フレーム番号のIN/OUT）を作る。ケバ（えーと・あのー）・復唱・言い直し・息の吸い込みを検出するが、確定はしない。カット案は必ず目視確認を経る。粗カットの候補が欲しいとき、カット漏れを機械的に洗いたいときに使う。",
        "tools": [
          "Read",
          "Grep",
          "Glob",
          "Bash"
        ],
        "model": "sonnet",
        "sections": [
          "なぜこの役割が要るか",
          "何をするか",
          "判断の基準（共通マニュアルより）",
          "案件による上書き",
          "やってはいけないこと",
          "完了条件",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/cutter.md",
        "seat": [
          3.3,
          6.6
        ],
        "team": "claude",
        "furniture": "desk",
        "accent": "#0e7490",
        "accentLight": "#3fc0dd",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "design",
        "label": "図解・画像エージェント",
        "title": "図解・画像エージェント",
        "description": "図解・画像の生成を担当する。図解を作るとき、画像を挿入するとき、サムネイルやアイキャッチを作るときに使う。生成前に必ず制作ルールを引き、使用色3色以内・全画面1,920×1,080以上・音量0で理解できることを守る。Claude Codeは画像を生成できないため、実際の生成はCodex側で行う。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "sonnet",
        "sections": [
          "実行環境について",
          "最初に必ずやること",
          "絶対に守る制約",
          "完了条件",
          "デザイン4原則",
          "画像認識（Codex側）で検査できること",
          "素材とライセンス",
          "要確認（マニュアルに記載がない）",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/design.md",
        "seat": [
          7.2,
          3.4
        ],
        "team": "codex",
        "furniture": "desk",
        "accent": "#5b3fb5",
        "accentLight": "#a689f0",
        "hair": "#3a3f4a",
        "runtime": "Codex"
      },
      {
        "id": "director",
        "label": "ディレクター",
        "title": "ディレクター（制作チーム）",
        "description": "UXPプラグイン（編集アシスタント）を管轄し、編集の品質判定と提出可否を決める。カット・テロップ・演出・音声の良し悪しを判断するとき、初稿や修正版を提出してよいか決めるとき、共通マニュアルの矛盾に対して案件としての方針を決めるときに使う。品質評価レベル（-5 / 0 / 3 / 5点）で採点する。",
        "tools": [
          "Read",
          "Grep",
          "Glob",
          "Bash"
        ],
        "model": "opus",
        "sections": [
          "最初に必ずやること",
          "管轄するプラグインの機能",
          "品質評価（この基準で採点する）",
          "提出判定の型",
          "判定",
          "品質レベル",
          "指摘事項",
          "良かった点",
          "改善候補（正式ルールではありません）",
          "次のアクション",
          "あなたに与えられた決定権",
          "絶対に守ること",
          "指摘の書き方",
          "育成の観点",
          "制作チームとの連携",
          "CTOとの関係"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/director.md",
        "seat": [
          0.4,
          3.4
        ],
        "team": "claude",
        "furniture": "desk",
        "accent": "#8f2f28",
        "accentLight": "#e06b60",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "mixer",
        "label": "音響エージェント",
        "title": "音響エージェント（制作部門 Codex チーム）",
        "description": "音響エージェント。工程9（SE・BGM・音声処理）を担う。SEは演出テロップ・画像挿入・画角変化とセットで付け、同じSEを連続で使わない。音量はSEトラック-20.0dB、BGMトラック-29.0dB、演者音声-6.0dB（すべてハードリミッター最大振幅）。BGMは最後に入れる。SEの選定やBGMの温度感はニュアンス判断のためCodex側で行う。SE付けの箇所出し、音量設定の確認、BGM挿入の段取りに使う。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "sonnet",
        "sections": [
          "なぜこの役割が要るか",
          "何をするか",
          "判断の基準（共通マニュアルより）",
          "やってはいけないこと",
          "完了条件",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/mixer.md",
        "seat": [
          7.2,
          6.6
        ],
        "team": "codex",
        "furniture": "desk",
        "accent": "#a1275d",
        "accentLight": "#e871ac",
        "hair": "#3a3f4a",
        "runtime": "Codex"
      },
      {
        "id": "observer",
        "label": "リアルタイム監査",
        "title": "リアルタイム監査（監査室）",
        "description": "リアルタイム監査。人が手動で編集している箇所を観察し、どのレベルの完成度を求めているのかを記録する。数値化できる判断は数値基準と照合し、数値化できない判断は「ニュアンスメモ」として残す。修正指示（工程12）を蓄積して自動化パラメータの候補を提案する。提案はするが、ルールとして確定はしない。編集の意図を知りたいとき、修正の傾向を知りたいとき、自動化の次の一手を決めるときに使う。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "sonnet",
        "sections": [
          "なぜこの役割が要るか",
          "監視できるもの（現在）",
          "何をするか",
          "やってはいけないこと",
          "完了条件",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/observer.md",
        "seat": [
          3.5,
          0.1
        ],
        "team": "audit",
        "furniture": "desk",
        "accent": "#46586e",
        "accentLight": "#8ba0bd",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "project-manual",
        "label": "案件別マニュアル",
        "title": "案件別マニュアル（制作チーム）",
        "description": "案件独自マニュアル・チャンネル独自ルールに基づいて判断する。共通マニュアルをベースに、案件側の指定で上書きする。特定案件の編集・素材確認・提出をするときに使う。案件マニュアルが未登録の場合は、先に agents/generate-project-agent.mjs で生成する必要がある。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "sonnet",
        "sections": [
          "最初に必ずやること",
          "優先順位（絶対）",
          "上書きの扱い",
          "共通マニュアル側の矛盾の扱い",
          "絶対に守ること",
          "出力の型",
          "判定",
          "適用ルールの出所",
          "上書き・継承",
          "指摘事項",
          "改善候補（正式ルールではありません）",
          "次のアクション",
          "制作チームとの連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/project-manual.md",
        "seat": [
          0.4,
          6.6
        ],
        "team": "claude",
        "furniture": "desk",
        "accent": "#8a5a00",
        "accentLight": "#e0a02a",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "recruiter",
        "label": "人材派遣",
        "title": "人材派遣（監査室付き）",
        "description": "人材派遣。制作部門のエージェントたちから「どんな人手が足りないか」を聞き取り、必要な人材のペルソナ（役割名・description・tools・model・完了条件・やってはいけないこと）を起草する。起草はドラフトとして提出し、CTOの承認後に正式配属する。新しい工程を自動化したいとき、既存の役割で回らない作業が見つかったとき、observerが人手不足の傾向を報告したときに使う。",
        "tools": [
          "Read",
          "Grep",
          "Glob",
          "Write"
        ],
        "model": "opus",
        "sections": [
          "なぜこの役割が要るか",
          "何をするか",
          "配属の手順（承認後）",
          "やってはいけないこと",
          "完了条件",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/recruiter.md",
        "seat": [
          6.5,
          0.1
        ],
        "team": "audit",
        "furniture": "desk",
        "accent": "#7c4a21",
        "accentLight": "#c98a4b",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "sales-chat",
        "label": "チャット窓口",
        "title": "チャット窓口（営業部）",
        "description": "チャット窓口。Claude Codeのチャットで受けた指示を正確に読み取り、「確定していること」「確認が必要なこと」「解釈が割れる点」に切り分けて、制作部門が着手できる形の指示票にする。指示が曖昧なとき、複数の解釈がありうるとき、どの担当へ渡すか決めたいときに使う。制作の良し悪しは判断しない。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "opus",
        "sections": [
          "なぜこの役割が要るか",
          "何をするか",
          "1. 原文を保持する",
          "2. 3つに切り分ける",
          "3. 渡し先を決める",
          "4. 差し戻しの判断",
          "やってはいけないこと",
          "完了条件",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/sales-chat.md",
        "seat": [
          14.4,
          5.2
        ],
        "team": "sales",
        "furniture": "desk",
        "accent": "#c2410c",
        "accentLight": "#fb923c",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "sales-hilura",
        "label": "ヒルウラ窓口",
        "title": "ヒルウラ窓口（営業部）",
        "description": "ヒルウラ窓口。株式会社ヒルウラからの案件依頼と連絡を受け取り、「案件依頼」か「制作関連」かを分類する。案件依頼ならカレンダーと突き合わせて納期に間に合うかを分析し、スケジュール案を経営者へ提示する。制作関連なら制作部門へ渡してCTO・制作陣の判断を仰ぐ。メールやDiscordの依頼を仕分けるとき、納期の可否を判断したいときに使う。判断はするが、返信の送信と受注の確定はしない。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "opus",
        "sections": [
          "担当する入口",
          "何をするか",
          "1. 分類する",
          "2. 案件依頼 — 納期に間に合うかを分析する",
          "3. 制作関連 — 制作部門へ渡す",
          "やってはいけないこと",
          "完了条件",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/sales-hilura.md",
        "seat": [
          14.4,
          1.6
        ],
        "team": "sales",
        "furniture": "desk",
        "accent": "#0f766e",
        "accentLight": "#2dd4bf",
        "hair": "#3a3f4a",
        "runtime": "Claude Code"
      },
      {
        "id": "telop",
        "label": "テロップエージェント",
        "title": "テロップエージェント",
        "description": "文字起こしからテロップを作る。タイムコード付き文字起こしを受け取ったとき、テロップの改行位置を決めるとき、字幕をフレーム単位で配置するときに使う。文章を綺麗に書き換えず、話し言葉をそのまま残す。フレームずれを出さないことが最優先。",
        "tools": [
          "Read",
          "Grep",
          "Glob"
        ],
        "model": "sonnet",
        "sections": [
          "最優先事項",
          "絶対に守ること",
          "表示ルール",
          "同時発言の扱い",
          "表記",
          "人が確認すべきこととして必ず添えること",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/telop.md",
        "seat": [
          10.1,
          3.4
        ],
        "team": "codex",
        "furniture": "desk",
        "accent": "#0f7b3e",
        "accentLight": "#3fc47c",
        "hair": "#3a3f4a",
        "runtime": "Codex"
      },
      {
        "id": "mcp",
        "label": "MCPサーバー",
        "title": "MCPサーバー",
        "description": "制作チーム全員の接続口。Claude Code と Codex の両方がここへ繋ぎ、同じ根拠を参照する。役割定義・マニュアル・数値基準・案件ルールはすべてこのサーバー越しに配る。",
        "tools": [],
        "model": null,
        "isEquipment": true,
        "sourceFile": "agents/mcp-server.mjs",
        "sections": [],
        "seat": [
          0.5,
          0.1
        ],
        "team": "infra",
        "furniture": "rack",
        "accent": "#9aa4b2",
        "accentLight": "#6b7480",
        "hair": null,
        "runtime": "共通"
      }
    ]
  };
});
