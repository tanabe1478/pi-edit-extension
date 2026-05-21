# Product runner

English: [Product runner](../product-runner.md)

bench:product の runner 仕様です。isolated JS fixture を作り、pi を mode ごとに実行し、tests と expected files を確認します。

## Key points

- tasks.json を出力
- runs/<mode>/<task>/<trial> に実行結果を保存
- metrics.jsonl で extension I/O を記録
- --capture-session で built-in tools も含む session I/O を記録
