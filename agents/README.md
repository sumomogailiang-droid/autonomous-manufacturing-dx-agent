# マニュアルエージェント

共通マニュアルと案件別マニュアルを、Claude Code・Codex の両方から同じ根拠で参照するための仕組みです。

## 構成

```
video-manual-visualizer/manual-data.js   ★ 唯一の情報源
                 │
                 ├─ build-knowledge.mjs ──→ knowledge/common-manual.md
                 │                            （共通マニュアル知識ベース 47KB）
                 │
                 └─ mcp-server.mjs ─────→ MCPサーバー（12ツール）
                                            │
                    案件マニュアル ──────────┤
                    generate-project-agent   │
                    → knowledge/projects/    │
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                        Claude Code                       Codex
                     ルール判定・QA・実装           図解/画像生成・ニュアンス表現
```

データは `manual-data.js` の一箇所だけで管理します。知識ベースは生成物なので手で編集しないでください。

## 役割分担

| | 担当 | 使う主なツール |
|---|---|---|
| **Claude Code** | ルール判定、素材確認、提出前チェック、構造化、QA、コード実装 | `check_notation` `get_checklist` `get_accident_map` `get_template` |
| **Codex** | 図解・画像生成、テロップのニュアンス表現、話者ごとの温度感 | `get_design_rules` `format_telop` |
| **共通** | 根拠の参照 | `manual_search` `get_process` `get_numeric_standards` `list_conflicts` |

Claude Codeは画像を作れませんが、「この場面は和やかだから強い演出を避ける」「この発言は断言だから『？』を付けない」
といったニュアンスの判断はできます。その判断を指示としてCodexへ渡し、Codexが生成する分担を想定しています。

## セットアップ

```bash
# 1. 知識ベースを生成（manual-data.js を更新したら必ず再実行）
node agents/build-knowledge.mjs

# 2. 動作確認
node agents/test-mcp.mjs
```

### Claude Code から接続

リポジトリ直下の `.mcp.json` が自動で読まれます。**設定不要です。**

サブエージェントも使えます。

| エージェント | 用途 |
|---|---|
| `common-manual` | 共通マニュアルに基づく素材確認・提出前チェック・ルール照会 |
| `project-manual` | 案件独自ルールを共通マニュアルへ上書きして判断 |

### Codex CLI から接続

`~/.codex/config.toml` へ追記します（`agents/codex-config.toml` の内容そのまま）。

```toml
[mcp_servers.video-manual]
command = "node"
args = ["agents/mcp-server.mjs"]
```

リポジトリ外から起動する場合は、`args` を絶対パスにしてください。

Codexはリポジトリ直下の `AGENTS.md` を読みます。ルールはそちらに集約しています。

### その他のMCP対応クライアント

stdio / JSON-RPC 2.0 の標準的なMCPサーバーです。外部依存はありません（Node.js 18以降）。

```bash
node agents/mcp-server.mjs
```

## MCPツール一覧（12個）

| ツール | 内容 |
|---|---|
| `manual_search` | 共通＋案件マニュアルの全文検索。**まずこれを使う** |
| `get_process` | 制作工程13工程の詳細（何をするか/なぜ/失敗/完了条件/関連） |
| `get_numeric_standards` | 数値基準36件（音量・テロップ・演出画角・画像・切り抜き・期限費用） |
| `check_notation` | 表記揺れ122件との照合。句読点・全角記号・1行文字数も判定 |
| `get_checklist` | 提出前チェック18項目 / 改善候補12項目 / 切り抜き12項目 |
| `get_template` | 連絡テンプレート18件 |
| `list_conflicts` | 矛盾5件・目次問題6件・欠損リンク5件・要確認3件 |
| `get_accident_map` | 事故防止16件（原因→事故→防止策→最終確認） |
| `get_design_rules` | 図解・画像・テロップの制作ルール。**画像生成前に必須** |
| `format_telop` | 文字起こし → テロップ行へ整形（文章は書き換えない） |
| `list_projects` | 登録済み案件一覧と未確定件数 |
| `get_project_rules` | 案件マニュアル取得 |

## 案件マニュアルの登録

```bash
node agents/generate-project-agent.mjs <案件マニュアルのパス> <案件ID> "<案件名>"
```

案件IDは英小文字・数字・ハイフンのみです。

生成されるファイルには、共通マニュアルと異なる数値の**上書き候補**が機械抽出されます。
ただし**自動で確定させません**。読み違えたまま案件ルールが確定するのを防ぐためです。

```
| 項目 | 共通マニュアルの値 | 案件マニュアル内で検出した表現 | 採用値 |
| 演出頻度 | 6秒に1回 / 10秒に1回（未決定） | 8秒に1回 | 確認が必要 |
| テロップ1行の文字数 | 15〜18文字 | 1行14〜16文字 | 確認が必要 |
```

生成後に人が原文を見て確定させてください。未確定のままだとエージェントは「確認が必要」と回答します。

**案件マニュアルはGitへコミットされません**（`.gitignore` で除外）。クライアント情報を含むためです。

## 設計上の制約

| 制約 | 理由 |
|---|---|
| 知識ベースにURLを一切含めない | 原本で5件のURLが欠損しており、推測での補完を禁止しているため。生成時に混入チェックあり |
| 改善候補を別配列で保持 | 正式18項目へ混ざるのを防ぐ。`get_checklist` でも種別を分けて返す |
| 矛盾を解決しない | 演出頻度と提出方法は未決定。両方を提示して確認を促す |
| 案件の数値を自動確定しない | 誤検出のまま運用に入るのを防ぐ |
| 文字起こしを書き換えない | 話し言葉をそのまま残す指示があるため。`format_telop` は改行位置と表記のみ整える |

## 検証

```bash
node video-manual-visualizer/validate-data.js   # データ検証 181項目
node agents/test-mcp.mjs                        # MCP疎通テスト 53項目

# 詳細表示
VERBOSE=1 node agents/test-mcp.mjs
```

`build-knowledge.mjs` は生成時に知識ベースへURLが混入していないことを自動チェックし、
混入していれば非ゼロ終了します。
