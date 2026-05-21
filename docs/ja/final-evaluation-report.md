# 評価サマリ

English: [Final evaluation report](../final-evaluation-report.md)

## 結論

この extension は、opt-in の edit replacement policy として使い始められる段階です。

ただし、pi core の default を変える話ではありません。

## 主な結果

- synthetic payload では hashline が最小でした。
- natural-use では tagged と hashline_range が 43/43 成功しました。
- product benchmark では replacement modes が安定して成功しました。
- session I/O では built-in `edit` が安いケースもあります。
- relevant file hints は session I/O 削減に大きく効きました。

## 推奨

```text
通常編集: tagged
安全性重視: hashline
fallback: tagged
lifecycle: write/bash
```

## 残作業

- real repository fixture
- session-level repeated trials
- routing prompt の改善
- 長期利用での失敗例収集
