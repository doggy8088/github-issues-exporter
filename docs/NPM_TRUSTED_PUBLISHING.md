# Trusted Publishing 發佈指南 (首次上架版)

套件：`@willh/github-issues-exporter`

## 目標

- 使用 GitHub Actions + npm Trusted Publishing (OIDC) 發佈，不手動管理 NPM_TOKEN。
- 首次發佈建立 `v0.1.0` 標籤並自動發佈。
- 讓 `bun run build` 產生 `dist/index.js` 後，由 GitHub Actions 發佈到 npm。

## 前置條件

- 套件名稱為 `@willh/github-issues-exporter`，`package.json` 已設為 `private: false`。
- 已安裝 / 安裝時可用 `node`, `bun` (本地建置用)。
- npm 帳號可管理此 scope 的套件權限 (`@willh` 對應的組織 / 帳號)。
- GitHub repo 已有此專案代碼。

## 一次性在 npm 設定 Trusted Publishing

1. 前往 npm 網站 → `Account` → `Security` → `Read/write tokens` 或 `Trusted Publishers` (依目前介面)。
2. 新增對應的 OIDC Provider (GitHub)，建立授權條件：
   - 發佈者類型：GitHub Actions
   - Publisher ID：你的 GitHub 組織 / 帳號
   - Repository：本 repo
   - Package：`@willh/github-issues-exporter` (或對應所有套件)
3. 完成後儲存。
4. 在 GitHub Action 中需具備以下權限：
   - `id-token: write`
   - `contents: write` (建立 tag/release 時可選)
5. 確認 npm 設定頁面顯示該套件已可使用 Trusted Publishing。

## 本地準備 (首次發佈前)

1. 確認 `package.json` 的 `version` 在合理起始值 (例如 `0.1.0`)。
2. 驗證：

   ```bash
   bun run check
   ```

3. 先在本地確認 CLI 行為：

   ```bash
   bun run start -- --help
   ```

4. 將變更推到 `main`，讓 auto release workflow 自動完成版本 bump 與發佈。

## 自動發布 Workflow (首推)

本專案使用 `.github/workflows/auto-release.yml`，流程如下：

- 每次 `main` branch push (排除本 workflow 自己建立的 `chore(release): v*` commit) 會嘗試：
  - `bun run check`
  - 自動計算下一個 patch 版號
  - 更新 `package.json` 版號並 commit/tag
  - 建置 `dist/index.js`
  - 建立 GitHub Release
  - `npm publish --provenance --access public`
- 也可透過 `workflow_dispatch` 手動觸發一次發布。

> 重點：Trusted Publishing 成功時，`npm publish --provenance --access public` 不依賴手動 token。

## 首次發佈步驟 (建議)

1. 在 `package.json` 設定好預期起始版本。
2. 確認 Workflow 能存取 `id-token` 權限 (見 YAML 中 `permissions`)。
3. 直接 push 到 `main` (或手動觸發 workflow)。
4. 檢查 Actions 日誌與 GitHub Release 是否建立。
5. 驗證 npm 上已出現新版本與 provenance 簽章。

## 版本更新與後續發佈

- 例：小修

  ```bash
  npm version patch
  git push --follow-tags
  ```

- `v0.1.1` 會自動透過相同流程發佈。

## 可能卡關

- 若 action 無法 publish：檢查 repo 是否對應到 npm trusted publisher 的 scope／package 綁定
- 若 `403`：確認 package 許可權與 OIDC Issuer 的 repo 條件
- 若 `provenance` 顯示失敗：請確認使用的 npm CLI/Node 版本支援 provenance 與 OIDC 發佈
