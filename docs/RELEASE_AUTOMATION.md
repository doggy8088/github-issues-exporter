# 自動發行流程整理（Auto Release）

本文整理 `.github/workflows/auto-release.yml` 的執行邏輯，供本地與 CI 運維快速對照。

## 觸發條件

- 觸發事件：
  - `push` 到 `main`
  - `workflow_dispatch`（可手動觸發）
- 跳過條件：
  - 若事件為 `push`，且 commit message 以 `chore(release): v` 開頭，表示為自動發行流程本身產生的 commit，workflow 不會再重入執行。

## 權限與環境

- 權限（workflow）：
  - `contents: write`：可推送版本 commit 與 tag
  - `id-token: write`：供 npm Trusted Publishing OIDC 使用
- runner：
  - `ubuntu-latest`
- 使用工具：
  - `actions/setup-node@v4`（Node LTS）
  - `oven-sh/setup-bun@v2`（Bun latest）

## 步驟順序

1. Checkout
   - `fetch-depth: 0`，用於取得完整提交歷史，確保 tag 推送與判斷可進行。

2. 驗證
   - 執行 `bun run check`。
   - 失敗則流程中止。

3. 計算下一個 patch 版本
   - 讀取本地 `package.json` 的 `version`。
   - 呼叫 `npm view @willh/github-issues-exporter version` 取得遠端已發佈版本（失敗時視為 `0.0.0`）。
   - 比較本地與遠端版本：
     - 以「較高者」為基準版本；
     - 只進行 patch +1。
   - 將結果寫回 `package.json`，並輸出到 step output `VERSION`。

4. Commit + Tag
   - 設定 `github-actions[bot]` 身分。
   - Commit `package.json`，訊息為 `chore(release): v<VERSION>`。
   - 建立 annotated tag `v<VERSION>`。
   - `git push`、`git push --tags`。

5. 建置
   - 執行 `bun run build`，產生 `dist/index.js`。

6. 建立 GitHub Release
   - 檢查同名 release 是否已存在：
     - 存在則不重建，`created=false`。
     - 不存在則建立 release，附帶 `dist/index.js`，`created=true`。
   - 僅於新建 release 時才執行後續 npm publish，避免重複發佈。

7. 發佈至 npm（Trusted Publishing）
   - `npm config set provenance true`
   - `npm publish --provenance --access public`

## 目前版本 bump 策略

- 目前為固定 patch bump（`x.y.z -> x.y.z+1`）。
- 無論本地是否已小於遠端，都以遠端/本地較高版本為基準再加 1，避免版本倒退。
- 本地也保留 `bun run bump` 腳本，可手動做同樣型態的 patch +1（僅改 `package.json`）。

## 與本地流程對照

- 本地建議步驟：
  - `bun run check`
  - `bun run bump`
  - `bun run build`
  - `git diff` 檢查 `package.json` 與產物
- 推到 `main` 後，workflow 會再次計算版本並以實際遠端狀態做 patch bump。

## 風險與排查

### 常見風險

- commit 無權限推送：確認 workflow token 權限與 branch 保護設定。
- 發佈失敗（403 / OIDC）：
  - 確認 npm Trusted Publisher 與 repo 綁定條件一致。
  - 確認 `id-token: write` 已存在。
- 已有 Release：流程會跳過 publish，避免重複推送同版本。

### 快速 debug 清單

- Actions log 首先看
  - `Validate`
  - `Compute next patch version`
  - `Commit version and tag`
  - `Create GitHub Release`
  - `Publish to npm`
- 檢查 `package.json` 的版本是否已被 workflow 寫入新版本。
- 檢查 GitHub Release 與 npm 上的版本 timeline 是否對齊。

