/*
 * manual-snapshot.js
 * このファイルは tools/build-plugin-data.mjs が生成します。手で編集しないでください。
 * 情報源: video-manual-visualizer/manual-data.js
 */

export default {
  "generatedAt": "2026-07-29",
  "source": "video-manual-visualizer/manual-data.js",
  "note": "このファイルは tools/build-plugin-data.mjs が生成します。手で編集しないでください。",
  "ruleTypes": [
    {
      "id": "official",
      "label": "正式記載",
      "short": "正式",
      "description": "元マニュアルに明記されているルールです。そのまま守ってください。"
    },
    {
      "id": "project",
      "label": "案件依存",
      "short": "案件",
      "description": "案件マニュアル・チャンネル独自ルール・ディレクター判断が優先されます。まず確認してください。"
    },
    {
      "id": "conflict",
      "label": "矛盾・要決定",
      "short": "要決定",
      "description": "マニュアル内で複数の基準が衝突しています。自分で統一せず、ディレクターへ確認してください。"
    },
    {
      "id": "improvement",
      "label": "改善候補",
      "short": "改善案",
      "description": "現行マニュアルには正式ルールとして存在しません。事故防止のため追加を検討すべき内容です。正式ルールとして扱わないでください。"
    }
  ],
  "processes": [
    {
      "id": "P01",
      "no": 1,
      "title": "依頼・即レス",
      "summary": "依頼が来たら、すぐに一次返信する。",
      "ruleType": "official",
      "what": [
        "連絡が来たら、まずすぐに一次返信をします。",
        "すぐ回答できないときは、具体的な時刻を伝えます。例:「現在○○の状況のため、○時までに回答いたします」",
        "【着手報告】テンプレートで、着手と初校共有予定時刻を伝えます。",
        "案件独自マニュアルやチャンネル独自ルールがある場合は、そちらを優先します。"
      ],
      "why": [
        "返信がないと、依頼者は「見ていないのか、断られたのか」が判断できず、案件全体が止まります。",
        "具体的な時刻を伝えると、相手は他の予定を組めます。"
      ],
      "fails": [
        "「今日中に返します」のような曖昧な表現を使う（禁止されています）。",
        "内容を確認してから返信しようとして、一次返信が遅れる。",
        "不明点を自分の判断だけで処理してしまう。"
      ],
      "done": [
        "一次返信を送信済み。",
        "回答時刻または初校共有予定時刻を、数字で伝えてある。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P02",
      "no": 2,
      "title": "権限・素材・納期確認",
      "summary": "素材の不備は、いちばん最初に見つける。",
      "ruleType": "official",
      "what": [
        "別録りマイク素材の有無、カメラ内蔵マイクの音声、演者へのマイク装着を確認します。",
        "マイクがあるのに音声がない場合は連絡します。",
        "素材のつながりから抜けている素材がないか確認します。挨拶や締めがない場合は素材漏れを疑います。",
        "概要欄用素材や画面表示素材が共有されているか確認します。未共有素材は遅くともカット完了時に報告します。",
        "画質、白飛び、通常画角、MTSファイルの注意事項を確認します。",
        "権限が必要な場合、無断で「アクセス権限をリクエスト」を押しません。フロントディレクターへ連絡し、自分のメールアドレスも伝え、先方へ確認・招待してもらいます。",
        "アップロードや書き出し時間も納期に含めて計算します。"
      ],
      "why": [
        "素材不備が納期直前に発覚すると、対応できない可能性があります。",
        "無言の権限申請は、クライアントに不信感や混乱を与える可能性があります。",
        "「編集は終わったが、アップロードで納期を超える」状態を防ぐためです。"
      ],
      "fails": [
        "確認せず編集を始めて、途中で素材不足に気づく。",
        "スプレッドシートで無断で権限リクエストを押す。",
        "書き出し時間を計算に入れず、納期を超える。"
      ],
      "done": [
        "素材確認の全項目をチェック済み。",
        "不備があれば【素材不備の可能性の連絡】を送信済み。",
        "不備がなければ「素材確認済みです」を送信済み。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P03",
      "no": 3,
      "title": "シーケンス・画角・音声設定",
      "summary": "最初の設定を間違えると、大きな手戻りになる。",
      "ruleType": "official",
      "what": [
        "シーケンス設定を最初に正しく行います。",
        "人物が小さすぎる場合は、最初に通常画角を調整します。",
        "画角の数値は「モーション」でも変更できますが、「ソース」側で調整すると全体へ反映でき、事故を減らせます。",
        "演者音声トラックへ上から順に、Multiband Compressor（プリセット「テレビ放送」）、ハードリミッター（最大振幅 -6.0dB）、クロマノイズ除去（10%）、ステレオエクスパンダー（ステレオ拡張 0%）を設定します。",
        "SEトラックはハードリミッター最大振幅 -20.0dB、BGMトラックは -29.0dB にします。",
        "グリーンバック素材は Lumetriカラー → Ultraキー → カラーマット → チョーク → マスク → スピル の順で処理します。",
        "色調補正は必要な場合だけ行います。基本的には不要です。"
      ],
      "why": [
        "シーケンス設定を最初に間違えると、大きな手戻りになります。",
        "撮影時は後から調整できるよう引きで撮影されている場合があるためです。",
        "色調補正は動画ごとの色がバラバラになるのを防ぐため、実施前にディレクターへ連絡が必要です。"
      ],
      "fails": [
        "最適な画角をディレクターへ確認せずに決めてしまう（チャンネルごとに違います）。",
        "色調補正を無断で行い、動画ごとに色がバラバラになる。",
        "音声エフェクトの順番や数値を自己流にする。"
      ],
      "done": [
        "シーケンス・通常画角が確定している。",
        "演者・SE・BGMの各トラックへ規定の数値を設定済み。",
        "色調補正を行う場合はディレクターへ連絡済み。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P04",
      "no": 4,
      "title": "粗カット",
      "summary": "大きな不要部分だけを取り除く。自動ツールも必ず目視確認。",
      "ruleType": "official",
      "what": [
        "カット前に素材をネストします。",
        "大まかな不要部分をカットします。",
        "自動カット系ツールを使用した場合も、必ず自分の目と耳で確認します。"
      ],
      "why": [
        "ネストしておくと、素材差し替えへの対応がしやすくなります。",
        "自動ツールは発声部分を誤って切ることがあるためです。"
      ],
      "fails": [
        "ネストせずにカットを始めてしまう。",
        "自動カットの結果をそのまま信用する。",
        "発声部分をカットしてしまう（絶対禁止）。",
        "内容を独断でカットする（絶対禁止）。"
      ],
      "done": [
        "素材をネスト済み。",
        "大きな不要部分を除去済み。",
        "自動ツール使用箇所を目視・試聴で確認済み。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P05",
      "no": 5,
      "title": "細カット",
      "summary": "イヤホンで音を聞きながら、子音のタイミングに合わせて整える。",
      "ruleType": "official",
      "what": [
        "重複箇所、言い直し、ケバ、テンポ、不自然な間を調整します。",
        "必ずイヤホンを使い、音を聞きながら微調整します。",
        "子音の発声タイミングに合わせます。",
        "ケバを取って不自然になるなら残してよいです。",
        "ボケやシュールな間は、意図があれば残してよいです。",
        "「っ」がある言葉を詰めすぎないようにします。",
        "笑い声・相槌は途中で切らず、完全に消すか最後まで残します。"
      ],
      "why": [
        "機械的に詰めると、会話が不自然になり視聴者が離脱します。",
        "相槌が発言と被る場合、途中で切ると聞き苦しくなるためです。",
        "動画の雰囲気によっては、意図的な間が演出になります。"
      ],
      "fails": [
        "スピーカーで作業し、細かい音の粗に気づかない。",
        "「っ」の前後を詰めすぎて不自然になる。",
        "笑い声や相槌を途中でぶつ切りにする。",
        "不要な無音や間延びを残したまま次工程へ進む。"
      ],
      "done": [
        "重複・言い直し・ケバの処理が完了。",
        "子音の発声タイミングと合っている。",
        "自然に聞こえる状態になっている。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P06",
      "no": 6,
      "title": "カット確認",
      "summary": "カット完了時点で提出し、カット感覚のフィードバックをもらう。",
      "ruleType": "official",
      "what": [
        "カット完了時点でディレクターへ提出します。",
        "カット感覚のフィードバックをもらいます。",
        "フィードバック待ちの間も、できる作業は進めます。"
      ],
      "why": [
        "カットの基準がずれたままテロップまで進むと、手戻りが非常に大きくなるためです。",
        "待ち時間をゼロにすることで、納期に余裕が生まれます。"
      ],
      "fails": [
        "カット提出を飛ばして、テロップまで一気に進めてしまう。",
        "フィードバック待ちの間、完全に手を止める。"
      ],
      "done": [
        "カット版をディレクターへ提出済み。",
        "フィードバックを受領し、反映済み。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P07",
      "no": 7,
      "title": "テロップ・表記統一",
      "summary": "1行15〜18文字。句読点は使わず半角スペース。表記揺れはゼロにする。",
      "ruleType": "official",
      "what": [
        "演出なしの通常テロップを作ります。",
        "複数人いる場合は、人物ごとのテロップ色を統一します。",
        "1行15〜18文字を目安に、基本は1行。2行にする場合は上を短く、下を長くします。",
        "セーフマージン外へ出さず、テロップの底辺位置をずらしません。",
        "原則として「、」「。」は使わず、半角スペースで対応します。",
        "熟語以外の数字は原則半角英数字。金額はコンマを入れ、時刻は24時間表記にします。",
        "「！」「？」は全角。断言している発言へ「？」を付けません。",
        "意味のまとまりで改行します。主語がない場合は丸括弧で補います。",
        "固有名詞は公式サイトなどで裏取りします。Wikipediaだけを根拠にしません。",
        "編集後にフォント崩れがないか「グラフィックとタイトル」→「フォントを置換」で確認します。"
      ],
      "why": [
        "文字数が多すぎると読み切れず、視聴者が内容を理解できません。",
        "表記が揺れると、動画全体の信頼感が下がります。",
        "固有名詞のミスは、クライアントの信用に直接関わります。"
      ],
      "fails": [
        "聞こえたまま固有名詞を書いて、裏取りせずに提出する。",
        "句読点を入れてしまう。",
        "2行にしたとき上を長く、下を短くしてしまう。",
        "報告なしでフォントを変更する。",
        "演者ごとのテロップ色切り替えを間違える。"
      ],
      "done": [
        "全テロップが1行15〜18文字の目安に収まっている。",
        "表記揺れが1つもない。",
        "固有名詞をすべて裏取り済み。",
        "フォント崩れがない。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P08",
      "no": 8,
      "title": "見出し・画像・図解・演出",
      "summary": "演出は6秒に1回が基本基準。ただし提出前チェックは10秒に1回で、矛盾している。",
      "ruleType": "conflict",
      "what": [
        "強調テロップ、画角変化、演出を反映します。装飾テロップは基本スケール150以上にします。",
        "内容理解に必要な画像を入れ、拡大縮小や上下左右の動きを付けます。",
        "全画面表示では 1,920×1,080 未満の画像を使用しません。",
        "画角アップは原則30%ずつ増やします（通常100%なら130%など）。",
        "図解は音量を0にして図解だけを見ても内容を理解できる状態にします。使用色は3色以内。",
        "サブ見出しは、動画構成が理解できるように挿入します。",
        "デザインテロップを入れた場合は、テロップ・画角変化・SEをセットにします。"
      ],
      "why": [
        "定点撮影が続くと視聴者が飽きるため、演出で変化を作ります。",
        "見出しが弱いと、視聴者が動画内容を理解できず離脱します。",
        "図解は、音声や文字だけでは頭に入りにくい内容を理解させるためのものです。"
      ],
      "fails": [
        "同じデザインテロップやSEを連続して使う。",
        "画角変化が120%など小さすぎて、違和感だけが残る。",
        "装飾テロップが演者の顔へ被る、セーフマージンを超える。",
        "AIが出した見出しをそのまま信用し、動画を見て調整しない。",
        "前半と後半で演出量にムラが出る。"
      ],
      "done": [
        "演出頻度の基準を満たしている（※6秒／10秒の矛盾はディレクター確認）。",
        "装飾テロップがセーフマージン内かつ顔に被っていない。",
        "サブ見出しだけで動画構成が分かる。"
      ],
      "conflictNote": "演出頻度は「6秒に1回」（演出・よくあるミス）と「10秒に1回」（提出前チェック）が衝突しています。勝手に統一せず、ディレクターへ確認してください。",
      "improvementNote": null
    },
    {
      "id": "P09",
      "no": 9,
      "title": "SE・BGM・音声処理",
      "summary": "SEは画角変化・デザインフォント・画像挿入に。BGMは最後に入れる。",
      "ruleType": "official",
      "what": [
        "SEは、画角変化・通常フォントと異なるデザインフォント・画像挿入の場所に入れます。",
        "通常フォントだけの場合は、原則SEを入れません。",
        "SEへ指数フェードを入れません。同じSEを2回連続で使いません。",
        "BGMは最後に挿入します。BGMへ途中カットを入れず、リミックスツールで長さを調整します。",
        "クリックノイズ対策は最後の書き出し前に行います（コンスタントパワーから指数フェードへ切り替え）。",
        "途中広告やエンディングなどのmp4素材は、何も音量調整していないトラックへ置きます。",
        "音源は DOVA-SYNDROME、効果音ラボ など利用可能な素材を使用します。"
      ],
      "why": [
        "SEが多すぎたり同じものが続くと、視聴者が飽きたり耳障りになります。",
        "リミックスはPremiere Proが重くなりやすいため、最後に行います。",
        "書き出し後にBGMの音が消える場合があるため、確認が必要です。"
      ],
      "fails": [
        "SEそのものへ指数フェードを入れてしまう（クリックノイズ対策の指数フェードと混同）。",
        "同じSEを2回連続で使う。",
        "エンディングへBGMが重なったまま提出する。",
        "イヤホンで音量確認をしない。"
      ],
      "done": [
        "SEが規定の場所へ入っている。",
        "BGM挿入とリミックスが完了している。",
        "クリックノイズ対策が完了している。",
        "イヤホンで音量を確認済み。"
      ],
      "conflictNote": null,
      "improvementNote": null
    },
    {
      "id": "P10",
      "no": 10,
      "title": "提出前チェック",
      "summary": "18項目のチェックリストと、誤字脱字チェックツールを必ず使う。",
      "ruleType": "official",
      "what": [
        "提出前チェックリストの18項目をすべて確認します。",
        "誤字脱字チェックツールを必ず使用し、検出された誤字・表記揺れをすべて修正します。",
        "ツールだけでなく目視確認も行います。",
        "FrameDetectorでFrame 1とFrame 2の両方をチェックし、マーカーが付いた箇所をすべて修正します。",
        "画角見切れは、フル画質横のスパナ →「透明グリッド」で、見切れ部分がシマシマになっていないか確認します（必ず行うルール）。",
        "ディレクター提出時は「チェックリストに記載されている項目は見つかりませんでした」と記載します。",
        "共有するチェックシートは、一般的なアクセスを「リンクを知っている全員」「編集者」へ変更します。"
      ],
      "why": [
        "修正漏れは1箇所でもレベルマイナス（-5点）の対象になります。",
        "フレームずれはツールを使わないと目視では発見しきれません。"
      ],
      "fails": [
        "誤字脱字チェックツールで検出できるミスを残したまま提出する（レベル0の条件）。",
        "FrameDetectorのFrame 1だけ確認してFrame 2を忘れる。",
        "透明グリッドでの見切れ確認を省略する。"
      ],
      "done": [
        "チェックリスト18項目がすべてチェック済み。",
        "誤字脱字チェックツールでエラーがゼロ。",
        "FrameDetectorでフレームずれがゼロ。"
      ],
      "conflictNote": null,
      "improvementNote": "モザイク・個人情報の確認、画像／BGM／SEのライセンス証跡の保管は、現行の正式チェック項目にありません。改善候補として別に管理してください。"
    },
    {
      "id": "P11",
      "no": 11,
      "title": "書き出し・提出",
      "summary": "2026年4月23日更新でFrame.ioへ統一。ただし旧手順が残っており矛盾している。",
      "ruleType": "conflict",
      "what": [
        "Frame.ioへアップロードします。",
        "同時にギガファイル便へプロマネとmp4をアップロードします（保存100日）。",
        "管理シートへ格納し、チェックリストを添付し、工程別編集時間を共有します。",
        "プロマネ作成時は、メディアキャッシュを削除し、元素材を提出物から削除します。",
        "「未使用のクリップを除外」にはチェックしません。",
        "フォルダごとアップロードし、案件の命名規則に沿って名前を付けます。",
        "「まとめる」を実行する前にファイル名を確認します。"
      ],
      "why": [
        "限定公開だと、クライアント公開時にコピーコンテンツ扱いとなり、再生数低下や警告が発生する可能性があるためです。",
        "元素材を外すのは、提出物の容量を抑えるためです（元素材は別途保存します）。"
      ],
      "fails": [
        "「未使用のクリップを除外」にチェックを入れてしまう。",
        "元素材を提出用プロマネから外さずにアップロードする。",
        "ファイル名を確認せずに「まとめる」を実行する。",
        "アップロード時間を納期に含めていない。"
      ],
      "done": [
        "Frame.ioへアップロード済み。",
        "ギガファイル便へプロマネとmp4をアップロード済み。",
        "管理シートへ格納し、チェックリストを添付済み。"
      ],
      "conflictNote": "提出方法が衝突しています。提出シート冒頭は「Frame.ioへ統一」、チェックは「YouTube限定公開を提出」、提出シート後半には限定公開手順が残存、修正では限定公開の概要欄を使用となっています。正式ルールとして統合しないでください。",
      "improvementNote": null
    },
    {
      "id": "P12",
      "no": 12,
      "title": "修正・全体再チェック",
      "summary": "修正は本来0を目指す。指示箇所以外も動画全体を再チェックする。",
      "ruleType": "official",
      "what": [
        "修正指示を受けたら必ず返信します。無言で着手して事後報告しません。",
        "【着手報告】で、提出予定時刻を伝えます。",
        "修正箇所をタイムコードで記録します。",
        "動画尺が変わった場合は最新尺に合わせます。",
        "修正後は指示箇所以外も動画全体を再チェックします。",
        "進捗シートの動画、mp4、プロマネを最新版へ更新します。",
        "カット修正は時間がずれるため最後に行います。",
        "初稿納期後24時間は、修正へ対応できるよう予定を空けておきます。"
      ],
      "why": [
        "修正漏れは1箇所でもレベルマイナス（-5点）の対象です。",
        "カット修正を先に行うと、後続のテロップやSEの位置がすべてずれるためです。"
      ],
      "fails": [
        "指示された箇所だけ直して、全体を見直さない。",
        "カット修正を最初に行い、他の要素がずれる。",
        "無言で修正に着手する。",
        "進捗シートの各ファイルを最新版へ更新し忘れる。"
      ],
      "done": [
        "修正指示へ返信済み。",
        "全修正箇所を対応済み、かつ動画全体を再チェック済み。",
        "進捗シートの動画・mp4・プロマネが最新版。"
      ],
      "conflictNote": "修正の現行文面には限定公開の概要欄を使う説明が残っており、Frame.io方針と矛盾しています。Add MarkerのURLは省略されているため、完全なURLを推測しないでください。",
      "improvementNote": null
    },
    {
      "id": "P13",
      "no": 13,
      "title": "保存・切り抜き・育成",
      "summary": "プロマネと素材は1年間保存。切り抜きはクライアントOK後に制作。",
      "ruleType": "official",
      "what": [
        "プロマネと動画素材は1年間保存します。外部SSDを使用する指示があります。",
        "1年経過前に独断で削除しません。",
        "切り抜きは、本編編集中に候補を探し、本編初稿提出時に候補タイムスタンプも提出します。",
        "クライアント承認後の完成mp4で切り抜きを制作します。",
        "縦型は 9:16 / 1,080×1,920、横型は 16:9 / 1,920×1,080、形式は MP4・H.264。",
        "最低3本、30秒〜1分、3本の内容が重複しないようにします。",
        "中級編集者からディレクターへは STEP1〜STEP4 で段階的に進みます。"
      ],
      "why": [
        "素材を保存しておくと、後日の再編集や差し替えに対応できます。",
        "クライアントOK前に切り抜きを作ると、本編修正で作り直しになるためです。"
      ],
      "fails": [
        "クライアントOK前に切り抜きを制作してしまう。",
        "修正前素材を使用して切り抜きを作る。",
        "1年経過前に独断でデータを削除する。",
        "3本の内容が重複する。"
      ],
      "done": [
        "プロマネと素材を外部SSDへ保存済み。",
        "切り抜きが最低3本、納品前チェックを通過している。"
      ],
      "conflictNote": null,
      "improvementNote": "保存用SSDの暗号化、バックアップ、紛失対策は現行マニュアルにありません。改善候補です。"
    }
  ],
  "checklist": [
    {
      "id": "C01",
      "text": "意図のない無音部分が残っていない",
      "ruleType": "official"
    },
    {
      "id": "C02",
      "text": "演出テロップや画角変化が10秒に1回入っている",
      "ruleType": "conflict",
      "note": "「演出」「よくあるミス」では6秒に1回。矛盾しています。"
    },
    {
      "id": "C03",
      "text": "前半と後半で演出量にムラがない",
      "ruleType": "official"
    },
    {
      "id": "C04",
      "text": "聞き取れない発言を見切り発車していない",
      "ruleType": "official"
    },
    {
      "id": "C05",
      "text": "聞き取りが合っていても、文脈がおかしくない",
      "ruleType": "official"
    },
    {
      "id": "C06",
      "text": "マイク反響がない",
      "ruleType": "official"
    },
    {
      "id": "C07",
      "text": "マイク切り替え漏れがない",
      "ruleType": "official"
    },
    {
      "id": "C08",
      "text": "表記揺れが1つもない",
      "ruleType": "official"
    },
    {
      "id": "C09",
      "text": "固有名詞をすべて裏取りした",
      "ruleType": "official"
    },
    {
      "id": "C10",
      "text": "固有名詞が出たときに画像を表示した",
      "ruleType": "official"
    },
    {
      "id": "C11",
      "text": "クリックノイズ対策をした",
      "ruleType": "official"
    },
    {
      "id": "C12",
      "text": "画像アニメーションが途中で止まっていない",
      "ruleType": "official"
    },
    {
      "id": "C13",
      "text": "FrameDetectorでフレームずれを0にした",
      "ruleType": "official"
    },
    {
      "id": "C14",
      "text": "画面見切れがない",
      "ruleType": "official"
    },
    {
      "id": "C15",
      "text": "サブ見出しだけで動画構成が分かる",
      "ruleType": "official"
    },
    {
      "id": "C16",
      "text": "誤字脱字がない",
      "ruleType": "official"
    },
    {
      "id": "C17",
      "text": "ノイズ除去を入れすぎて音がこもっていない",
      "ruleType": "official"
    },
    {
      "id": "C18",
      "text": "誤字脱字チェックツールでエラーがない",
      "ruleType": "official"
    }
  ],
  "checklistImprovements": [
    {
      "id": "CI01",
      "text": "モザイク・個人情報の確認",
      "ruleType": "improvement"
    },
    {
      "id": "CI02",
      "text": "車のナンバー",
      "ruleType": "improvement"
    },
    {
      "id": "CI03",
      "text": "鏡・窓の反射",
      "ruleType": "improvement"
    },
    {
      "id": "CI04",
      "text": "モニター・スマートフォン",
      "ruleType": "improvement"
    },
    {
      "id": "CI05",
      "text": "書類",
      "ruleType": "improvement"
    },
    {
      "id": "CI06",
      "text": "画像ライセンス",
      "ruleType": "improvement"
    },
    {
      "id": "CI07",
      "text": "BGM・SEライセンス",
      "ruleType": "improvement"
    },
    {
      "id": "CI08",
      "text": "引用元URL",
      "ruleType": "improvement"
    },
    {
      "id": "CI09",
      "text": "AIへ入力してよい情報",
      "ruleType": "improvement"
    },
    {
      "id": "CI10",
      "text": "保存用SSDの暗号化",
      "ruleType": "improvement"
    },
    {
      "id": "CI11",
      "text": "バックアップ",
      "ruleType": "improvement"
    },
    {
      "id": "CI12",
      "text": "紛失対策",
      "ruleType": "improvement"
    }
  ],
  "clipChecklist": [
    {
      "id": "K01",
      "text": "最低3本",
      "ruleType": "official"
    },
    {
      "id": "K02",
      "text": "クライアント承認後素材を使用",
      "ruleType": "official"
    },
    {
      "id": "K03",
      "text": "冒頭2秒にフック",
      "ruleType": "official"
    },
    {
      "id": "K04",
      "text": "黒フレームなし",
      "ruleType": "official"
    },
    {
      "id": "K05",
      "text": "上下文言が正しい",
      "ruleType": "official"
    },
    {
      "id": "K06",
      "text": "セーフマージン内",
      "ruleType": "official"
    },
    {
      "id": "K07",
      "text": "3本の内容が重複しない",
      "ruleType": "official"
    },
    {
      "id": "K08",
      "text": "30秒〜1分",
      "ruleType": "official"
    },
    {
      "id": "K09",
      "text": "音割れなし",
      "ruleType": "official"
    },
    {
      "id": "K10",
      "text": "音量バランス正常",
      "ruleType": "official"
    },
    {
      "id": "K11",
      "text": "誤字脱字なし",
      "ruleType": "official"
    },
    {
      "id": "K12",
      "text": "タイトル4要素を確認",
      "ruleType": "official"
    }
  ],
  "materialChecklist": [
    {
      "id": "M01",
      "text": "別録りマイク素材があるか",
      "ruleType": "official"
    },
    {
      "id": "M02",
      "text": "カメラ内蔵マイクの場合、音声に問題がないか",
      "ruleType": "official"
    },
    {
      "id": "M03",
      "text": "演者にマイクが付いているか",
      "ruleType": "official"
    },
    {
      "id": "M04",
      "text": "マイクがあるのに音声がない場合は連絡",
      "ruleType": "official"
    },
    {
      "id": "M05",
      "text": "素材のつながりから、抜けている素材がないか",
      "ruleType": "official"
    },
    {
      "id": "M06",
      "text": "挨拶や締めがない場合は素材漏れを疑う",
      "ruleType": "official"
    },
    {
      "id": "M07",
      "text": "概要欄用素材や画面表示素材が共有されているか",
      "ruleType": "official"
    },
    {
      "id": "M08",
      "text": "未共有素材は遅くともカット完了時に報告",
      "ruleType": "official"
    },
    {
      "id": "M09",
      "text": "画質が悪くないか",
      "ruleType": "official"
    },
    {
      "id": "M10",
      "text": "白飛びしていないか",
      "ruleType": "official"
    },
    {
      "id": "M11",
      "text": "通常画角に問題がないか",
      "ruleType": "official"
    },
    {
      "id": "M12",
      "text": "MTSファイルの場合の注意事項を確認",
      "ruleType": "official"
    }
  ],
  "audioStandards": [
    {
      "name": "演者音声トラック ハードリミッター",
      "value": "-6.0",
      "unit": "dB",
      "note": "最大振幅。演者音声の基準も-6dB。",
      "ruleType": "official",
      "chartValue": -6
    },
    {
      "name": "SEトラック ハードリミッター",
      "value": "-20.0",
      "unit": "dB",
      "note": "最大振幅。",
      "ruleType": "official",
      "chartValue": -20
    },
    {
      "name": "BGMトラック ハードリミッター",
      "value": "-29.0",
      "unit": "dB",
      "note": "最大振幅。",
      "ruleType": "official",
      "chartValue": -29
    },
    {
      "name": "発言直後の音声",
      "value": "-999",
      "unit": "dB",
      "note": "無効化ではなく「有効のまま音量バーで下げる」。オーディオゲインで下げない。",
      "ruleType": "official",
      "chartValue": null
    },
    {
      "name": "クロマノイズ除去",
      "value": "10",
      "unit": "%",
      "note": "演者音声トラック。",
      "ruleType": "official",
      "chartValue": null
    },
    {
      "name": "ステレオエクスパンダー",
      "value": "0",
      "unit": "% (ステレオ拡張)",
      "note": "演者音声トラック。",
      "ruleType": "official",
      "chartValue": null
    },
    {
      "name": "Multiband Compressor",
      "value": "テレビ放送",
      "unit": "プリセット",
      "note": "演者音声トラックの1番目。",
      "ruleType": "official",
      "chartValue": null
    }
  ],
  "telopStandards": [
    {
      "name": "テロップ1行の文字数",
      "value": "15〜18",
      "unit": "文字",
      "note": "基本は1行。2行は意味のまとまりが良い場合だけ。",
      "ruleType": "official",
      "chartValue": 16.5
    },
    {
      "name": "2行にする場合",
      "value": "上を短く / 下を長く",
      "unit": "—",
      "note": "セーフマージン外へ出さない。底辺位置をずらさない。",
      "ruleType": "official",
      "chartValue": null
    },
    {
      "name": "装飾テロップの基本スケール",
      "value": "150以上",
      "unit": "%",
      "note": "フォントサイズではなくスケールで調整。急に大きくしすぎない。",
      "ruleType": "official",
      "chartValue": 150
    },
    {
      "name": "テロップ表示タイミング",
      "value": "子音発声の1フレーム前",
      "unit": "フレーム",
      "note": "カットがない場所で切り替える場合の目安。",
      "ruleType": "official",
      "chartValue": null
    },
    {
      "name": "Caption Fit のずれ補正",
      "value": "5",
      "unit": "フレーム以内",
      "note": "補正後も目視確認が必要。",
      "ruleType": "official",
      "chartValue": null
    }
  ],
  "numericStandards": [
    {
      "group": "音量・音声処理",
      "unitNote": "dB（デシベル）は音の大きさの単位。数字が小さい（マイナスが大きい）ほど音が小さい。",
      "items": [
        {
          "name": "演者音声トラック ハードリミッター",
          "value": "-6.0",
          "unit": "dB",
          "note": "最大振幅。演者音声の基準も-6dB。",
          "ruleType": "official",
          "chartValue": -6
        },
        {
          "name": "SEトラック ハードリミッター",
          "value": "-20.0",
          "unit": "dB",
          "note": "最大振幅。",
          "ruleType": "official",
          "chartValue": -20
        },
        {
          "name": "BGMトラック ハードリミッター",
          "value": "-29.0",
          "unit": "dB",
          "note": "最大振幅。",
          "ruleType": "official",
          "chartValue": -29
        },
        {
          "name": "発言直後の音声",
          "value": "-999",
          "unit": "dB",
          "note": "無効化ではなく「有効のまま音量バーで下げる」。オーディオゲインで下げない。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "クロマノイズ除去",
          "value": "10",
          "unit": "%",
          "note": "演者音声トラック。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "ステレオエクスパンダー",
          "value": "0",
          "unit": "% (ステレオ拡張)",
          "note": "演者音声トラック。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "Multiband Compressor",
          "value": "テレビ放送",
          "unit": "プリセット",
          "note": "演者音声トラックの1番目。",
          "ruleType": "official",
          "chartValue": null
        }
      ]
    },
    {
      "group": "テロップ",
      "unitNote": "フレームは動画のコマ。1フレームは約30分の1秒。",
      "items": [
        {
          "name": "テロップ1行の文字数",
          "value": "15〜18",
          "unit": "文字",
          "note": "基本は1行。2行は意味のまとまりが良い場合だけ。",
          "ruleType": "official",
          "chartValue": 16.5
        },
        {
          "name": "2行にする場合",
          "value": "上を短く / 下を長く",
          "unit": "—",
          "note": "セーフマージン外へ出さない。底辺位置をずらさない。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "装飾テロップの基本スケール",
          "value": "150以上",
          "unit": "%",
          "note": "フォントサイズではなくスケールで調整。急に大きくしすぎない。",
          "ruleType": "official",
          "chartValue": 150
        },
        {
          "name": "テロップ表示タイミング",
          "value": "子音発声の1フレーム前",
          "unit": "フレーム",
          "note": "カットがない場所で切り替える場合の目安。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "Caption Fit のずれ補正",
          "value": "5",
          "unit": "フレーム以内",
          "note": "補正後も目視確認が必要。",
          "ruleType": "official",
          "chartValue": null
        }
      ]
    },
    {
      "group": "演出・画角",
      "unitNote": "画角は画面の映る範囲。%を上げると拡大される。",
      "items": [
        {
          "name": "演出頻度（演出・よくあるミス）",
          "value": "6",
          "unit": "秒に1回",
          "note": "基本基準。テロップ変化・SE・画角変化・画像・エフェクト・色調変化を含む。",
          "ruleType": "conflict",
          "chartValue": 6
        },
        {
          "name": "演出頻度（提出前チェック）",
          "value": "10",
          "unit": "秒に1回",
          "note": "演出テロップや画角変化。6秒基準と衝突している。",
          "ruleType": "conflict",
          "chartValue": 10
        },
        {
          "name": "画角アップの増加量",
          "value": "30",
          "unit": "%ずつ",
          "note": "通常100%なら130%など。120%は変化が小さく違和感だけが残る場合がある。",
          "ruleType": "official",
          "chartValue": 30
        },
        {
          "name": "同一SEの再使用間隔",
          "value": "別のSEを2回程度",
          "unit": "使うまで避ける",
          "note": "並列概念を並べる演出では連続使用する場合がある。",
          "ruleType": "official",
          "chartValue": null
        }
      ]
    },
    {
      "group": "画像・モザイク",
      "unitNote": "px（ピクセル）は画像の細かさの単位。数字が大きいほど高画質。",
      "items": [
        {
          "name": "全画面表示に使う画像の最低サイズ",
          "value": "1,920×1,080",
          "unit": "px以上",
          "note": "これ未満は全画面表示に使用しない。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "全画面画像の位置変化",
          "value": "50",
          "unit": "/秒",
          "note": "速すぎない動きの目安。",
          "ruleType": "official",
          "chartValue": 50
        },
        {
          "name": "全画面画像のスケール変化",
          "value": "1",
          "unit": "/秒",
          "note": "速すぎない動きの目安。",
          "ruleType": "official",
          "chartValue": 1
        },
        {
          "name": "ブラー（ガウス）",
          "value": "100",
          "unit": "—",
          "note": "「モザイク」ではなく「ブラー（ガウス）」を使う。",
          "ruleType": "official",
          "chartValue": 100
        },
        {
          "name": "マスク境界線のぼかし",
          "value": "40",
          "unit": "—",
          "note": "案件指定や素材事情に応じて調整可能。",
          "ruleType": "project",
          "chartValue": 40
        },
        {
          "name": "図解の使用色",
          "value": "3",
          "unit": "色以内",
          "note": "画像・イラストを使い、テロップだけを並べない。",
          "ruleType": "official",
          "chartValue": 3
        }
      ]
    },
    {
      "group": "切り抜き動画",
      "unitNote": "9:16は縦長、16:9は横長の画面比率。",
      "items": [
        {
          "name": "冒頭の勝負時間",
          "value": "2",
          "unit": "秒",
          "note": "ショート動画は最初の2秒が重要。一番強い場面を先頭へ。",
          "ruleType": "official",
          "chartValue": 2
        },
        {
          "name": "縦型の解像度",
          "value": "1,080×1,920",
          "unit": "px (9:16)",
          "note": "YouTube Shorts / TikTok / Instagramリール。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "横型の解像度",
          "value": "1,920×1,080",
          "unit": "px (16:9)",
          "note": "形式は MP4 / H.264。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "納品本数",
          "value": "最低3",
          "unit": "本",
          "note": "3本の内容が重複しないこと。",
          "ruleType": "official",
          "chartValue": 3
        },
        {
          "name": "1本の長さ",
          "value": "30秒〜1分",
          "unit": "—",
          "note": "納品前チェック項目。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "タイトルの文字数",
          "value": "28〜40",
          "unit": "全角文字程度",
          "note": "重要キーワードは前半へ置く。",
          "ruleType": "official",
          "chartValue": 34
        },
        {
          "name": "上下文言の行数",
          "value": "3",
          "unit": "行程度",
          "note": "スマートフォンで読めること。UIと重ならないこと。",
          "ruleType": "official",
          "chartValue": 3
        }
      ]
    },
    {
      "group": "時間・期限・費用",
      "unitNote": "納期にはアップロードや書き出しの時間も含める。",
      "items": [
        {
          "name": "進捗報告の期限",
          "value": "毎日21時",
          "unit": "まで",
          "note": "ディレクターへ報告。プロマネURLも記載。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "初稿納期後に空けておく時間",
          "value": "24",
          "unit": "時間",
          "note": "修正へ対応できるよう予定を空ける。",
          "ruleType": "official",
          "chartValue": 24
        },
        {
          "name": "ギガファイル便の保存期間",
          "value": "100",
          "unit": "日",
          "note": "プロマネとmp4をアップロード。",
          "ruleType": "official",
          "chartValue": 100
        },
        {
          "name": "プロマネ・動画素材の保存期間",
          "value": "1",
          "unit": "年間",
          "note": "外部SSDを使用。1年経過前に独断で削除しない。",
          "ruleType": "official",
          "chartValue": null
        },
        {
          "name": "FrameDetector",
          "value": "1,000",
          "unit": "円（買い切り）",
          "note": "購入が分かるスクリーンショットと一緒に担当者へ報告。",
          "ruleType": "official",
          "chartValue": 1000
        },
        {
          "name": "Caption Fit",
          "value": "5,000",
          "unit": "円（買い切り）",
          "note": "Vrewのテロップを映像レイヤーの編集点へ合わせる有料ツール。",
          "ruleType": "official",
          "chartValue": 5000
        },
        {
          "name": "冒頭の完成見本",
          "value": "3",
          "unit": "分",
          "note": "冒頭3分を先に完成させ、全体の基準を合わせる。",
          "ruleType": "official",
          "chartValue": 3
        }
      ]
    }
  ],
  "dictionary": [
    {
      "wrong": "Premire Pro／プレミアプロ／プレミアムプロ",
      "correct": "Premiere Pro",
      "reading": "プレミアプロ",
      "group": "ツール名"
    },
    {
      "wrong": "After Effect／アフターエフェクト",
      "correct": "After Effects",
      "reading": "アフターエフェクツ",
      "group": "ツール名"
    },
    {
      "wrong": "photoshop／photo shop",
      "correct": "Photoshop",
      "reading": "フォトショップ",
      "group": "ツール名"
    },
    {
      "wrong": "instagram",
      "correct": "Instagram",
      "reading": "インスタグラム",
      "group": "サービス名"
    },
    {
      "wrong": "youtube／YOUTUBE／Youtube",
      "correct": "YouTube",
      "reading": "ユーチューブ",
      "group": "サービス名"
    },
    {
      "wrong": "Tiktok／ティックトック",
      "correct": "TikTok",
      "reading": "ティックトック",
      "group": "サービス名"
    },
    {
      "wrong": "chatGPT",
      "correct": "ChatGPT",
      "reading": "チャットジーピーティー",
      "group": "サービス名"
    },
    {
      "wrong": "1か月／1カ月／1ヵ月",
      "correct": "1ヶ月",
      "reading": "いっかげつ",
      "group": "単位・数"
    },
    {
      "wrong": "青さん／アオさん",
      "correct": "あおさん",
      "reading": "あおさん",
      "group": "固有名詞"
    },
    {
      "wrong": "追さん",
      "correct": "迫さん",
      "reading": "さこさん",
      "group": "固有名詞"
    },
    {
      "wrong": "売り上げ",
      "correct": "売上",
      "reading": "うりあげ",
      "group": "ビジネス語"
    },
    {
      "wrong": "気持ちや考え",
      "correct": "想い",
      "reading": "おもい",
      "group": "言い換え"
    },
    {
      "wrong": "考えごと",
      "correct": "思い／思う",
      "reading": "おもい／おもう",
      "group": "言い換え"
    },
    {
      "wrong": "～して下さい",
      "correct": "～してください",
      "reading": "してください",
      "group": "開く漢字"
    },
    {
      "wrong": "凄い",
      "correct": "すごい",
      "reading": "すごい",
      "group": "開く漢字"
    },
    {
      "wrong": "凄く",
      "correct": "すごく",
      "reading": "すごく",
      "group": "開く漢字"
    },
    {
      "wrong": "～出来る",
      "correct": "～できる",
      "reading": "できる",
      "group": "開く漢字"
    },
    {
      "wrong": "動線",
      "correct": "導線",
      "reading": "どうせん",
      "group": "同音異義"
    },
    {
      "wrong": "皆さん",
      "correct": "みなさん",
      "reading": "みなさん",
      "group": "開く漢字"
    },
    {
      "wrong": "皆んな／皆",
      "correct": "みんな",
      "reading": "みんな",
      "group": "開く漢字"
    },
    {
      "wrong": "敢えて",
      "correct": "あえて",
      "reading": "あえて",
      "group": "開く漢字"
    },
    {
      "wrong": "予め",
      "correct": "あらかじめ",
      "reading": "あらかじめ",
      "group": "開く漢字"
    },
    {
      "wrong": "有り難い",
      "correct": "ありがたい",
      "reading": "ありがたい",
      "group": "開く漢字"
    },
    {
      "wrong": "如何に",
      "correct": "いかに",
      "reading": "いかに",
      "group": "開く漢字"
    },
    {
      "wrong": "～致します",
      "correct": "～いたします",
      "reading": "いたします",
      "group": "開く漢字"
    },
    {
      "wrong": "1番",
      "correct": "一番",
      "reading": "いちばん",
      "group": "単位・数",
      "note": "ただし「1番目」は数字"
    },
    {
      "wrong": "一人",
      "correct": "1人",
      "reading": "ひとり",
      "group": "単位・数"
    },
    {
      "wrong": "何時",
      "correct": "いつ",
      "reading": "いつ",
      "group": "開く漢字"
    },
    {
      "wrong": "一体",
      "correct": "いったい",
      "reading": "いったい",
      "group": "開く漢字"
    },
    {
      "wrong": "未だ",
      "correct": "いまだ",
      "reading": "いまだ",
      "group": "開く漢字"
    },
    {
      "wrong": "色々",
      "correct": "いろいろ",
      "reading": "いろいろ",
      "group": "開く漢字"
    },
    {
      "wrong": "色んな",
      "correct": "いろんな",
      "reading": "いろんな",
      "group": "開く漢字"
    },
    {
      "wrong": "WEB",
      "correct": "Web",
      "reading": "ウェブ",
      "group": "ツール名"
    },
    {
      "wrong": "仕事を受ける",
      "correct": "仕事を請ける",
      "reading": "うける",
      "group": "同音異義"
    },
    {
      "wrong": "ポイントを抑える",
      "correct": "ポイントを押さえる",
      "reading": "おさえる",
      "group": "同音異義"
    },
    {
      "wrong": "恐らく",
      "correct": "おそらく",
      "reading": "おそらく",
      "group": "開く漢字"
    },
    {
      "wrong": "畏まりました",
      "correct": "かしこまりました",
      "reading": "かしこまりました",
      "group": "開く漢字"
    },
    {
      "wrong": "且つ",
      "correct": "かつ",
      "reading": "かつ",
      "group": "開く漢字"
    },
    {
      "wrong": "気付く",
      "correct": "気づく",
      "reading": "きづく",
      "group": "開く漢字"
    },
    {
      "wrong": "クオリティー",
      "correct": "クオリティ",
      "reading": "クオリティ",
      "group": "カタカナ"
    },
    {
      "wrong": "～位",
      "correct": "～くらい",
      "reading": "くらい",
      "group": "開く漢字"
    },
    {
      "wrong": "CHROME",
      "correct": "Chrome",
      "reading": "クローム",
      "group": "ツール名"
    },
    {
      "wrong": "～君",
      "correct": "～くん",
      "reading": "くん",
      "group": "開く漢字"
    },
    {
      "wrong": "経験0",
      "correct": "経験ゼロ",
      "reading": "けいけんゼロ",
      "group": "単位・数"
    },
    {
      "wrong": "子供",
      "correct": "子ども",
      "reading": "こども",
      "group": "開く漢字"
    },
    {
      "wrong": "流石",
      "correct": "さすが",
      "reading": "さすが",
      "group": "開く漢字"
    },
    {
      "wrong": "更に",
      "correct": "さらに",
      "reading": "さらに",
      "group": "開く漢字"
    },
    {
      "wrong": "ジップファイル",
      "correct": "zipファイル",
      "reading": "ジップファイル",
      "group": "ツール名"
    },
    {
      "wrong": "～して頂く",
      "correct": "～していただく",
      "reading": "いただく",
      "group": "開く漢字",
      "note": "ただし物をもらう意味は漢字"
    },
    {
      "wrong": "～して置く",
      "correct": "～しておく",
      "reading": "しておく",
      "group": "開く漢字"
    },
    {
      "wrong": "して欲しい",
      "correct": "してほしい",
      "reading": "してほしい",
      "group": "開く漢字"
    },
    {
      "wrong": "暫く",
      "correct": "しばらく",
      "reading": "しばらく",
      "group": "開く漢字"
    },
    {
      "wrong": "～かも知れない",
      "correct": "～かもしれない",
      "reading": "かもしれない",
      "group": "開く漢字"
    },
    {
      "wrong": "ZOOM／zoom",
      "correct": "Zoom",
      "reading": "ズーム",
      "group": "サービス名"
    },
    {
      "wrong": "すいません",
      "correct": "すみません",
      "reading": "すみません",
      "group": "言い換え"
    },
    {
      "wrong": "直ぐに",
      "correct": "すぐに",
      "reading": "すぐに",
      "group": "開く漢字"
    },
    {
      "wrong": "ストックサン",
      "correct": "StockSun",
      "reading": "ストックサン",
      "group": "固有名詞"
    },
    {
      "wrong": "全て",
      "correct": "すべて",
      "reading": "すべて",
      "group": "開く漢字"
    },
    {
      "wrong": "～するに当たり",
      "correct": "～するにあたり",
      "reading": "あたり",
      "group": "開く漢字"
    },
    {
      "wrong": "折角",
      "correct": "せっかく",
      "reading": "せっかく",
      "group": "開く漢字"
    },
    {
      "wrong": "是非",
      "correct": "ぜひ",
      "reading": "ぜひ",
      "group": "開く漢字"
    },
    {
      "wrong": "俗人性",
      "correct": "属人性",
      "reading": "ぞくじんせい",
      "group": "同音異義"
    },
    {
      "wrong": "その内",
      "correct": "そのうち",
      "reading": "そのうち",
      "group": "開く漢字"
    },
    {
      "wrong": "大層",
      "correct": "たいそう",
      "reading": "たいそう",
      "group": "開く漢字"
    },
    {
      "wrong": "沢山",
      "correct": "たくさん",
      "reading": "たくさん",
      "group": "開く漢字"
    },
    {
      "wrong": "大体",
      "correct": "だいたい",
      "reading": "だいたい",
      "group": "開く漢字"
    },
    {
      "wrong": "大分",
      "correct": "だいぶ",
      "reading": "だいぶ",
      "group": "開く漢字"
    },
    {
      "wrong": "但し",
      "correct": "ただし",
      "reading": "ただし",
      "group": "開く漢字"
    },
    {
      "wrong": "度々",
      "correct": "たびたび",
      "reading": "たびたび",
      "group": "開く漢字"
    },
    {
      "wrong": "～の為に",
      "correct": "～のために",
      "reading": "ために",
      "group": "開く漢字"
    },
    {
      "wrong": "Twitter／X",
      "correct": "初回はX（旧Twitter）、2回目以降はX",
      "reading": "エックス",
      "group": "サービス名"
    },
    {
      "wrong": "遂に",
      "correct": "ついに",
      "reading": "ついに",
      "group": "開く漢字"
    },
    {
      "wrong": "呟く",
      "correct": "つぶやく",
      "reading": "つぶやく",
      "group": "開く漢字"
    },
    {
      "wrong": "辛い",
      "correct": "つらい",
      "reading": "つらい",
      "group": "開く漢字"
    },
    {
      "wrong": "でかい",
      "correct": "デカい",
      "reading": "デカい",
      "group": "カタカナ"
    },
    {
      "wrong": "ときどき",
      "correct": "時々",
      "reading": "ときどき",
      "group": "閉じる漢字"
    },
    {
      "wrong": "To C",
      "correct": "toC",
      "reading": "トゥシー",
      "group": "ビジネス語"
    },
    {
      "wrong": "To B",
      "correct": "toB",
      "reading": "トゥビー",
      "group": "ビジネス語"
    },
    {
      "wrong": "動画編集キャンプ",
      "correct": "動画編集CAMP",
      "reading": "どうがへんしゅうキャンプ",
      "group": "固有名詞"
    },
    {
      "wrong": "動画を観る",
      "correct": "動画を見る",
      "reading": "みる",
      "group": "同音異義"
    },
    {
      "wrong": "尚",
      "correct": "なお",
      "reading": "なお",
      "group": "開く漢字"
    },
    {
      "wrong": "何故",
      "correct": "なぜ",
      "reading": "なぜ",
      "group": "開く漢字"
    },
    {
      "wrong": "～等",
      "correct": "～など",
      "reading": "など",
      "group": "開く漢字"
    },
    {
      "wrong": "何にも",
      "correct": "なんにも",
      "reading": "なんにも",
      "group": "開く漢字"
    },
    {
      "wrong": "パーソナリティー",
      "correct": "パーソナリティ",
      "reading": "パーソナリティ",
      "group": "カタカナ"
    },
    {
      "wrong": "はっきり",
      "correct": "ハッキリ",
      "reading": "ハッキリ",
      "group": "カタカナ"
    },
    {
      "wrong": "風に",
      "correct": "ふうに",
      "reading": "ふうに",
      "group": "開く漢字"
    },
    {
      "wrong": "ぶれる",
      "correct": "ブレる",
      "reading": "ブレる",
      "group": "カタカナ"
    },
    {
      "wrong": "べつに",
      "correct": "別に",
      "reading": "べつに",
      "group": "閉じる漢字"
    },
    {
      "wrong": "殆ど",
      "correct": "ほとんど",
      "reading": "ほとんど",
      "group": "開く漢字"
    },
    {
      "wrong": "先ず",
      "correct": "まず",
      "reading": "まず",
      "group": "開く漢字"
    },
    {
      "wrong": "MAX",
      "correct": "マックス",
      "reading": "マックス",
      "group": "カタカナ"
    },
    {
      "wrong": "全く",
      "correct": "まったく",
      "reading": "まったく",
      "group": "開く漢字"
    },
    {
      "wrong": "～迄",
      "correct": "～まで",
      "reading": "まで",
      "group": "開く漢字"
    },
    {
      "wrong": "身に付く",
      "correct": "身につく",
      "reading": "みにつく",
      "group": "開く漢字"
    },
    {
      "wrong": "むずい",
      "correct": "ムズい",
      "reading": "ムズい",
      "group": "カタカナ"
    },
    {
      "wrong": "勿論",
      "correct": "もちろん",
      "reading": "もちろん",
      "group": "開く漢字"
    },
    {
      "wrong": "やばい",
      "correct": "ヤバい",
      "reading": "ヤバい",
      "group": "カタカナ"
    },
    {
      "wrong": "やり易い",
      "correct": "やりやすい",
      "reading": "やりやすい",
      "group": "開く漢字"
    },
    {
      "wrong": "宜しく",
      "correct": "よろしく",
      "reading": "よろしく",
      "group": "開く漢字"
    },
    {
      "wrong": "ライン",
      "correct": "LINE",
      "reading": "ライン",
      "group": "サービス名"
    },
    {
      "wrong": "loom",
      "correct": "Loom",
      "reading": "ルーム",
      "group": "ツール名"
    },
    {
      "wrong": "分かる／分かり／分から",
      "correct": "わかる／わかり／わから",
      "reading": "わかる",
      "group": "開く漢字"
    },
    {
      "wrong": "ｗｗｗ",
      "correct": "www",
      "reading": "わらい",
      "group": "記号"
    },
    {
      "wrong": "割と",
      "correct": "わりと",
      "reading": "わりと",
      "group": "開く漢字"
    },
    {
      "wrong": "食べ物がうまい",
      "correct": "美味い",
      "reading": "うまい",
      "group": "閉じる漢字"
    },
    {
      "wrong": "勿体ない",
      "correct": "もったいない",
      "reading": "もったいない",
      "group": "開く漢字"
    },
    {
      "wrong": "～し辛い",
      "correct": "～しづらい",
      "reading": "しづらい",
      "group": "開く漢字"
    },
    {
      "wrong": "既に",
      "correct": "すでに",
      "reading": "すでに",
      "group": "開く漢字"
    },
    {
      "wrong": "企業家",
      "correct": "起業家",
      "reading": "きぎょうか",
      "group": "同音異義"
    },
    {
      "wrong": "事",
      "correct": "こと",
      "reading": "こと",
      "group": "開く漢字"
    },
    {
      "wrong": "抽象的な「上で」",
      "correct": "うえで",
      "reading": "うえで",
      "group": "使い分け"
    },
    {
      "wrong": "物理的な位置",
      "correct": "上",
      "reading": "うえ",
      "group": "使い分け"
    },
    {
      "wrong": "売り上げ",
      "correct": "売上",
      "reading": "うりあげ",
      "group": "使い分け",
      "note": "動詞の「売り上げる」は送り仮名あり"
    },
    {
      "wrong": "越える",
      "correct": "場所・時間・区切りを通過",
      "reading": "こえる",
      "group": "使い分け"
    },
    {
      "wrong": "超える",
      "correct": "数値・基準・限度を上回る",
      "reading": "こえる",
      "group": "使い分け"
    },
    {
      "wrong": "死／殺",
      "correct": "伏せ字にしない",
      "reading": "し／さつ",
      "group": "使い分け"
    },
    {
      "wrong": "たしかに",
      "correct": "確かに",
      "reading": "たしかに",
      "group": "分割編集シート"
    },
    {
      "wrong": "～な方",
      "correct": "～なほう",
      "reading": "ほう",
      "group": "分割編集シート"
    },
    {
      "wrong": "～を付ける",
      "correct": "～をつける",
      "reading": "つける",
      "group": "分割編集シート"
    },
    {
      "wrong": "～のとき",
      "correct": "～の時",
      "reading": "とき",
      "group": "分割編集シート"
    },
    {
      "wrong": "かわいい",
      "correct": "可愛い",
      "reading": "かわいい",
      "group": "分割編集シート"
    }
  ],
  "conflicts": [
    {
      "id": "X01",
      "title": "矛盾1：演出頻度",
      "severity": "high",
      "points": [
        "演出・よくあるミス：6秒に1回",
        "提出前チェック：10秒に1回"
      ],
      "status": "どちらを正式基準にするか未決定です。",
      "action": "勝手に統一せず、ディレクターへ確認してください。"
    },
    {
      "id": "X02",
      "title": "矛盾2：提出方法",
      "severity": "high",
      "points": [
        "提出シート冒頭：Frame.ioへ統一",
        "チェック：YouTube限定公開を提出",
        "提出シート後半：限定公開手順が残存",
        "修正：限定公開の概要欄を使用"
      ],
      "status": "4箇所で記載が衝突しています。",
      "action": "冒頭のFrame.io統一方針と衝突するため、正式ルールとして統合しないでください。"
    },
    {
      "id": "X03",
      "title": "記載不整合：音声エフェクトの数",
      "severity": "medium",
      "points": [
        "現行マニュアル冒頭では3種類のみ列挙",
        "後から4種類目（ステレオエクスパンダー）が登場"
      ],
      "status": "列挙数と実際の手順が一致していません。",
      "action": "実際は4種類として扱い、ディレクターへ確認してください。"
    },
    {
      "id": "X04",
      "title": "手順番号の重複：グリーンバック",
      "severity": "low",
      "points": [
        "現行マニュアルでは手順番号④が重複しています。"
      ],
      "status": "番号が重複しています。",
      "action": "手順の順序自体は Lumetriカラー → Ultraキー → カラーマット → チョーク → マスク → スピル です。"
    },
    {
      "id": "X05",
      "title": "SEの指数フェード：ルールの混同注意",
      "severity": "medium",
      "points": [
        "SEそのものへ指数フェードを入れない",
        "クリックノイズ対策では、コンスタントパワーから指数フェードへ切り替える"
      ],
      "status": "別々のルールですが混同しやすい記載です。",
      "action": "対象が違います。SE本体には入れず、クリックノイズ対策の切り替えとは区別してください。"
    }
  ],
  "needsConfirmation": [
    {
      "id": "Q01",
      "text": "Google AI StudioとVrewへ、顧客情報や未公開素材を入力してよいかのルールは記載されていません。",
      "label": "要確認"
    },
    {
      "id": "Q02",
      "text": "ChatGPTやGeminiでのAI高画質化について、画像内容が変化する可能性や、顧客素材を入力してよいかのルールはありません。",
      "label": "要確認"
    },
    {
      "id": "Q03",
      "text": "見出し作成でAIへ入力してよい案件情報の範囲は要確認です。",
      "label": "要確認"
    }
  ],
  "accidentMap": [
    {
      "id": "A01",
      "title": "マルチカメラで音声までカメラ切り替えされる",
      "ruleType": "official",
      "cause": "音声トラックをネストしてしまった。",
      "accident": "カメラを切り替えたときに、音声まで別カメラの音へ切り替わる。",
      "prevention": "音声トラックはネストしない。映像だけV1・V2・V3をそれぞれネストし、さらにネストする。",
      "finalCheck": "カメラ切り替え箇所で音声が途切れたり音質が変わっていないか、イヤホンで通し確認する。"
    },
    {
      "id": "A02",
      "title": "サブシーケンス挿入で必要なクリップが消える",
      "ruleType": "official",
      "cause": "トラックターゲットを間違えたまま「上書き」を実行した。",
      "accident": "既存の必要なクリップが上書きされて消える。",
      "prevention": "挿入前にタイムラインのトラックターゲットを必ず確認する。「ネストとして、または個別クリップとしてシーケンスを挿入または上書き」はOFFにする。",
      "finalCheck": "挿入直後に、対象範囲のクリップが欠けていないかタイムラインで目視確認する。"
    },
    {
      "id": "A03",
      "title": "素材不備が納期直前に発覚する",
      "ruleType": "official",
      "cause": "素材確認を最初に行わなかった。挨拶や締めの欠落に気づかなかった。",
      "accident": "納期直前に素材不足が判明し、対応できない。",
      "prevention": "工程0で素材確認を完了させる。未共有素材は遅くともカット完了時に報告する。",
      "finalCheck": "【素材不備の可能性の連絡】または「素材確認済みです」のどちらかを送信済みか確認する。"
    },
    {
      "id": "A04",
      "title": "無言の権限申請でクライアントが混乱する",
      "ruleType": "official",
      "cause": "クライアント管理のスプレッドシートで「アクセス権限をリクエスト」を無断で押した。",
      "accident": "クライアントに不信感や混乱を与える。",
      "prevention": "フロントディレクターへ連絡し、自分のメールアドレスも伝え、ディレクターから先方へ確認・招待してもらう。",
      "finalCheck": "権限が必要になったとき、リクエストボタンを押す前にディレクターへ連絡したか確認する。"
    },
    {
      "id": "A05",
      "title": "フレームずれが残ったまま提出する",
      "ruleType": "official",
      "cause": "FrameDetectorのFrame 1だけチェックし、Frame 2を確認しなかった。",
      "accident": "フレームずれが5箇所以上でレベルマイナス（-5点）。",
      "prevention": "FrameDetectorでFrame 1とFrame 2の両方をcheckし、付いたマーカー箇所をすべて修正する。",
      "finalCheck": "提出前チェックリストの「FrameDetectorでフレームずれを0にした」にチェックが入っているか確認する。"
    },
    {
      "id": "A06",
      "title": "画面が見切れたまま提出する",
      "ruleType": "official",
      "cause": "透明グリッドでの見切れ確認を省略した。",
      "accident": "素材の上下左右が切れた状態で納品される。",
      "prevention": "フル画質横のスパナ →「透明グリッド」で、見切れ部分がシマシマになっていないか確認する（必ず行うルール）。",
      "finalCheck": "提出前チェックリストの「画面見切れがない」を確認する。"
    },
    {
      "id": "A07",
      "title": "固有名詞を間違えたまま提出する",
      "ruleType": "official",
      "cause": "聞こえたまま見切り発車で書いた。Wikipediaだけを根拠にした。",
      "accident": "固有名詞ミスが累計7箇所以上でレベルマイナス（-5点）。クライアントの信用低下。",
      "prevention": "人物名・企業名・団体名・専門用語・熟語・慣用句は公式サイトなどで裏取りする。分からない場合はディレクターへ報告する。",
      "finalCheck": "提出前チェックリストの「固有名詞をすべて裏取りした」を確認する。"
    },
    {
      "id": "A08",
      "title": "BGMが書き出し後に消えている",
      "ruleType": "official",
      "cause": "リミックス処理後の書き出し結果を確認しなかった。",
      "accident": "納品動画にBGMが入っていない。",
      "prevention": "リミックスはPremiere Proが重くなりやすいため最後に行い、書き出し後に音が消えていないか確認する。",
      "finalCheck": "書き出したmp4をイヤホンで再生し、BGMとエンディングの重なりを確認する。"
    },
    {
      "id": "A09",
      "title": "納期にアップロード時間が入っていない",
      "ruleType": "official",
      "cause": "編集完了時刻だけを納期の基準にした。",
      "accident": "「編集は終わったが、アップロードで納期を超える」状態になる。納期遅延はレベルマイナス（-5点）。",
      "prevention": "アップロードや書き出し時間も納期へ含めて逆算する。複数工程を同時に行わず1工程ずつ進める。",
      "finalCheck": "納期の何時間前に書き出しを開始するか、着手時点で決めておく。"
    },
    {
      "id": "A10",
      "title": "納期遅延を事後報告してしまう",
      "ruleType": "official",
      "cause": "間に合わせようとして、連絡を先延ばしにした。",
      "accident": "事後報告は禁止されている。依頼者側が代替手段を取れない。",
      "prevention": "間に合わない可能性が出た時点で依頼者へ連絡する。調整後の納期が分かる場合は同時に伝える。",
      "finalCheck": "納期に間に合わないと分かった瞬間に連絡したか確認する。"
    },
    {
      "id": "A11",
      "title": "カット修正で全体がずれる",
      "ruleType": "official",
      "cause": "カット修正を最初に行った。",
      "accident": "テロップ・SE・画像などの位置がすべてずれる。",
      "prevention": "カット修正は時間がずれるため最後に行う。",
      "finalCheck": "修正後に指示箇所以外も含めて動画全体を再チェックする。"
    },
    {
      "id": "A12",
      "title": "切り抜きを作り直しになる",
      "ruleType": "official",
      "cause": "クライアントOV前に切り抜きを制作した。修正前素材を使用した。",
      "accident": "本編修正が入り、切り抜きがすべて作り直しになる。",
      "prevention": "クライアント承認後の完成mp4で切り抜きを制作する。",
      "finalCheck": "納品前チェックの「クライアント承認後素材を使用」を確認する。"
    },
    {
      "id": "A13",
      "title": "個人情報が映ったまま公開される",
      "ruleType": "improvement",
      "cause": "車のナンバー、モニター、鏡、窓の反射、スマートフォン画面、テーブル上の書類などを見落とした。",
      "accident": "プライバシー侵害や炎上につながる。",
      "prevention": "「ブラー（ガウス）100」「マスク境界線のぼかし40」で処理する。見落としやすい場所を重点的に確認する。",
      "finalCheck": "※現行の正式チェックリストにモザイク確認項目はありません。改善候補として別管理してください。"
    },
    {
      "id": "A14",
      "title": "素材のライセンス違反",
      "ruleType": "improvement",
      "cause": "利用条件を確認せずに画像・BGM・SEを使用した。引用元URLを共有しなかった。",
      "accident": "権利侵害。動画の削除や警告。",
      "prevention": "DOVA-SYNDROME・効果音ラボ、写真AC・Adobe Stock・いらすとや・ぱくたそ 以外を使う場合は引用元URLをディレクターへ送る。必ず利用条件を確認する。",
      "finalCheck": "※ライセンス証跡の保管は現行提出前チェックにありません。改善候補です。"
    },
    {
      "id": "A15",
      "title": "AIへ入れてはいけない情報を入力する",
      "ruleType": "improvement",
      "cause": "Google AI Studio・Vrew・ChatGPT・Geminiへ、顧客情報や未公開素材を入力した。",
      "accident": "情報漏えいの可能性。",
      "prevention": "AIへ入力してよい案件情報の範囲を、使用前にディレクターへ確認する。",
      "finalCheck": "※現行マニュアルにAI入力可否のルールの記載はありません。「要確認」です。"
    },
    {
      "id": "A16",
      "title": "保存データの紛失",
      "ruleType": "improvement",
      "cause": "外部SSDの暗号化・バックアップ・紛失対策をしていない。",
      "accident": "1年間保存すべきプロマネと素材を失う。情報漏えいの可能性。",
      "prevention": "暗号化とバックアップの運用を決める。",
      "finalCheck": "※暗号化・バックアップ・紛失対策は現行マニュアルにありません。改善候補です。"
    }
  ],
  "templates": [
    {
      "id": "T01",
      "title": "進捗報告",
      "category": "報告",
      "purpose": "毎日21時までにディレクターへ送る。曖昧な割合ではなく、誰が読んでも同じ意味になる数字を使う。",
      "body": "【進捗報告】\n\n・○月○日納期：案件名\n\n・進捗：具体的な完了位置\n\n・明日の進行予定：何をどこまで完了させるか\n\n・プロマネ：URL",
      "ng": [
        "カット8割終わっています",
        "テロップがだいたい終わりそうです"
      ],
      "ok": [
        "20分中15分まで細カットが終わっています",
        "20分中18分まで通常テロップが終わっています"
      ],
      "extra": "プロマネURLを記載する理由は、急な事情があっても他の人が引き継げる状態にするためです。"
    },
    {
      "id": "T02",
      "title": "編集者への依頼",
      "category": "依頼",
      "purpose": "編集者へ案件を依頼するときに使う。",
      "body": "@編集者\n\n【依頼】\n\nお世話になっております。\n下記案件のご対応をお願いいたします。\n\n■初稿納期\n○月○日\n\n■素材\nURL\n\n■編集マニュアル\nURL\n\n■案件独自マニュアル\nURL\n\n■編集者専用マニュアル\nURL\n\n■プロマネ\nURL\n\n■注意事項\n内容"
    },
    {
      "id": "T03",
      "title": "着手報告",
      "category": "報告",
      "purpose": "編集に着手したことを伝える。",
      "body": "【着手報告】\n\n○月○日公開予定\n動画タイトル\n\n本日より着手いたします。\n\n○月○日○時までに初校共有予定です。\n\n※返信不要です"
    },
    {
      "id": "T04",
      "title": "クライアントへの進捗報告",
      "category": "報告",
      "purpose": "クライアントへ進捗を伝える。",
      "body": "【進捗報告】\n\n○月○日○時公開予定\n動画タイトル\n\n○日○時までに初校共有予定です。\n\n※返信不要です"
    },
    {
      "id": "T05",
      "title": "提出連絡 / 修正提出連絡",
      "category": "提出",
      "purpose": "初稿または修正版を提出するときに使う。管理シートにはmp4と素材抜きプロマネも格納する。",
      "body": "【提出連絡】または【修正提出連絡】\n\nお世話になっております。\n\n○月○日投稿予定／○月○日先方提出予定\n動画タイトルの初稿、または修正○回目を提出いたします。\n\nご確認のほどよろしくお願いいたします。\n\n▼動画確認リンク\n\n▼動画ダウンロードURL\n\n▼プロマネ\n\n▼管理シート"
    },
    {
      "id": "T06",
      "title": "トラブル報告",
      "category": "トラブル",
      "purpose": "結論から簡潔に書く。先方へ送る前に、社内の指定責任者へ連絡する。",
      "body": "お世話になっております。\nこの度はご迷惑をおかけし、大変申し訳ございません。\n\n■本件の概要\n何が起きたか\n\n■発生理由・背景\nなぜ起きたか\n\n■現在実行している対応策\n対応内容と現在の状態\n\n■再発防止策\n注意するだけではなく、仕組みとして防ぐ方法を記載します。",
      "ng": [
        "以後気を付けます（だけの記載は禁止）"
      ],
      "extra": "復旧確率が100%でない場合は、第2・第3の対応策も用意します。"
    },
    {
      "id": "T07",
      "title": "修正確認依頼",
      "category": "修正",
      "purpose": "修正版の確認を依頼する。",
      "body": "【修正確認依頼】\n\n○月○日○時公開予定\n動画タイトル\n\n■確認用リンク\n\n以下、修正事項\n概要欄のタイムコードから修正箇所へ移動できます。\n\n■動画ダウンロードURL\n\n公開承認または修正指示をお願いいたします。",
      "extra": "※現行文面には限定公開の概要欄を使う説明が残っており、Frame.io方針と矛盾しています。"
    },
    {
      "id": "T08",
      "title": "修正着手報告",
      "category": "修正",
      "purpose": "修正指示を受けたら、無言で着手せず必ず返信する。",
      "body": "【着手報告】\n\nご確認いただきありがとうございます。\n\n修正へ着手いたします。\n\n○時○分を目安に提出予定です。"
    },
    {
      "id": "T09",
      "title": "素材受領（すぐ確認できる場合）",
      "category": "素材",
      "purpose": "素材を受け取り、すぐ確認できるとき。",
      "body": "素材共有ありがとうございます。\n\n今から素材確認を行い、不備がある場合はすぐにご連絡いたします。\n\n問題がなければ返信不要です。"
    },
    {
      "id": "T10",
      "title": "素材受領（すぐ確認できない場合）",
      "category": "素材",
      "purpose": "素材を受け取ったが、すぐ確認できないとき。曖昧な表現は使わず時刻を伝える。",
      "body": "素材共有ありがとうございます。\n\n現在すぐに確認できないため、○時までに確認いたします。\n\n確認に着手した際にも改めて連絡いたします。"
    },
    {
      "id": "T11",
      "title": "素材確認・不備なし",
      "category": "素材",
      "purpose": "素材に問題がなかったとき。",
      "body": "素材確認済みです。\n問題ありませんでしたので、○月○日納期で進行いたします。"
    },
    {
      "id": "T12",
      "title": "素材不備の可能性の連絡",
      "category": "素材",
      "purpose": "素材に不足がある可能性を伝える。理由と結論を書く。",
      "body": "【素材不備の可能性の連絡】\n\n案件名について、次の素材がない可能性があります。\n\n・不足内容\n・不足内容\n\n素材不備と判断した理由：\n\n結論：\n\nご確認をお願いいたします。"
    },
    {
      "id": "T13",
      "title": "公開設定後の報告",
      "category": "報告",
      "purpose": "公開設定が完了したことを伝える。",
      "body": "【報告】\n\n動画タイトル\n公開リンク\n\n本日19時に公開設定済みです。\n\n※返信不要です"
    },
    {
      "id": "T14",
      "title": "サムネイル確認",
      "category": "その他",
      "purpose": "サムネイルの確認を依頼する。記載する項目。",
      "body": "・公開予定日\n・サムネイル\n・承認または修正指示\n・参考デザイン"
    },
    {
      "id": "T15",
      "title": "サムネイル修正提出",
      "category": "その他",
      "purpose": "サムネイルの修正版を提出する。記載する項目。",
      "body": "・修正版を提出\n・承認または修正指示\n・修正がなければ返信不要"
    },
    {
      "id": "T16",
      "title": "新規依頼の一時停止",
      "category": "その他",
      "purpose": "新しい依頼の受付を止めるとき。記載する項目。",
      "body": "・受付停止期間\n・停止理由\n・既存案件は継続するか\n・再開予定\n・緊急対応の可否"
    },
    {
      "id": "T17",
      "title": "今後の案件受注を断る場合",
      "category": "その他",
      "purpose": "受注を断るとき。記載する項目。",
      "body": "・現在の業務状況\n・品質維持のための調整\n・既存案件は継続\n・相手への謝意"
    },
    {
      "id": "T18",
      "title": "リマインド",
      "category": "その他",
      "purpose": "返答がない相手へ丁寧に確認する。記載する項目。",
      "body": "・以前送った内容\n・回答期限\n・期限までなら従来納期で対応可能\n・期限を過ぎると納品が後ろ倒しになる可能性\n・丁寧な確認依頼"
    }
  ],
  "submissionTriad": {
    "note": "現行文面では、問題がない状態で次の3点を提出すると書かれています。",
    "items": [
      "YouTube限定公開",
      "素材抜きプロマネ",
      "mp4"
    ],
    "conflict": "しかし「提出」シート冒頭ではFrame.ioへ変更済みと書かれています。提出方法の矛盾です。",
    "directorPhrase": "チェックリストに記載されている項目は見つかりませんでした",
    "sheetAccess": [
      "リンクを知っている全員",
      "編集者"
    ]
  },
  "glossary": [
    {
      "term": "プロマネ",
      "reading": "ぷろまね",
      "desc": "プロジェクトマネージャーファイルのこと。編集ソフトの「作業内容そのもの」を保存したファイル。これを渡すと他の人が続きから編集できる。"
    },
    {
      "term": "ネスト",
      "reading": "ねすと",
      "desc": "複数のクリップを1つのまとまりにすること。あとで中身を差し替えやすくなる。"
    },
    {
      "term": "ケバ",
      "reading": "けば",
      "desc": "「えーと」「あのー」のような、意味のない言葉。取ると聞きやすくなるが、取りすぎると不自然になる。"
    },
    {
      "term": "子音",
      "reading": "しいん",
      "desc": "「か」の「k」の部分のような、母音以外の音。テロップは子音が鳴る1フレーム前に出すと自然に見える。"
    },
    {
      "term": "フレーム",
      "reading": "ふれーむ",
      "desc": "動画の1コマ。1秒間に約30コマある。1フレームずれるだけでも違和感になる。"
    },
    {
      "term": "セーフマージン",
      "reading": "せーふまーじん",
      "desc": "画面の端の「切れるかもしれない範囲」。この外に文字を置くと、機種によっては見えなくなる。"
    },
    {
      "term": "dB（デシベル）",
      "reading": "でしべる",
      "desc": "音の大きさの単位。0が最大で、マイナスが大きいほど音が小さい。-29dBは-6dBよりずっと小さい。"
    },
    {
      "term": "ハードリミッター",
      "reading": "はーどりみったー",
      "desc": "音がある大きさを超えないように、上限でカットする機能。音割れを防ぐ。"
    },
    {
      "term": "クリックノイズ",
      "reading": "くりっくのいず",
      "desc": "音のつなぎ目で「プツッ」と鳴る雑音。フェードの種類を変えると消せる。"
    },
    {
      "term": "グリーンバック",
      "reading": "ぐりーんばっく",
      "desc": "緑色の背景で撮影し、あとから緑を透明にして別の背景と合成する手法。"
    },
    {
      "term": "Ultraキー",
      "reading": "うるとらきー",
      "desc": "Premiere Proで、指定した色（緑など）を透明にする機能。"
    },
    {
      "term": "スピル",
      "reading": "すぴる",
      "desc": "グリーンバックの緑が人物に反射して、顔や髪が緑っぽくなる現象。スピル調整で緩和する。"
    },
    {
      "term": "マルチカメラ",
      "reading": "まるちかめら",
      "desc": "複数のカメラ映像を同期させ、ワンクリックで切り替えられるようにする機能。"
    },
    {
      "term": "サブシーケンス",
      "reading": "さぶしーけんす",
      "desc": "テロップ・SE・エフェクトなどをひとまとめに保存したもの。同じ演出を一括で入れられる。"
    },
    {
      "term": "トラックターゲット",
      "reading": "とらっくたーげっと",
      "desc": "タイムラインのどのトラックに挿入するかを指定する設定。間違えると既存のクリップが消える。"
    },
    {
      "term": "調整レイヤー",
      "reading": "ちょうせいれいやー",
      "desc": "下にあるすべての映像へまとめて効果をかけるための透明なレイヤー。"
    },
    {
      "term": "キーフレーム",
      "reading": "きーふれーむ",
      "desc": "「この時間にこの状態」と指定する点。2つ置くと、その間で動きが作られる。"
    },
    {
      "term": "アイキャッチ",
      "reading": "あいきゃっち",
      "desc": "場面の切り替わりに入れる短い映像や画像。話題の区切りを分かりやすくする。"
    },
    {
      "term": "ダイジェスト",
      "reading": "だいじぇすと",
      "desc": "動画の見どころを短くまとめた部分。冒頭に置いて続きを見たくさせる。"
    },
    {
      "term": "Frame.io",
      "reading": "ふれーむあいおー",
      "desc": "動画のレビュー用サービス。時間を指定してコメントを付けられる。2026年4月23日更新でここへ統一する方針。"
    },
    {
      "term": "ギガファイル便",
      "reading": "ぎがふぁいるびん",
      "desc": "大きなファイルを送る無料サービス。このマニュアルでは保存100日と記載されている。"
    },
    {
      "term": "FrameDetector",
      "reading": "ふれーむでぃてくたー",
      "desc": "フレームずれを見つけるツール（買い切り1,000円）。Frame 1とFrame 2の両方をチェックする。"
    },
    {
      "term": "Caption Fit",
      "reading": "きゃぷしょんふぃっと",
      "desc": "Vrewのテロップを映像の編集点に合わせる有料ツール（買い切り5,000円）。5フレーム以内のずれを補正する。"
    },
    {
      "term": "Vrew",
      "reading": "ぶりゅー",
      "desc": "AIで自動的に文字起こしをするソフト。テロップ作成を高速化できる。"
    },
    {
      "term": "開く漢字",
      "reading": "ひらくかんじ",
      "desc": "漢字をひらがなに直すこと。「全て」→「すべて」など。読みやすくするためのルール。"
    },
    {
      "term": "表記揺れ",
      "reading": "ひょうきゆれ",
      "desc": "同じ言葉なのに書き方がバラバラになること。「YouTube」と「Youtube」が混ざるなど。"
    },
    {
      "term": "体言止め",
      "reading": "たいげんどめ",
      "desc": "文の終わりを名詞で止める書き方。「これがコツです」→「これがコツ」。テロップが短くなる。"
    },
    {
      "term": "toC / toB",
      "reading": "とぅしー / とぅびー",
      "desc": "toCは一般の人向け、toBは企業向けのビジネスのこと。"
    },
    {
      "term": "セーフ/H.264",
      "reading": "えいちにーろくよん",
      "desc": "動画の圧縮方式のひとつ。ほとんどの端末で再生できるため、書き出しの標準として指定されている。"
    },
    {
      "term": "景品表示法",
      "reading": "けいひんひょうじほう",
      "desc": "広告で嘘や大げさな表現を禁止する法律。切り抜きのコピーでも断定表現に注意が必要。"
    }
  ]
};
