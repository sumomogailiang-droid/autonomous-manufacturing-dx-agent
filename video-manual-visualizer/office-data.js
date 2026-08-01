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
      "w": 9,
      "d": 8
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
          3.2
        ],
        "team": "production",
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
          6.2,
          0.2
        ],
        "team": "oversight",
        "furniture": "platform",
        "accent": "#8a6d1f",
        "accentLight": "#e8c76a",
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
          "素材とライセンス",
          "要確認（マニュアルに記載がない）",
          "連携"
        ],
        "isEquipment": false,
        "sourceFile": ".claude/agents/design.md",
        "seat": [
          0.4,
          6.2
        ],
        "team": "production",
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
          3.2
        ],
        "team": "production",
        "furniture": "desk",
        "accent": "#8f2f28",
        "accentLight": "#e06b60",
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
          6.2,
          3.2
        ],
        "team": "production",
        "furniture": "desk",
        "accent": "#8a5a00",
        "accentLight": "#e0a02a",
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
          3.3,
          6.2
        ],
        "team": "production",
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
          6.2,
          6.2
        ],
        "team": "production",
        "furniture": "rack",
        "accent": "#9aa4b2",
        "accentLight": "#6b7480",
        "hair": null,
        "runtime": "共通"
      }
    ]
  };
});
