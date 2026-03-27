# 產品需求文件（PRD）：GitHub Issues Exporter

## 1. 專案概述

### 1.1 目標
提供一個命令列工具，能以 GitHub Repository 的 Issue URL 為輸入，將 Issue、完整留言與附件匯出為本機 JSON。

### 1.2 使用者與場景
- 需要離線備份 Issue 歷史的開發者。
- 想要維運與稽核紀錄可機器可讀檔案的維護者。
- 需要固定輸出路徑，以便後續資料流程處理的工程師。

### 1.3 非目標
- 不做 TUI 互動介面。
- 不輸出 Pull Request（`/issues` API 會回傳 PR 項目，需排除）。
- 初版不支援 JSON 以外的格式輸出。

## 2. 使用者故事

1. 使用者可輸入 Repo 的 `issues` URL，將所有問題完整匯出到本機檔案。
2. 使用者可輸入單一 issue URL，僅匯出該筆 issue。
3. 工具在執行前需驗證 GitHub CLI（`gh`）是否可用與已登入。
4. 每筆 issue 檔必須包含該 issue 全部 comments，與 issue 本體同檔。
5. 附件需下載到對應 issue 目錄，並避免檔名衝突。
6. 輸出 JSON 路徑符合：
   - `/{out-dir}/{github-id}/{repo-name}/{issue-id}.json`

## 3. 功能需求

### 3.1 CLI 輸入
- 必填參數：
  - `url`：GitHub issues URL
    - Repo 模式：`https://github.com/{owner}/{repo}/issues`
    - 單筆模式：`https://github.com/{owner}/{repo}/issues/{number}`
- 支援參數：
  - `--url`：URL 別名
  - `--github-id`：覆寫輸出資料夾 owner 名稱（預設：`gh api user -q .login`）
  - `--out-dir`：輸出根目錄（預設：目前目錄）
  - `--state`：`open|closed|all`（repo 模式，預設 `all`）
  - `--page-size`：API 每頁筆數（預設 `100`）
  - `--max-pages`：repo issue 分頁上限（預設 0：不限制）
  - `--max-comment-pages`：每則 issue 的 comments 分頁上限（預設 0：不限制）
  - `--no-attachments`：不下載附件，只保留原始連結
  - `--skip-comments`：不輸出 comments
  - `--force`：覆寫既有 issue JSON
  - `--dry-run`：只驗證參數與 `gh`，不寫檔
  - `--verbose`：輸出詳細處理流程

### 3.2 GitHub CLI 依賴
- 工具必須檢查：
  - `gh` 指令是否存在
  - `gh auth status` 通過（已登入）
- 若未通過，應輸出可行動訊息並以非零錯誤碼退出。

### 3.3 URL 解析與模式判斷
- 從 URL 擷取 `owner` 與 `repo`。
- 若 URL 包含 issue number，切換為單筆模式。
- 不合法 URL 需清楚拒絕並說明原因。

### 3.4 Issue 抓取
- Repo 模式：
  - 使用 `gh api /repos/{owner}/{repo}/issues` 抓取
  - 透過 `per_page` 與 `page` 做分頁
  - 依 `--state` 篩選
  - 排除有 `pull_request` 欄位的項目
- 單筆模式：
  - 使用 `/repos/{owner}/{repo}/issues/{number}` 抓取
  - 若為 PR，則跳過。

### 3.5 Comment 抓取
- 針對每一個匯出的 issue，抓取：
  - `/repos/{owner}/{repo}/issues/{number}/comments`
- 必須處理分頁。

### 3.6 附件匯出
- 從 issue body 與 comment body 偵測可能的附件網址。
- 附件下載路徑：
  - `/{out-dir}/{github-id}/{repo-name}/{issue-id}/`
- 附件檔名規則（避免衝突）：
  - `{safe-name}__{sha1(url)[:10]}.{ext}`
- 若雖同規則仍衝突，則追加次級短雜湊。
- 成功下載後，將 issue/comment 內對應 URL 替換為本機路徑。
- `attachments` 記錄每個附件：
  - `source_url`、`local_path`、`filename`、`sha1`、`scope`、`error?`
- 單一附件下載失敗不得中止整體流程；需保留錯誤紀錄後繼續。

## 4. 輸出規格

### 4.1 檔案佈局
- 每個 issue 一個 JSON 檔：
  - `/{out-dir}/{github-id}/{repo-name}/{issue-id}.json`
- 該 issue 的附件目錄：
  - `/{out-dir}/{github-id}/{repo-name}/{issue-id}/`

### 4.2 JSON 結構（目前）
- 根物件欄位：
  - `issue_id`
  - `owner`
  - `repo`
  - `issue`：完整 issue 物件（必要時將 body 內附件連結改為本機路徑）
  - `comments`：完整 comments 陣列
  - `attachments`：附件 metadata 陣列
  - `export_meta`：`github_id` 與流程旗標資訊

### 4.3 不輸出彙總檔
- 不產生單一 `all-issues.json`。
- 每筆 issue 皆以獨立檔案完整保留。

## 5. 錯誤處理與退出行為
- 退出碼：
  - `0`：成功
  - `1`：參數或 URL 驗證錯誤
  - `2`：`gh` 未安裝或未登入
  - `3`：執行期抓取/匯出錯誤
- 問題級回復能力：
  - 某一筆 issue 失敗不阻斷其他 issue
  - 結尾輸出彙總：`exported`、`skipped`、`failed`

## 6. 驗收標準
- 針對 `https://github.com/doggy8088/GitHubClaw/issues`：
  - 驗證 `gh` 已登入
  - 透過分頁完整抓取非 PR issue
  - 以預期路徑輸出每筆 issue 單檔
  - 每筆 issue 檔含完整 comments
  - 若有附件，建立 `issue-id` 子目錄並下載
  - 僅在實際失敗時返回非零（有 failed>0）

## 7. 現有限制
- 僅支援 `github.com` 網址。
- 附件偵測採啟發式，主要針對常見 GitHub 附件連結與副檔名。
- 除下載與 SHA-1 計算外，不做進一步二進位/文字後處理。

## 8. V1 不在此範圍
- PR 匯出（目前預設排除）。
- API 回應快取。
- 平行下載 worker。
- 增量同步/差異同步。

## 9. 安全與作業
- 依賴 `gh` 已登入會話進行 API 與附件下載，不需使用者手動輸入 token。
- 附件下載時可使用 Authorization header（預設使用 `gh auth token`）。
- 不輸出 token。
- 檔案皆寫入使用者指定輸出目錄。
