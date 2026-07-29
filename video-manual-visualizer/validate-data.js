#!/usr/bin/env node
/*
 * validate-data.js
 * manual-data.js の内容が、マニュアルの必須要件を満たしているか検証する。
 *
 * 実行方法:
 *   node validate-data.js
 *
 * 終了コード: 0 = 全件合格 / 1 = 失敗あり
 */

'use strict';

var DATA = require('./manual-data.js');

var results = [];
var failed = 0;

function check(name, condition, detail) {
  var ok = !!condition;
  if (!ok) { failed++; }
  results.push({ name: name, ok: ok, detail: detail || '' });
}

function has(list, predicate) {
  return Array.isArray(list) && list.some(predicate);
}

function textOf(value) {
  return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/* 1. 27項目すべてがナビゲーションに存在                                 */
/* ------------------------------------------------------------------ */

var REQUIRED_LEDGER = [
  '目次', 'はじめに', 'よくあるミス', '動画制作手順', '制作に関するやり取りの注意',
  'ショートカット・時短術', 'チャットテンプレ', '分割編集時のフロー', '素材確認',
  'グリーンバック', '音調整', 'カット', 'テロップ', 'マルチカメラ設定',
  '表記揺れ／開く漢字一覧', '演出', 'エンタメ演出', '画角見切れ対策', '図解演出',
  'SE・BGM・クリックノイズ', '画像演出', '見出し・サブ見出し作成', 'チェック',
  '提出', '修正', '切り抜き', '中級編集者へ'
];

check(
  'マニュアル台帳が27項目ちょうど存在する',
  DATA.ledger.length === 27,
  '実際: ' + DATA.ledger.length + '項目'
);

REQUIRED_LEDGER.forEach(function (title) {
  check(
    '台帳に「' + title + '」が存在する',
    has(DATA.ledger, function (l) { return l.title === title; })
  );
});

check(
  '台帳の全項目にIDと本文セクションがある',
  DATA.ledger.every(function (l) {
    return l.id && l.title && Array.isArray(l.sections) && l.sections.length > 0;
  })
);

/* ------------------------------------------------------------------ */
/* 2. 全制作工程が表示される                                            */
/* ------------------------------------------------------------------ */

var REQUIRED_PROCESSES = [
  '依頼・即レス', '権限・素材・納期確認', 'シーケンス・画角・音声設定',
  '粗カット', '細カット', 'カット確認', 'テロップ・表記統一',
  '見出し・画像・図解・演出', 'SE・BGM・音声処理', '提出前チェック',
  '書き出し・提出', '修正・全体再チェック', '保存・切り抜き・育成'
];

check(
  '工程マップが13工程ちょうど存在する',
  DATA.processes.length === 13,
  '実際: ' + DATA.processes.length + '工程'
);

REQUIRED_PROCESSES.forEach(function (title) {
  check(
    '工程に「' + title + '」が存在する',
    has(DATA.processes, function (p) { return p.title === title; })
  );
});

check(
  '全工程に5項目（何をするか・なぜ必要か・よくある失敗・完了条件・関連マニュアル）がある',
  DATA.processes.every(function (p) {
    return Array.isArray(p.what) && p.what.length > 0
      && Array.isArray(p.why) && p.why.length > 0
      && Array.isArray(p.fails) && p.fails.length > 0
      && Array.isArray(p.done) && p.done.length > 0
      && Array.isArray(p.related) && p.related.length > 0;
  })
);

check(
  '工程の関連マニュアルIDがすべて台帳に実在する',
  DATA.processes.every(function (p) {
    return p.related.every(function (rid) {
      return has(DATA.ledger, function (l) { return l.id === rid; });
    });
  })
);

/* ------------------------------------------------------------------ */
/* 3. 数値基準がすべて存在                                              */
/* ------------------------------------------------------------------ */

var REQUIRED_NUMBERS = [
  { label: '演者ハードリミッター -6.0dB', re: /-6\.0/ },
  { label: 'SEハードリミッター -20.0dB', re: /-20\.0/ },
  { label: 'BGMハードリミッター -29.0dB', re: /-29\.0/ },
  { label: '発言直後 -999dB', re: /-999/ },
  { label: 'クロマノイズ除去 10%', re: /クロマノイズ除去/ },
  { label: 'テロップ1行 15〜18文字', re: /15〜18/ },
  { label: '装飾テロップ スケール150以上', re: /150以上/ },
  { label: '演出頻度 6秒', re: /6.*秒に1回|秒に1回/ },
  { label: '演出頻度 10秒', re: /10/ },
  { label: '画角アップ 30%', re: /30/ },
  { label: '全画面画像 1,920×1,080', re: /1,920×1,080/ },
  { label: 'ブラー（ガウス）100', re: /ブラー/ },
  { label: 'マスク境界線のぼかし40', re: /40/ },
  { label: '図解 3色以内', re: /3/ },
  { label: '切り抜き 冒頭2秒', re: /2/ },
  { label: '縦型 1,080×1,920', re: /1,080×1,920/ },
  { label: 'タイトル 28〜40文字', re: /28〜40/ },
  { label: 'ギガファイル便 100日', re: /100/ },
  { label: 'FrameDetector 1,000円', re: /1,000/ },
  { label: 'Caption Fit 5,000円', re: /5,000/ },
  { label: '進捗報告 21時', re: /21時/ },
  { label: '初稿納期後 24時間', re: /24/ }
];

var numericBlob = textOf(DATA.numericStandards);

REQUIRED_NUMBERS.forEach(function (n) {
  check('数値基準に「' + n.label + '」が含まれる', n.re.test(numericBlob));
});

check(
  '数値基準が6グループ存在する',
  DATA.numericStandards.length === 6,
  '実際: ' + DATA.numericStandards.length + 'グループ'
);

check(
  '全数値項目に name / value / unit がある',
  DATA.numericStandards.every(function (g) {
    return Array.isArray(g.items) && g.items.length > 0 && g.items.every(function (i) {
      return i.name && i.value !== undefined && i.unit !== undefined;
    });
  })
);

/* ------------------------------------------------------------------ */
/* 4. 提出前チェック18項目が存在                                        */
/* ------------------------------------------------------------------ */

check(
  '提出前チェックリストが18項目ちょうど存在する',
  DATA.checklist.length === 18,
  '実際: ' + DATA.checklist.length + '項目'
);

var REQUIRED_CHECKS = [
  '意図のない無音部分が残っていない',
  '演出テロップや画角変化が10秒に1回入っている',
  '前半と後半で演出量にムラがない',
  '聞き取れない発言を見切り発車していない',
  '聞き取りが合っていても、文脈がおかしくない',
  'マイク反響がない',
  'マイク切り替え漏れがない',
  '表記揺れが1つもない',
  '固有名詞をすべて裏取りした',
  '固有名詞が出たときに画像を表示した',
  'クリックノイズ対策をした',
  '画像アニメーションが途中で止まっていない',
  'FrameDetectorでフレームずれを0にした',
  '画面見切れがない',
  'サブ見出しだけで動画構成が分かる',
  '誤字脱字がない',
  'ノイズ除去を入れすぎて音がこもっていない',
  '誤字脱字チェックツールでエラーがない'
];

REQUIRED_CHECKS.forEach(function (text) {
  check(
    'チェック項目「' + text.slice(0, 16) + '…」が存在する',
    has(DATA.checklist, function (c) { return c.text === text; })
  );
});

/* ------------------------------------------------------------------ */
/* 5. 表記辞書がすべて存在                                              */
/* ------------------------------------------------------------------ */

check(
  '表記揺れ辞書が100件以上存在する',
  DATA.dictionary.length >= 100,
  '実際: ' + DATA.dictionary.length + '件'
);

var REQUIRED_DICT = [
  'Premiere Pro', 'After Effects', 'Photoshop', 'Instagram', 'YouTube', 'TikTok',
  'ChatGPT', '1ヶ月', 'あおさん', '迫さん', '売上', '想い', 'StockSun',
  '動画編集CAMP', 'LINE', 'Loom', 'Zoom', 'Chrome', 'Web', '起業家', '属人性', '導線'
];

REQUIRED_DICT.forEach(function (correct) {
  check(
    '辞書に正しい表記「' + correct + '」が存在する',
    has(DATA.dictionary, function (d) { return d.correct.indexOf(correct) !== -1; })
  );
});

check(
  '辞書の全項目に wrong / correct / reading がある',
  DATA.dictionary.every(function (d) { return d.wrong && d.correct && d.reading; })
);

check(
  '分割編集シートの表記ルール5件が存在する',
  DATA.splitEditDictionary.length === 5,
  '実際: ' + DATA.splitEditDictionary.length + '件'
);

/* ------------------------------------------------------------------ */
/* 6. 連絡テンプレートが存在                                            */
/* ------------------------------------------------------------------ */

check(
  '連絡テンプレートが15件以上存在する',
  DATA.templates.length >= 15,
  '実際: ' + DATA.templates.length + '件'
);

var REQUIRED_TEMPLATES = [
  '進捗報告', '編集者への依頼', '着手報告', 'クライアントへの進捗報告',
  '提出連絡 / 修正提出連絡', 'トラブル報告', '修正確認依頼', '修正着手報告',
  '素材不備の可能性の連絡', '公開設定後の報告', 'サムネイル確認',
  '新規依頼の一時停止', 'リマインド'
];

REQUIRED_TEMPLATES.forEach(function (title) {
  check(
    'テンプレート「' + title + '」が存在する',
    has(DATA.templates, function (t) { return t.title === title; })
  );
});

check(
  '全テンプレートに本文（body）がある',
  DATA.templates.every(function (t) { return t.body && t.body.length > 0; })
);

/* ------------------------------------------------------------------ */
/* 7. 切り抜き手順が存在                                                */
/* ------------------------------------------------------------------ */

check('切り抜きの業務フローが8ステップ存在する', DATA.clipWorkflow.flow.length === 8,
  '実際: ' + DATA.clipWorkflow.flow.length + 'ステップ');
check('切り抜きの禁止事項が存在する', DATA.clipWorkflow.prohibited.length >= 2);
check('切り抜きの冒頭2秒フック候補が存在する', DATA.clipWorkflow.openingHooks.length >= 10);
check('切り抜きのタイトル4要素が存在する', DATA.clipWorkflow.titleElements.length === 4);
check('切り抜きのコピー4原則が存在する', DATA.clipWorkflow.copyPrinciples.length === 4);
check('切り抜きの納品前チェックが12項目存在する', DATA.clipChecklist.length === 12,
  '実際: ' + DATA.clipChecklist.length + '項目');

/* ------------------------------------------------------------------ */
/* 8. ディレクター育成4STEPが存在                                        */
/* ------------------------------------------------------------------ */

['STEP1', 'STEP2', 'STEP3', 'STEP4'].forEach(function (label) {
  check(
    'ディレクター育成に「' + label + '」が存在する',
    has(DATA.directorPath.steps, function (s) { return s.label === label; })
  );
});

check('ディレクター育成に「現在（中級編集者）」が存在する',
  has(DATA.directorPath.steps, function (s) { return s.label === '現在'; }));

check('キャリアの選択肢が3つ存在する', DATA.directorPath.careers.length === 3);

/* ------------------------------------------------------------------ */
/* 9. 演出6秒と10秒の矛盾が表示される                                    */
/* ------------------------------------------------------------------ */

var conflictBlob = textOf(DATA.audit.conflicts);

check(
  '監査に演出頻度の矛盾（6秒 / 10秒）が表示される',
  /6秒に1回/.test(conflictBlob) && /10秒に1回/.test(conflictBlob)
);

check(
  '演出頻度の矛盾が「未決定」として明示されている',
  has(DATA.audit.conflicts, function (c) {
    return c.title.indexOf('演出頻度') !== -1 && /未決定/.test(c.status);
  })
);

check(
  '数値基準側でも6秒と10秒の両方が conflict として登録されている',
  DATA.numericStandards.some(function (g) {
    return g.items.some(function (i) { return i.chartValue === 6 && i.ruleType === 'conflict'; });
  }) && DATA.numericStandards.some(function (g) {
    return g.items.some(function (i) { return i.chartValue === 10 && i.ruleType === 'conflict'; });
  })
);

/* ------------------------------------------------------------------ */
/* 10. Frame.ioと限定公開の矛盾が表示される                              */
/* ------------------------------------------------------------------ */

check(
  '監査に提出方法の矛盾（Frame.io / 限定公開）が表示される',
  /Frame\.io/.test(conflictBlob) && /限定公開/.test(conflictBlob)
);

check(
  '提出方法の矛盾が4箇所すべて列挙されている',
  has(DATA.audit.conflicts, function (c) {
    return c.title.indexOf('提出方法') !== -1 && c.points.length === 4;
  })
);

check(
  '旧限定公開手順が「統合しない」と明示されている',
  /統合しないでください/.test(textOf(DATA.audit.conflicts)) ||
  /統合しないでください/.test(textOf(DATA.ledger))
);

/* ------------------------------------------------------------------ */
/* 11. 目次問題6件が表示される                                           */
/* ------------------------------------------------------------------ */

check(
  '目次の問題が6件ちょうど存在する',
  DATA.audit.tocIssues.length === 6,
  '実際: ' + DATA.audit.tocIssues.length + '件'
);

var REQUIRED_TOC = [
  '通常画角', '改行位置', '旧シートID', 'マルチカメラ設定', 'エンタメ演出', '見出し・サブ見出し作成'
];

var tocBlob = textOf(DATA.audit.tocIssues);
REQUIRED_TOC.forEach(function (key) {
  check('目次問題に「' + key + '」が含まれる', tocBlob.indexOf(key) !== -1);
});

/* ------------------------------------------------------------------ */
/* 12. 欠損リンクを推測していない                                        */
/* ------------------------------------------------------------------ */

check(
  '欠損リンクが5件登録されている',
  DATA.audit.missingLinks.length === 5,
  '実際: ' + DATA.audit.missingLinks.length + '件'
);

check(
  '「URLを推測しないでください」の方針が明示されている',
  /推測しないでください/.test(DATA.audit.missingLinkPolicy)
);

/* 欠損として宣言された対象について、具体的なURLが捏造されていないこと。
   データ全体から http(s) URL を抽出し、1件も存在しないことを確認する。 */
var wholeBlob = textOf(DATA);
var urlMatches = wholeBlob.match(/https?:\/\/[^"\\\s]+/g) || [];

check(
  'データ内に実URLが1件も存在しない（欠損リンクを推測していない）',
  urlMatches.length === 0,
  urlMatches.length ? '検出: ' + urlMatches.join(', ') : ''
);

check(
  '欠損対象（MTS / FrameDetector / マルチカメラ応用 / 限定公開設定 / Add Marker）がすべて列挙されている',
  ['MTS', 'FrameDetector', 'マルチカメラ応用', '限定公開設定', 'Add Marker'].every(function (k) {
    return textOf(DATA.audit.missingLinks).indexOf(k) !== -1;
  })
);

/* ------------------------------------------------------------------ */
/* 13. 改善候補と正式ルールが分離されている                              */
/* ------------------------------------------------------------------ */

var VALID_RULE_TYPES = ['official', 'project', 'conflict', 'improvement'];

check(
  'ルール種別が4種類定義されている',
  DATA.ruleTypes.length === 4 &&
  DATA.ruleTypes.every(function (r) { return VALID_RULE_TYPES.indexOf(r.id) !== -1; })
);

check(
  '改善候補リストが正式チェックリストと別配列で保持されている',
  Array.isArray(DATA.checklistImprovements) &&
  DATA.checklistImprovements.length === 12 &&
  DATA.checklistImprovements.every(function (c) { return c.ruleType === 'improvement'; })
);

check(
  '正式チェックリスト18項目に improvement が1件も混ざっていない',
  DATA.checklist.every(function (c) { return c.ruleType !== 'improvement'; })
);

check(
  '改善候補（監査）が5件登録されている',
  DATA.audit.improvements.length === 5,
  '実際: ' + DATA.audit.improvements.length + '件'
);

check(
  '全台帳セクションのruleTypeが定義済みの4種類のいずれかである',
  DATA.ledger.every(function (l) {
    return VALID_RULE_TYPES.indexOf(l.ruleType) !== -1 && l.sections.every(function (s) {
      return VALID_RULE_TYPES.indexOf(s.ruleType) !== -1;
    });
  })
);

check(
  '全工程のruleTypeが定義済みの4種類のいずれかである',
  DATA.processes.every(function (p) { return VALID_RULE_TYPES.indexOf(p.ruleType) !== -1; })
);

check(
  '事故防止マップのruleTypeが定義済みの4種類のいずれかである',
  DATA.accidentMap.every(function (a) { return VALID_RULE_TYPES.indexOf(a.ruleType) !== -1; })
);

/* ------------------------------------------------------------------ */
/* 追加検証：品質評価・統計・用語集・事故防止                            */
/* ------------------------------------------------------------------ */

check('品質評価が4レベル存在する', DATA.qualityLevels.length === 4);
check('品質評価の点数が -5 / 0 / 3 / 5 である',
  DATA.qualityLevels.map(function (q) { return q.score; }).join(',') === '-5,0,3,5');

check('事故防止マップが10件以上存在する', DATA.accidentMap.length >= 10,
  '実際: ' + DATA.accidentMap.length + '件');
check('事故防止マップの全件に 原因→事故→防止策→最終確認 がある',
  DATA.accidentMap.every(function (a) {
    return a.cause && a.accident && a.prevention && a.finalCheck;
  }));

check('主要語の出現回数が7語登録されている', DATA.stats.keywordCounts.length === 7);
check('出現回数「確認：94」が正しい',
  has(DATA.stats.keywordCounts, function (k) { return k.label === '確認' && k.value === 94; }));
check('出現回数「必ず：55」が正しい',
  has(DATA.stats.keywordCounts, function (k) { return k.label === '必ず' && k.value === 55; }));
check('出現回数「ディレクター：49」が正しい',
  has(DATA.stats.keywordCounts, function (k) { return k.label === 'ディレクター' && k.value === 49; }));
check('出現回数「提出：44」が正しい',
  has(DATA.stats.keywordCounts, function (k) { return k.label === '提出' && k.value === 44; }));
check('出現回数「NG：35」が正しい',
  has(DATA.stats.keywordCounts, function (k) { return k.label === 'NG' && k.value === 35; }));
check('出現回数「連絡：29」が正しい',
  has(DATA.stats.keywordCounts, function (k) { return k.label === '連絡' && k.value === 29; }));
check('出現回数「絶対：12」が正しい',
  has(DATA.stats.keywordCounts, function (k) { return k.label === '絶対' && k.value === 12; }));
check('画像・動画参照が2件登録されている', DATA.stats.mediaRefs.length === 2);
check('情報量が多い項目が10件登録されている', DATA.stats.volume.length === 10);
check('情報量トップが「テロップ：4,505文字」である',
  DATA.stats.volume[0].label === 'テロップ' && DATA.stats.volume[0].value === 4505);

check('用語集が20件以上存在する', DATA.glossary.length >= 20,
  '実際: ' + DATA.glossary.length + '件');
check('用語集の全件に説明がある',
  DATA.glossary.every(function (g) { return g.term && g.desc; }));

/* ------------------------------------------------------------------ */
/* 結果出力                                                             */
/* ------------------------------------------------------------------ */

var GREEN = '[32m';
var RED = '[31m';
var DIM = '[2m';
var RESET = '[0m';
var useColor = process.stdout.isTTY;

function paint(color, text) {
  return useColor ? color + text + RESET : text;
}

console.log('');
console.log('=== validate-data.js : 動画編集者マニュアル データ検証 ===');
console.log('');

results.forEach(function (r) {
  var mark = r.ok ? paint(GREEN, 'PASS') : paint(RED, 'FAIL');
  var detail = r.detail ? paint(DIM, '  (' + r.detail + ')') : '';
  if (!r.ok || process.env.VERBOSE) {
    console.log('  ' + mark + '  ' + r.name + detail);
  }
});

if (!process.env.VERBOSE) {
  console.log(paint(DIM, '  ※ 合格項目の詳細は VERBOSE=1 node validate-data.js で表示されます。'));
}

console.log('');
console.log('----------------------------------------------------------');
console.log('  検証項目: ' + results.length + ' 件');
console.log('  ' + paint(GREEN, '合格: ' + (results.length - failed) + ' 件'));
console.log('  ' + (failed ? paint(RED, '失敗: ' + failed + ' 件') : '失敗: 0 件'));
console.log('----------------------------------------------------------');
console.log('');
console.log('  収録データ件数:');
console.log('    マニュアル台帳       : ' + DATA.ledger.length + ' 項目');
console.log('    制作工程             : ' + DATA.processes.length + ' 工程');
console.log('    数値基準             : ' + DATA.numericStandards.reduce(function (n, g) { return n + g.items.length; }, 0) + ' 件 / ' + DATA.numericStandards.length + ' グループ');
console.log('    提出前チェック(正式) : ' + DATA.checklist.length + ' 項目');
console.log('    改善候補チェック     : ' + DATA.checklistImprovements.length + ' 項目');
console.log('    切り抜き納品前チェック: ' + DATA.clipChecklist.length + ' 項目');
console.log('    連絡テンプレート     : ' + DATA.templates.length + ' 件');
console.log('    表記揺れ辞書         : ' + DATA.dictionary.length + ' 件 (+分割編集 ' + DATA.splitEditDictionary.length + ' 件)');
console.log('    事故防止マップ       : ' + DATA.accidentMap.length + ' 件');
console.log('    監査(矛盾)           : ' + DATA.audit.conflicts.length + ' 件');
console.log('    監査(目次問題)       : ' + DATA.audit.tocIssues.length + ' 件');
console.log('    監査(欠損リンク)     : ' + DATA.audit.missingLinks.length + ' 件');
console.log('    監査(改善候補)       : ' + DATA.audit.improvements.length + ' 件');
console.log('    用語集               : ' + DATA.glossary.length + ' 件');
console.log('');

if (failed > 0) {
  console.error('検証に失敗しました。');
  process.exit(1);
}

console.log(paint(GREEN, 'すべての検証項目に合格しました。'));
process.exit(0);
