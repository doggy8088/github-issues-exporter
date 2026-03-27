# Changelog

所有重要版本更新都會記錄於此。

## [0.1.0] - 2026-03-27
### Added
- 新增 CLI 匯出工具，支援輸入 GitHub Issues URL。
- 支援 Repo mode（`/issues`）與單一 issue mode（`/issues/{number}`）。
- 支援完整 comments 抓取，並在同一筆 issue JSON 中輸出。
- 支援附件偵測、下載、重複檔名去衝突命名與下載失敗記錄。
- 匯出檔案固定為 `/{out-dir}/{github-id}/{repo-name}/{issue-id}.json`。
- 新增 `--state`、`--page-size`、`--max-pages`、`--max-comment-pages`。
- 新增 `--github-id`、`--out-dir`、`--no-attachments`、`--skip-comments`、`--force`、`--dry-run`、`--verbose`。
- 預設不輸出彙總檔 `all-issues.json`，改為每筆 issue 一個 JSON。

### Changed
- 輸出 body/comment 中附件 URL，改為本地路徑（若附件有成功下載）。
- GitHub CLI（`gh`）驗證與登入檢查流程完整化。

### Fixed
- 過濾 `pull_request` 類型條目，避免 PR 被誤當 Issue 匯出。
- 修正附件無資料時不建立 issue 附件目錄。
- 改善檔名衝突機制，降低同名覆蓋風險。

### Build & Release
- 專案改以 TypeScript + Bun 實作。
- 使用 GitHub Actions 自動發版與 npm Trusted Publishing。

## 0.1.0 附加說明（Release Notes）

### 主要更新
- 以 GitHub Issue URL 作為輸入，支援兩種模式：
  - Repo issues：`https://github.com/{owner}/{repo}/issues`
  - 單一 issue：`https://github.com/{owner}/{repo}/issues/{number}`
- 使用 GitHub CLI (`gh`) 驗證與授權：
  - 檢查 `gh` 是否安裝
  - 檢查登入狀態
  - 取得登入帳號作為輸出預設 `github-id`
- 匯出輸出完整化：
  - 每張 issue 輸出為單一 JSON：`{out-dir}/{github-id}/{repo-name}/{issue-id}.json`
  - 不再輸出彙總檔（`all-issues.json`）
  - 每張 issue 的 comments 以分頁方式完整抓取後寫入同一 issue 檔
  - 自動排除 Pull Request 型別項目
- 附件支援：
  - 下載 issue/comment 中判定為附件的連結
  - 附件儲存於 `.../{issue-id}/` 目錄
  - 附件檔名使用去重規則：`{safe-filename}__{sha1(url)[:10]}.{ext}`
  - JSON 內保留附件 metadata 並將 body/comment 內可定位附件換成本地路徑
- CLI 介面完整化：
  - `--state`、`--page-size`、`--max-pages`、`--max-comment-pages`
  - `--no-attachments`、`--skip-comments`、`--force`、`--dry-run`、`--verbose`
  - `--github-id` 覆寫輸出 owner，`--out-dir` 指定輸出根目錄

### 技術棧與結構
- 改以 TypeScript 開發，原始碼位於 `src/index.ts`
- 使用 Bun 作為執行與建置工具
- 建置結果輸出到 `dist/`
- 無外部 npm 套件依賴
- 套件名稱：`@willh/github-issues-exporter`
- `private: false`（可發佈）

### 發行與執行
- 型別檢查：`bun run check`
- 開發執行：`bun run src/index.ts ...`
- 建置：`bun run build`（輸出 `dist/index.js`）
- 建置後執行：`node dist/index.js ...`

### 退出碼
- `0`：成功
- `1`：參數/URL 錯誤
- `2`：`gh` 未就緒（未安裝或未登入）
- `3`：執行錯誤

### 已知限制
- 僅支援 `github.com` URL
- 附件識別採啟發式規則，非所有可下載連結都會被強制下載
- 大量 issue 時請使用 page 設定與節流，避免 API 頻率限制

### Trusted Publishing 首次發佈
- 參考文件：`docs/NPM_TRUSTED_PUBLISHING.md`
- 首次發佈建議流程：
  - 更新版本（例如 `0.1.0`）
  - `bun run check`
  - `bun run build`
  - `npm version 0.1.0`
  - `git push` 並推 `v0.1.0` 標籤
  - GitHub Actions 以 OIDC 觸發 `npm publish --provenance --access public`

### 後續建議
- 新增 `--include-prs` 選項（目前預設排除 PR）
- 附件下載可加 `--concurrency`（並行控制）
- 加入更多輸出欄位白單，避免大檔案資料冗餘
