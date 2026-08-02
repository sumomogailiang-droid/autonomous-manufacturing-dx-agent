# AGENTS.md

このリポジトリで動画編集の作業をするときのルールです。
Codex CLI・Claude Code・その他のエージェントは、まずこれを読んでください。

## このリポジトリは何か

動画編集の共通マニュアルを機械可読にし、複数のAIエージェントから同じ根拠を参照できるようにしたものです。

```
video-manual-visualizer/   マニュアルの図解ビジュアライザー（人が読む用）
  manual-data.js           ★ 唯一の情報源。すべてのデータはここが起点
  office.js                エージェントのオフィスを等角投影で描く
  office-panel.js          稼働状況・吹き出し・作業ログの組み立て
  office-data.js           役割定義の写し（自動生成。手で編集しない）
agents/
  build-knowledge.mjs      manual-data.js → 知識ベースMarkdownを生成
  knowledge/
    common-manual.md       共通マニュアル知識ベース（自動生成。手で編集しない）
    projects/<案件ID>.md   案件別マニュアル
  generate-project-agent.mjs  案件マニュアルを取り込んで案件別知識ベースを生成
  mcp-server.mjs           ★ MCPサーバー。Codex / Claude Code 共通の接続口
```

## 体制 — ENGULF（エンガルフ）

会社名は **ENGULF**。プロジェクト名は **FRAME ZERO**
（高品質な動画編集の完全自動化。フレームずれゼロと、人の手数ゼロを両立させる）。
ロードマップは `agents/roadmap-frame-zero.md`。

```
                    監査室
   CTO（GO/NO-GO裁定） リアルタイム監査  人材派遣
              │
   ┌──────────┴───────────────────────────┐
   │        営業部（別フロア）              │
   │  ヒルウラ窓口 ・ チャット窓口           │
   │  （他制作会社 窓口は未起動）            │
   └──────────┬───────────────────────────┘
              │ 案件依頼→経営者 / 制作関連→制作部門
   ┌──────────┴───────────────────────────┐
   │              制作部門                 │
   ├──────────────────┬────────────────────┤
   │ Claude Code チーム │   Codex チーム     │
   │ 判定・検証・構造化  │ 生成・ニュアンス表現│
   ├──────────────────┼────────────────────┤
   │ ディレクター       │ 図解・画像          │
   │ 共通マニュアル     │ テロップ            │
   │ 案件別マニュアル   │ 音響（SE・BGM）     │
   │ カット            │                    │
   └──────────────────┴────────────────────┘
              │
        MCPサーバー（全員の接続口）
```

**監査室** は制作部門の外から全体を見ます。CTOが出荷可否（GO / NO-GO）を判定し、
判断が割れたときの裁定も行います。ただし演出頻度と提出方法の確定はディレクターの権限です。
リアルタイム監査（observer）は人の編集を観察して完成度の基準を記録し、
人材派遣（recruiter）は足りない役割を設計します（配属はCTO承認後のみ）。

**営業部** は制作部門の隣の別フロアです。外からの依頼を受け、案件依頼なら納期を分析して
経営者へスケジュール案を出し、制作関連なら制作部門へ渡します。**受注は確定しません**（経営者の判断）。
受付の流れは `agents/sales-intake-pipeline.md` にあります。

**制作部門** は2チーム制です。Claude Code チームが判定・検証を、Codex チームが生成・
ニュアンス表現を担います。担当外の判断は抱え込まず、担当メンバーへ渡してください。
渡すときは「何を・なぜ・どの根拠で」を明示し、受け取った側はMCPツールで裏を取ります。

### 役割は Claude Code と Codex で共通

役割定義は `.claude/agents/*.md` の**1箇所だけ**にあります。
Claude Code はサブエージェントとして直接読み、**Codex は MCP 経由で同じ定義を受け取ります**。
定義のコピーを作らないでください。片方だけが古くなり、判断が食い違います。

| 役割 | 担当 | 所属 | 主な実行環境 |
|---|---|---|---|
| `cto` | 全体監査・GO/NO-GO判定・裁定 | 監査室 | Claude Code |
| `observer` | リアルタイム監査。編集の意図とニュアンスの記録 | 監査室 | Claude Code |
| `recruiter` | 人材設計。新役割のペルソナ起草（CTO承認制） | 監査室 | Claude Code |
| `director` | 編集品質の採点・提出可否・矛盾の方針決定 | 制作・Claude Code | Claude Code |
| `common-manual` | 共通ルールの判定・素材確認・提出前チェック | 制作・Claude Code | Claude Code |
| `project-manual` | 案件ルールの上書き判断 | 制作・Claude Code | Claude Code |
| `cutter` | カット候補の検出（フレーム番号・確定はしない） | 制作・Claude Code | Claude Code |
| `design` | 図解・画像の生成 | 制作・Codex | **Codex** |
| `telop` | 文字起こし→テロップ | 制作・Codex | **Codex** |
| `mixer` | SE・BGM・音声処理（dB規定の検査と選定提案） | 制作・Codex | **Codex** |
| `sales-hilura` | ヒルウラ窓口。依頼の分類・納期分析・スケジュール案 | 営業部 | Claude Code |
| `sales-chat` | チャット窓口。指示を確定／要確認／解釈が割れる点へ切り分け | 営業部 | Claude Code |

### Codex から役割を使う

Codex にはサブエージェント機能がないため、MCPツールで役割を読み込みます。

```
1. list_agents          … どの役割があるか見る
2. get_agent_role(name) … 定義を読み込み、その役割として振る舞う
3. handoff(to, what, why, evidence) … 担当外を他の役割へ渡す
```

例: Codex で図解を作るとき

```
get_agent_role("design")    → 制約と完了条件を読み込む
get_design_rules()          → 数値の制約を引く
（図解を生成）
handoff("director", ...)    → 演出頻度の判断が要るなら渡す
```

**担当外の判断を自分で決めないでください。** `handoff` は根拠が空だと警告を出します。

## 実行環境の役割分担

| | 担当 | 理由 |
|---|---|---|
| **Claude Code** | ルール判定・素材確認・提出前チェック・構造化・QA・コード実装 | 判定と検証に強い。画像生成はできない |
| **Codex** | 図解・画像生成、テロップのニュアンス表現、話者ごとの温度感の反映 | 画像生成ができる |

**どちらも同じMCPサーバー `video-manual` に接続し、同じ根拠を使います。**
片方だけが知っているルールを作らないでください。

Claude Codeは画像を作れませんが、「この場面は和やかだから強い演出を避ける」「この発言は断言だから『？』を付けない」といった
ニュアンスの判断と指示出しはできます。その判断をCodexへ渡して生成させる、という分担を想定しています。

## 絶対に守ること

作業前に必ず `video-manual` MCPサーバーのツールで根拠を引いてください。記憶や一般論で答えないこと。

1. **知識ベースにないことを推測で補わない。**
   記載がなければ「マニュアルに記載がありません」と明示し、ディレクターへの確認を促す。

2. **URLを推測しない。**
   原本で欠損しているURLが5件あります（MTSファイル解説 / FrameDetector解説 / マルチカメラ応用 / 限定公開設定 / Add Marker）。
   それらしいURLを生成してはいけません。

3. **数字・単位・条件を変更しない。**
   `-6.0dB` を「約-6dB」に丸めない。`15〜18文字` を「16文字」にしない。

4. **改善候補を正式ルールとして出さない。**
   提出前チェックの正式項目は18個です。モザイク確認・ライセンス証跡・SSD暗号化は正式項目ではありません。
   指摘するときは必ず `[改善候補]` と明示します。

5. **矛盾を勝手に解決しない。** 次の2つは未決定です。両方を提示して確認を促します。
   - 演出頻度: 6秒に1回（演出・よくあるミス）vs 10秒に1回（提出前チェック）
   - 提出方法: Frame.io統一 vs YouTube限定公開（4箇所で衝突）

6. **文字起こしの文章を綺麗に書き換えない。**
   話し言葉はそのまま残します（「回してます」を「回しています」に直さない）。
   整えるのは改行位置と表記だけです。エンタメ・口語チャンネルでは特に直しすぎないこと。

7. **案件独自ルールが共通マニュアルより優先。**
   ```
   1. クライアント指定 → 2. 案件マニュアル → 3. チャンネル独自ルール → 4. 共通マニュアル → 5. 改善候補（適用しない）
   ```

8. **トンマナを勝手に変えない。**
   チャンネルテンプレートのフォント・色・配置を変更してはいけません。

## MCPツール

| ツール | 用途 | 主に使う側 |
|---|---|---|
| `manual_search` | マニュアル全文検索。まずこれ | 両方 |
| `get_process` | 制作工程13工程の詳細 | 両方 |
| `get_numeric_standards` | 数値基準36件 | 両方 |
| `check_notation` | 表記揺れ122件との照合・校正 | Claude Code |
| `get_checklist` | 提出前チェック18項目 / 改善候補 / 切り抜き | Claude Code |
| `get_template` | 連絡テンプレート18件 | Claude Code |
| `list_conflicts` | 矛盾・欠損・要確認 | 両方 |
| `get_accident_map` | 事故防止16件 | Claude Code |
| `get_design_rules` | 図解・画像・テロップの制作ルール | **Codex（生成前に必須）** |
| `format_telop` | 文字起こし → テロップ行へ整形 | **Codex** |
| `governance_audit` | 全体を監査してGO/NO-GOを返す | **CTO** |
| `list_agents` | 制作チームの役割一覧 | **Codex（役割の選択）** |
| `get_agent_role` | 役割定義を読み込む | **Codex（サブエージェント代替）** |
| `handoff` | 担当外の判断を他の役割へ渡す | 両方 |
| `list_projects` | 登録済み案件一覧 | 両方 |
| `get_project_rules` | 案件マニュアル取得 | 両方 |

## Codexが画像・図解を作るとき

**`get_design_rules` を必ず先に呼んでください。** 守る制約:

- 図解の使用色は3色以内
- 全画面表示に使う画像は 1,920×1,080 px以上
- テロップだけを並べない（画像・イラストを使う）
- 演者の顔へ被せない / セーフマージンを超えない
- 完了条件: **音量を0にして図解だけを見ても内容が理解できること**
- デザイン4原則（整列・反復・近接・対比）

> AI高画質化・AI生成については、画像内容が変化する可能性や顧客素材をAIへ入力してよいかのルールが
> 現行マニュアルにありません。**要確認**として扱い、使用前にディレクターへ確認してください。

## セットアップ

```bash
# 知識ベースとプラグインデータを生成（manual-data.js を更新したら必ず再実行）
node agents/build-knowledge.mjs
node tools/build-plugin-data.mjs

# オフィス画面のデータを生成（.claude/agents/*.md を編集したら必ず再実行）
node tools/build-office-data.mjs

# 出荷判定のスナップショットを生成（画面へGO/NO-GOを出す唯一の経路）
node tools/build-audit-snapshot.mjs

# 他のAIへ渡す引き継ぎ資料
node tools/build-brief.mjs --public

# 検証
node video-manual-visualizer/validate-data.js   # データ検証
node agents/test-mcp.mjs                        # MCP疎通テスト
node agents/governance.mjs                      # CTOによる全体監査（GO / NO-GO）

# 体制の確認・操作
node agents/console.mjs                         # 対話コンソール（質問・指示ができる）
node agents/dashboard.mjs --audit               # ドット絵で構成と監査結果を表示

# ブラウザでオフィスを見る
# video-manual-visualizer/index.html を開き、タブ「⑬ オフィス」

# 配布用に1ファイルへまとめる（外部通信なし。開けばそのまま動く）
node tools/build-webapp.mjs                     # → dist/index.html
node tools/build-webapp.mjs --fragment out.html # 外枠を自前で持つホスティング向け
```

**リリース前は必ず `node agents/governance.mjs` を実行してください。**
ブロッカーが1件でもあれば NO-GO です。印象で「問題ありません」と判断してはいけません。

案件マニュアルの登録:

```bash
node agents/generate-project-agent.mjs <案件マニュアルのパス> <案件ID> "<案件名>"
```

生成後、`agents/knowledge/projects/<案件ID>.md` の「確認が必要」「未記入」を人が確定させてください。
未確定のまま案件別の判断をすると、エージェントは「確認が必要」と回答します。

## 接続方法

### Codex CLI

サインインと画像機能の使い分けを含む手順は **`agents/codex-setup.md`** にあります。
アカウント情報・認証情報はリポジトリへ書かないでください。

`~/.codex/config.toml` に追記（`agents/codex-config.toml` の内容をそのまま使えます）:

```toml
[mcp_servers.video-manual]
command = "node"
args = ["agents/mcp-server.mjs"]
```

### Claude Code

リポジトリ直下の `.mcp.json` が自動で読まれます。設定不要です。
