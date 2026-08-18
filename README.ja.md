# TaskChute Plus

[English](./README.md)

TaskChute Plusは、今やることを決め、実行し、実績を残すためのObsidianプラグインです。

このリポジトリは、[hiroyaiizuka/taskchute-for-obsidian](https://github.com/hiroyaiizuka/taskchute-for-obsidian)をもとに、見積時間と時間帯ごとの容量を扱えるようにしたForkです。一日の予定を並べたときに、見積時間が収まるかを確かめやすくしています。

## 追加している機能

- タスクのfrontmatterに `estimatedMinutes` として見積時間を保存
- 新規タスクの基本項目として見積時間を入力
- タスク行から見積時間を直接編集
- 完了タスクでは、見積時間と実績時間を並べて表示
- 時間帯セクションごとに、見積時間の合計、容量、使用率バー、容量到達／超過の警告を表示
<img width="1779" height="780" alt="image" src="https://github.com/user-attachments/assets/b32a8047-126d-47ce-a8f1-c1309a92c20c" />


## 導入

### GitHub Releaseから導入する場合

Releaseがある場合は、main.js、manifest.json、styles.cssをダウンロードします。Vault内のtaskchute-plusプラグインディレクトリへコピーしてから、Obsidianで有効にしてください。

### ソースからビルドする場合

開発ブランチを試す場合や、GitHub Releaseがまだない場合はこちらを使います。

```bash
git clone https://github.com/midonon/taskchute-for-obsidian.git
cd taskchute-for-obsidian
npm install
npm run build
```

次のファイルを、Vault内のtaskchute-plusプラグインディレクトリへコピーします。

- main.js
- manifest.json
- styles.css

Obsidianのコミュニティプラグイン設定でTaskChute Plusを有効にします。これはローカルに配置したプラグインを有効にする手順で、コミュニティプラグイン一覧への掲載とは別のものです。

## 見積時間とセクション容量

新規タスク作成時に見積時間を入れるか、タスク行の見積テキストを選択して編集します。空欄で保存すれば見積時間を削除できます。

```md
---
tags:
  - task
target_date: 2026-04-16
scheduled_time: 09:00
estimatedMinutes: 30
---

# 週次レビューの準備
```

時間帯セクションのヘッダーでは、所属タスクの見積合計とセクションの長さを比べます。たとえば`60/240m`は、240分の時間帯に60分の見積が入っている状態です。

## 本家について

日々のタスク管理、コマンド、設定、公式版の配布については、[本家リポジトリ](https://github.com/hiroyaiizuka/taskchute-for-obsidian)を参照してください。公式プラグインの配布は本家作者が担当します。このForkをObsidianのコミュニティプラグイン一覧へ別プラグインとして申請する予定はありません。

## 開発

Node.js 18以上とnpmが必要です。

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

ローカル開発では、`npm run dev`でesbuildのwatchモードを起動できます。

## フィードバック

このForkへの不具合報告や提案は、[Issue](https://github.com/midonon/taskchute-for-obsidian/issues)へお願いします。

## ライセンスとクレジット

このリポジトリは[MIT License](./LICENSE)の下で公開します。本家プロジェクトの著作権表示とライセンス表示は保持しています。

- 本家作者: [Hiroya Iizuka](https://github.com/hiroyaiizuka)
- Fork保守: [midonon](https://github.com/midonon)
