/*
 * sprites.mjs
 *
 * エージェントのドット絵。オフィスで働いている風景。16x16。
 *
 * ダッシュボードとコンソールの両方から使うため、ここが唯一の定義元。
 * 絵をコピーして持たないこと（片方だけ古くなる）。
 *
 * === 絵の作り ===
 *
 * 各エージェントは「机に向かって作業している人」として描く。
 * 上半分が人物（髪・顔・肩）、下半分が机の上の道具。
 * 役割ごとに道具を変えて見分けられるようにしている。
 *
 *   cto            … 王冠をかぶって全体を見ている
 *   director       … ヘッドセットで指示を出している
 *   common-manual  … 分厚いバインダーを開いている
 *   project-manual … 案件フォルダを広げている
 *   design         … ペンタブで絵を描いている
 *   telop          … キーボードで字幕を打っている
 *   mcp            … サーバーラック（人ではなく設備）
 *   observer       … 二画面モニタで編集の様子を見比べている
 *   recruiter      … 履歴書の束をめくっている
 *   cutter         … フィルムをレザーで切っている
 *   mixer          … フェーダー卓を操作している
 *   sales-hilura   … 受話器と依頼票をさばいている（ヒルウラ窓口）
 *   sales-chat     … 吹き出しの並ぶ画面に向かっている（チャット窓口）
 *
 * === アニメーション ===
 *
 * 各エージェントに idle（静止）と work（作業中）の2フレームがある。
 * work では腕やモニタが変化するので、どのエージェントが動いているか
 * 一目で分かる。
 *
 * 自動再生はしない。実際にツールを呼んでいる間だけ切り替える。
 * 意味のない点滅は目障りなだけで、情報を持たないため。
 *
 * ターミナルでは上下半分ブロック（▀▄）を使い、1文字で縦2ピクセルを描く。
 * 24bitカラー非対応・NO_COLOR環境では濃淡を文字で表現する。
 */

export const PALETTE = {
  '.': null,          // 透明
  'k': '#1b1f26',     // 輪郭
  'w': '#f2f4f8',     // 白（紙・画面）
  'g': '#9aa4b2',     // 灰（机・設備）
  'G': '#6b7480',     // 濃い灰（机の影）
  's': '#e8b48c',     // 肌
  'h': '#3a3f4a',     // 髪
  'b': '#1d4ed8',     // 青（共通マニュアル）
  'B': '#5b8cff',     // 青ハイライト
  'o': '#8a5a00',     // 琥珀（案件別）
  'O': '#e0a02a',     // 琥珀ハイライト
  'p': '#5b3fb5',     // 紫（図解）
  'P': '#a689f0',     // 紫ハイライト
  'e': '#0f7b3e',     // 緑（テロップ）
  'E': '#3fc47c',     // 緑ハイライト
  'r': '#b3261e',     // 赤（警告）
  'y': '#f0c46b',     // 黄
  'c': '#8a6d1f',     // 金（CTO）
  'C': '#e8c76a',     // 金ハイライト
  'm': '#8f2f28',     // 朱（ディレクター）
  'M': '#e06b60',     // 朱ハイライト
  'a': '#0e7490',     // 縹（カット）
  'A': '#3fc0dd',     // 縹ハイライト
  'z': '#a1275d',     // 茜（音響）
  'Z': '#e871ac',     // 茜ハイライト
  'u': '#46586e',     // 鉄紺（リアルタイム監査）
  'U': '#8ba0bd',     // 鉄紺ハイライト
  'j': '#7c4a21',     // 褐色（人材派遣）
  'J': '#c98a4b',     // 褐色ハイライト
  'n': '#0f766e',     // 常盤（ヒルウラ窓口）
  'N': '#2dd4bf',     // 常盤ハイライト
  'v': '#c2410c',     // 橙（チャット窓口）
  'V': '#fb923c'      // 橙ハイライト
};

/* ------------------------------------------------------------------ */
/* CTO — 王冠をかぶって全体を見ている                                    */
/* ------------------------------------------------------------------ */

const CTO_IDLE = [
  '................',
  '.....k.k.k......',
  '....kCkCkCk.....',
  '....kCCCCCk.....',
  '....kccccck.....',
  '.....kkkkk......',
  '.....khhhk......',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...kkcccccckk...',
  '..kscccccccsk...',
  '..kkGGGGGGGGkk..',
  '..kgwwgwwgwwgk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const CTO_WORK = [
  '................',
  '.....k.k.k......',
  '....kCkCkCk.....',
  '....kCCCCCk.....',
  '....kccccck.....',
  '.....kkkkk......',
  '.....khhhk......',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '..kkkcccccckkk..',
  '.kscccccccccsk..',
  '..kkGGGGGGGGkk..',
  '..kgwwgwwgwwgk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* ディレクター — ヘッドセットで指示を出している                          */
/* ------------------------------------------------------------------ */

const DIRECTOR_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '...kMhhhhhMk....',
  '...kMksssskM....',
  '...kMkskssMk....',
  '....kssssskk....',
  '....kssMssskk...',
  '...kmmmmmmmmk...',
  '..kmMMMMMMMMmk..',
  '..kmmmmmmmmmmk..',
  '..kkGGGGGGGGkk..',
  '..kgwwgggwwggk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const DIRECTOR_WORK = [
  '................',
  '..............k.',
  '.....kkkkk...kMk',
  '....khhhhhk.kMk.',
  '...kMhhhhhMkMk..',
  '...kMksssskMk...',
  '...kMkskssMk....',
  '....kssssskk....',
  '....kssMssskk...',
  '..kmmmmmmmmmmk..',
  '.kmMMMMMMMMMMmk.',
  '..kmmmmmmmmmmk..',
  '..kkGGGGGGGGkk..',
  '..kgwwgggwwggk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* 共通マニュアル — 分厚いバインダーを開いている                          */
/* ------------------------------------------------------------------ */

const COMMON_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...kbbbbbbbbk...',
  '..kbBBBBBBBBbk..',
  '..kbbbbbbbbbbk..',
  '..kkwwwkwwwkk...',
  '..kbwkwkwkwbk...',
  '..kbwwwkwwwbk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const COMMON_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '...kbbbbbbbbk...',
  '..kbBBBBBBBBbk..',
  '..kbbbbbbbbbbk..',
  '.kkwwwwkwwwwkk..',
  '.kbwwkwkwkwwbk..',
  '..kbwwwkwwwbk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* 案件別マニュアル — 案件フォルダを広げている                            */
/* ------------------------------------------------------------------ */

const PROJECT_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...kooooooook...',
  '..koOOOOOOOOok..',
  '..kooooooooook..',
  '..kkOOOkOOOkk...',
  '..kowwkwkwwok...',
  '..koOOOkOOOok...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const PROJECT_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '...kooooooook...',
  '..koOOOOOOOOok..',
  '.kkoooooooooookk',
  '..kkOOOkOOOkk...',
  '.kowwwkwkwwwok..',
  '..koOOOkOOOok...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* 図解・画像 — ペンタブで絵を描いている                                  */
/* ------------------------------------------------------------------ */

const DESIGN_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...ksspppppsk...',
  '..kppppppppppk..',
  '..kpPPwwwwPPpk..',
  '..kpPwwPPwwPpk..',
  '..kpPwwwwwwPpk..',
  '..kppppppppppk..',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const DESIGN_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '...kspppppppk...',
  '..kppppppppppk..',
  '..kpPwwPPwwPpk..',
  '..kpPwPPPPwPpk..',
  '..kpPwwwwwwPpk..',
  '.kkppppppppppkk.',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* テロップ — キーボードで字幕を打っている                                */
/* ------------------------------------------------------------------ */

const TELOP_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '..keeeeeeeeeek..',
  '..keEEEEEEEEek..',
  '..kewwwwwwwwek..',
  '..keeewwwweeek..',
  '..keeeeeeeeeek..',
  '..kkGGGGGGGGkk..',
  '..kgwgwgwgwgwk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const TELOP_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '..keeeeeeeeeek..',
  '..keEEEEEEEEek..',
  '..kewwwwwwwwek..',
  '..keewwwwwweek..',
  '..keeeeeeeeeek..',
  '..kkGGGGGGGGkk..',
  '..kwgwgwgwgwgk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* MCPサーバー — 人ではなく設備（サーバーラック）                         */
/* ------------------------------------------------------------------ */

const MCP_IDLE = [
  '................',
  '..kkkkkkkkkkkk..',
  '..kGGGGGGGGGGk..',
  '..kgggggggggggk.',
  '..kgEwwwwwwwgk..',
  '..kggggggggggk..',
  '..kgEwwwwwwwgk..',
  '..kggggggggggk..',
  '..kgEwwwwwwwgk..',
  '..kggggggggggk..',
  '..kgwwwwwwwwgk..',
  '..kggggggggggk..',
  '..kGGGGGGGGGGk..',
  '..kkkkkkkkkkkk..',
  '...k........k...',
  '................'
];

const MCP_WORK = [
  '................',
  '..kkkkkkkkkkkk..',
  '..kGGGGGGGGGGk..',
  '..kgggggggggggk.',
  '..kgwwwwwwwwEk..',
  '..kggggggggggk..',
  '..kgwwwwwwEEgk..',
  '..kggggggggggk..',
  '..kgwwwwEEwwgk..',
  '..kggggggggggk..',
  '..kgEEwwwwwwgk..',
  '..kggggggggggk..',
  '..kGGGGGGGGGGk..',
  '..kkkkkkkkkkkk..',
  '...k........k...',
  '................'
];


/* ------------------------------------------------------------------ */
/* リアルタイム監査 — 二画面モニタで編集の様子を見比べている              */
/* ------------------------------------------------------------------ */

const OBSERVER_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kukksuk.....',
  '....kssssskk....',
  '...kuuuuuuuuk...',
  '..kuUUUUUUUUuk..',
  '..kuuuuuuuuuuk..',
  '..kkwwwkkwwwkk..',
  '..kuwwwkkwwwuk..',
  '..kuwwwkkwwwuk..',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const OBSERVER_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kukksuk.....',
  '....kssssskk....',
  '...kuuuuuuuuk...',
  '..kuUUUUUUUUuk..',
  '.kkuuuuuuuuuukk.',
  '..kkUwwkkwwUkk..',
  '..kuUwwkkwwUuk..',
  '..kuwwwkkwwwuk..',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* 人材派遣 — 履歴書の束をめくっている                                    */
/* ------------------------------------------------------------------ */

const RECRUITER_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...kjjjjjjjjk...',
  '..kjJJJJJJJJjk..',
  '..kjjjjjjjjjjk..',
  '..kkwwwwkwwkk...',
  '..kjwswwkwsjk...',
  '..kjwwwwkwwjk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const RECRUITER_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '...kjjjjjjjjk...',
  '..kjJJJJJJJJjk..',
  '.kkjjjjjjjjjjkk.',
  '.kkwwwwwkwwwkk..',
  '.kjwswwwkwswjk..',
  '..kjwwwwkwwjk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* カット — フィルムをレザーで切っている                                  */
/* ------------------------------------------------------------------ */

const CUTTER_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...kaaaaaaaak...',
  '..kaAAAAAAAAak..',
  '..kaaaaaaaaaak..',
  '..kkwkwwkwwkk...',
  '..kawkwwkwwak...',
  '..kkwkwwkwwkk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const CUTTER_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '...kaaaaaaaak...',
  '..kaAAAAAAAAak..',
  '.kkaaaaaaaaaakk.',
  '..kkwkAAkwwkk...',
  '..kawkAAkwwak...',
  '..kkwkwwkwwkk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* 音響 — フェーダー卓を操作している                                      */
/* ------------------------------------------------------------------ */

const MIXER_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...kzzzzzzzzk...',
  '..kzZZZZZZZZzk..',
  '..kzzzzzzzzzzk..',
  '..kkZgZgZgZkk...',
  '..kzgZgggZgzk...',
  '..kzgggZgggzk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const MIXER_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '...kzzzzzzzzk...',
  '..kzZZZZZZZZzk..',
  '.kkzzzzzzzzzzkk.',
  '..kkgZgZgZgkk...',
  '..kzZggZggZzk...',
  '..kzggZgZggzk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];


/* ------------------------------------------------------------------ */
/* ヒルウラ窓口 — 受話器を取り、依頼票を仕分けている                      */
/* ------------------------------------------------------------------ */

const HILURA_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '...nkhssshkn....',
  '...nksksksk.....',
  '....kssssskk....',
  '...knnnnnnnnk...',
  '..knNNNNNNNNnk..',
  '..knnnnnnnnnnk..',
  '..kkwwwkwwwkk...',
  '..knwwwkwwwnk...',
  '..knNNNkNNNnk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const HILURA_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '...NkhhhhhkN....',
  '..NnkhssshknN...',
  '...nkskksskk....',
  '....kssssskk....',
  '...knnnnnnnnk...',
  '..knNNNNNNNNnk..',
  '.kknnnnnnnnnnkk.',
  '.kkwwwwkwwwwkk..',
  '.knwwwwkwwwwnk..',
  '..knNNNkNNNnk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */
/* チャット窓口 — 吹き出しの並ぶ画面に向かっている                        */
/* ------------------------------------------------------------------ */

const CHAT_IDLE = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....ksksksk.....',
  '....kssssskk....',
  '...kvvvvvvvvk...',
  '..kvVVVVVVVVvk..',
  '..kvvvvvvvvvvk..',
  '..kkwwwkkkkkk...',
  '..kvwwwkVVVvk...',
  '..kvkkkkVVVvk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

const CHAT_WORK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khssshk.....',
  '....kskksskk....',
  '....kssssskk....',
  '...kvvvvvvvvk...',
  '..kvVVVVVVVVvk..',
  '.kkvvvvvvvvvvkk.',
  '..kkwwwkkVVVkk..',
  '..kvwwwkVVVvk...',
  '..kvwwwkkkkvk...',
  '..kkGGGGGGGGkk..',
  '..kGGGGGGGGGGk..',
  '...k........k...'
];

/* ------------------------------------------------------------------ */

/** 名前でスプライトを引く。idle と work の2フレームを持つ。 */
export const SPRITES = {
  cto:              { idle: CTO_IDLE,      work: CTO_WORK },
  director:         { idle: DIRECTOR_IDLE, work: DIRECTOR_WORK },
  'common-manual':  { idle: COMMON_IDLE,   work: COMMON_WORK },
  'project-manual': { idle: PROJECT_IDLE,  work: PROJECT_WORK },
  design:           { idle: DESIGN_IDLE,   work: DESIGN_WORK },
  telop:            { idle: TELOP_IDLE,    work: TELOP_WORK },
  mcp:              { idle: MCP_IDLE,      work: MCP_WORK },
  observer:         { idle: OBSERVER_IDLE,  work: OBSERVER_WORK },
  recruiter:        { idle: RECRUITER_IDLE, work: RECRUITER_WORK },
  cutter:           { idle: CUTTER_IDLE,    work: CUTTER_WORK },
  mixer:            { idle: MIXER_IDLE,     work: MIXER_WORK },
  'sales-hilura':   { idle: HILURA_IDLE,   work: HILURA_WORK },
  'sales-chat':     { idle: CHAT_IDLE,     work: CHAT_WORK }
};

/*
 * スプライトが16x16であることを読み込み時点で検証する。
 * 崩れた絵をそのまま出すと、どこがずれているか分からなくなるため、
 * 気づかないまま使われる前に落とす。
 */
for (const [name, frames] of Object.entries(SPRITES)) {
  for (const [state, spr] of Object.entries(frames)) {
    if (spr.length !== 16 || spr.some((row) => row.length !== 16)) {
      const bad = spr
        .map((r, i) => (r.length !== 16 ? `${i}行目:${r.length}文字` : null))
        .filter(Boolean);
      throw new Error(
        `スプライト ${name}.${state} が16x16ではありません（${spr.length}行 / ${bad.join(', ')}）`
      );
    }
  }
}

/** 指定した名前・状態のフレームを返す */
export function frame(name, state = 'idle') {
  const s = SPRITES[name] || SPRITES.mcp;
  return s[state] || s.idle;
}

/* ------------------------------------------------------------------ */
/* 描画                                                                */
/* ------------------------------------------------------------------ */

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

const RESET = '\x1b[0m';

export function fg(hex) { const [r, g, b] = hexToRgb(hex); return `\x1b[38;2;${r};${g};${b}m`; }
export function bg(hex) { const [r, g, b] = hexToRgb(hex); return `\x1b[48;2;${r};${g};${b}m`; }

/**
 * スプライトをターミナル用の8行へ変換する。
 * @param {string[]} rows 16x16のスプライト
 * @param {boolean} noColor 色を使わないか
 */
export function renderSprite(rows, noColor) {
  /*
   * 色あり・色なしのどちらも「8行」を返す。
   * 片方だけ16行を返すと、横並びレイアウトが崩れる。
   */
  const out = [];

  if (noColor) {
    for (let y = 0; y < rows.length; y += 2) {
      const top = rows[y] || '';
      const bot = rows[y + 1] || '';
      let line = '';
      for (let x = 0; x < 16; x++) {
        const t = top[x] && top[x] !== '.';
        const b = bot[x] && bot[x] !== '.';
        line += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
      }
      out.push(line);
    }
    return out;
  }

  for (let y = 0; y < rows.length; y += 2) {
    const top = rows[y] || '';
    const bot = rows[y + 1] || '';
    let line = '';
    for (let x = 0; x < 16; x++) {
      const tc = PALETTE[top[x]] ?? null;
      const bc = PALETTE[bot[x]] ?? null;
      if (!tc && !bc) { line += ' '; continue; }
      if (tc && bc) { line += fg(tc) + bg(bc) + '▀' + RESET; continue; }
      if (tc) { line += fg(tc) + '▀' + RESET; continue; }
      line += fg(bc) + '▄' + RESET;
    }
    out.push(line);
  }
  return out;
}

export function paint(hex, s, noColor) { return noColor ? s : fg(hex) + s + RESET; }
export function bold(s, noColor) { return noColor ? s : '\x1b[1m' + s + RESET; }
export function dim(s, noColor) { return noColor ? s : '\x1b[2m' + s + RESET; }
