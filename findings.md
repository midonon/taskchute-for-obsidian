# Findings & Decisions

## Requirements

- 新規タスク作成で、タスク名直下に常時表示される見積時間入力を置く。
- 見積は空欄可、入力時は1以上の整数のみ。モバイルでは数字キーボードを開く。
- タスク行の見積チップをクリック／タップして既存の見積編集モーダルを開く。歯車メニューの導線も残す。
- 日本語UIで見積時間関連の追加表示を翻訳する。英語辞書も維持する。
- 完了タスクの実績時間を、見積と同じ分単位・ラベル付きで表示する。
- 右端の操作をまとめ、歯車だけが改行しないレイアウトへ直す。開始・停止・ルーチン・設定の既存機能を保持する。
- リモート操作、mainへのマージ、commit、pushはしない。

## Research Findings

- `TaskCreationController.createAdvancedControls` は `showTaskCreationAdvancedSettings === true` のときだけ見積入力を生成する。既定値はfalseのため、添付画面ではタスク名しか表示されない。
- `TaskRowController.renderEstimateDisplay` は見積をspanで描画するだけで、編集callbackを持たない。
- `TaskChuteView.tv` は `taskChuteView.${key}` をi18nへ渡す。見積時間関連のキーが `src/i18n/locales/ja.ts` と `en.ts` に未登録で、コード内fallbackの英語が表示される。
- `TaskListRenderer.createTaskInstanceItem` は見積を追加した。通常幅のCSS Gridは9列だが、見積ありの行は10個のGridアイテムになるため、最後の歯車が次行へ自動配置される。
- 現行の `🔄` は `TaskItemActionController.renderRoutineButton` により作られるルーチン設定ボタンであり、複製操作は歯車メニュー内にある。
- `TaskRowController` は既にPCとモバイルを分けたtap登録処理を持つため、見積buttonにも再利用できる。
- 完了タスクの実績表示は `TaskRowController.renderDurationDisplay` が作る `task-duration` で、現在は `00:18` のような時:分表記だけを出す。

## Visual Findings

- 添付画面では見積入力が新規タスク画面に見えない。
- 日本語画面でも `Set estimated time` と `Est. 26m` が英語のまま表示される。
- 見積チップがある行では歯車が次の行の左端に配置されている。
- セクション容量の集計表示と使用率バーは表示されている。
- 最新の添付画面では、見積は `Est. 30m`、実績はラベルなしの `00:18`。ユーザーは `見積 30m`／`実績 18m` のような明示的な比較表示を希望している。

## Existing Test Coverage

- `tests/ui/task/task-creation-controller.test.ts`: 作成モーダルと詳細設定の生成・保存を確認している。
- `tests/ui/tasklist/task-row-controller.test.ts`: タスク行の操作を確認している。
- 同テストへ、完了タスクの実績表示が翻訳済みラベルと総分になることを追加する。
- `tests/views/tasklist/task-list-renderer.test.ts`: 行のレンダリングとルーチン操作を確認している。
- `tests/ui/task/task-settings-tooltip-controller.test.ts`: 歯車メニューの操作を確認している。
- 見積時間の専用UIテストは未追加。既存の`estimatedMinutes`参照はカレンダー、ローダー判定、fixtureが中心。

## Planned File Scope

- `src/ui/task/TaskCreationController.ts`
- `src/ui/modals/EstimatedTimeModal.ts`
- `src/ui/tasklist/TaskRowController.ts`
- `src/ui/tasklist/TaskListRenderer.ts`
- `src/features/core/views/TaskChuteView.ts`
- `src/i18n/locales/ja.ts`
- `src/i18n/locales/en.ts`
- `styles.css`
- 上記に対応する既存Jestテスト

## Constraints and Safety

- `package-lock.json` は既存の未コミット変更であり、今回の対象外。
- Windowsで利用不能な作者固有のE2E環境は実行しない。
- 固定ハッシュの確認・照合など、過剰な検証は実施しない。
- 作業報告、計画、コードコメント、コミットメッセージではローカル絶対パスを使わず、リポジトリルートからの相対パスだけを使う。
