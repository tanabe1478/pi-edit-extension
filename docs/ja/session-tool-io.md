# Session tool I/O accounting

English: [Session tool I/O accounting](../session-tool-io.md)

pi session JSONL を parse して built-in tools も含む tool I/O を測ります。

## Key points

- --capture-session を使う
- tool call arguments JSON chars と tool result text chars を数える
- full model context や provider overhead は含まない
- pi_edit 比較に必要
