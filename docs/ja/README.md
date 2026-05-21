# pi-edit-extension 日本語ドキュメント

English: [Documentation index](../README.md)

## 概要

pi の built-in `edit` を、extension の opt-in policy として置き換えるための実験的リポジトリです。

通常編集は tagged、stale safety や repeated file では hashline、file lifecycle は `write` / `bash` に分担します。

## まず読むもの

- [Quickstart 日本語版](quickstart.md)
- [推奨 edit policy](recommended-edit-policy.md)
- [評価サマリ](final-evaluation-report.md)

## 英語ドキュメント

英語ドキュメントの索引は [docs/README.md](../README.md) です。

## 現在の結論

- extension としては使い始められる段階です。
- built-in `edit` は tool set から外します。
- `read`, `write`, `bash` は残します。
- コスト削減だけでなく、安全性と fallback policy を含めた置き換えとして扱います。
- 実運用では `--capture-session` で session I/O を確認してください。
