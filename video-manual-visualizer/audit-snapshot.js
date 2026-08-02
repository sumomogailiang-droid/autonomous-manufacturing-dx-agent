/*
 * audit-snapshot.js
 *
 * このファイルは tools/build-audit-snapshot.mjs が生成します。手で編集しないでください。
 * 内容は「生成時点の監査結果」です。実行中の状態ではありません。
 */
(function (root, factory) {
  var data = factory();
  root.AUDIT_SNAPSHOT = data;
  if (typeof module === 'object' && module.exports) { module.exports = data; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    "generatedAt": "2026-08-02T04:54:32.697Z",
    "kind": "snapshot",
    "note": "これは生成時点の監査結果です。実行中の状態ではありません。最新の判定は node agents/governance.mjs で確認してください。",
    "source": "agents/governance.mjs",
    "total": 66,
    "passed": 65,
    "blockers": 0,
    "warnings": 1,
    "verdict": "GO",
    "failing": [
      {
        "result": "WARN",
        "id": "C6-04",
        "name": "案件マニュアルの未確定項目が残っていない"
      }
    ]
  };
});
