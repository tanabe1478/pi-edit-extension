# Tool I/O accounting

English: [Tool I/O accounting](../tool-io-accounting.md)

extension metrics から tool I/O を集計する定義です。自然利用では edit payload だけでなく read output も重要です。

## Key points

- readResultChars
- editInputChars
- totalToolIoChars
- built-in tools は extension metrics では 0 になる
- 最終比較には session I/O を使う
