# GitHub Issues Exporter

## 專案簡介

`github-issues-exporter` 是一個使用 **GitHub CLI (`gh`)** 認證的命令列工具，專門用來把 GitHub 的 Issue 做完整備份。

主要目標：
- 以 GitHub Issues URL 作為輸入，直接匯出指定 repo 的所有 issue（或單一 issue）
- 每一張 issue 存成一個 `json` 檔
- 同步抓取 `comments`
- 下載 issue / comment 中的附件（可選）
- 輸出結果放在固定目錄結構，便於腳本化處理與後續回溯

> 目前是 CLI 版，不提供互動式 TUI。

---

## 版本與需求

### 安裝需求
- Node.js 18+（建議 18 或以上）
- Bun（執行與建置時使用）
- 專案採用 ESM（`package.json` 內 `type: "module"`）
- 已安裝 GitHub CLI：`gh`
- 已完成登入：`gh auth login`

### 重要前提
- 未登入 `gh` 時，工具會直接終止並顯示提示。
- 目前優先使用 `gh` 自動偵測登入帳號，作為輸出目錄中的 `github-id`。
- 工具會過濾 `/issues` API 回傳中的 Pull Request（PR 不會被匯出為 issue）。

---

## 專案結構

```text
src/index.ts               # 主程式（TypeScript, Bun 運行，無外部套件依賴）
dist/                     # 建置輸出
docs/
  └─ PRD.md                # 產品需求文件
```

---

## 安裝/授權檢查

在執行前請先確認：

```bash
gh --version
gh auth status
```

若 `gh auth status` 未通過，請先執行：

```bash
gh auth login
```

---

## 啟動方式

### 1. 以 repo Issues URL 匯出

```bash
bun run src/index.ts https://github.com/doggy8088/GitHubClaw/issues
```

或使用 npm 腳本：

```bash
bun run start -- https://github.com/doggy8088/GitHubClaw/issues
```

### 2. 以單一 issue URL 匯出

```bash
bun run src/index.ts https://github.com/doggy8088/GitHubClaw/issues/123
```

### 3. 使用 `--url` 參數（與位置參數等價）

```bash
bun run src/index.ts --url https://github.com/doggy8088/GitHubClaw/issues
```

如果你有安裝為全域指令（`npm link`）可直接使用：

```bash
npm link
github-issues-exporter --url https://github.com/doggy8088/GitHubClaw/issues
```

---

## CLI 用法（Usage）

```text
usage: bun run src/index.ts [--url URL] [--github-id GITHUB_ID]
                                     [--out-dir OUT_DIR] [--state {open,closed,all}]
                                     [--page-size PAGE_SIZE] [--max-pages MAX_PAGES]
                                     [--max-comment-pages MAX_COMMENT_PAGES]
                                     [--no-attachments] [--skip-comments] [--force]
                                     [--dry-run] [--verbose]
                                     [url]

positional arguments:
  url                 GitHub issues URL, e.g. /{owner}/{repo}/issues 或 /{owner}/{repo}/issues/{number}

optional arguments:
  --url URL           Alias URL input, same as positional argument.
  --github-id GITHUB_ID
                      Override GitHub ID used for output path.
                      Default: from `gh api user -q .login`
  --out-dir OUT_DIR   Output root directory (default: current directory).
  --state {open,closed,all}
                      Issue state filter in repo mode.
  --page-size PAGE_SIZE
                      API page size (default: 100)
  --max-pages MAX_PAGES
                      Issue page limit in repo mode, 0 means unlimited.
  --max-comment-pages MAX_COMMENT_PAGES
                      Comment page limit per issue, 0 means unlimited.
  --no-attachments    Do not download attachment files.
  --skip-comments     Skip comments export.
  --force             Overwrite existing issue JSON.
  --dry-run           Validate URL and gh auth only; no files written.
  --verbose           Print detailed progress.
```

---

## 輸出規則

### 目錄
- `--out-dir`（預設為目前目錄）  
  - 未指定 `--out-dir`（使用預設值）：
    `/{out-dir}/{github-id}/{repo-name}/{issue-id}.json`
  - 有指定 `--out-dir`：
    `/{out-dir}/{issue-id}.json`

- 附件目錄（每張 issue 一個子目錄）  
  - 未指定 `--out-dir`（使用預設值）：
    `/{out-dir}/{github-id}/{repo-name}/{issue-id}/`
  - 有指定 `--out-dir`：
    `/{out-dir}/{issue-id}/`

### 檔名策略
- 直接以 issue number 命名：`{issue-id}.json`
- 附件檔名避免衝突，格式：
  - `{safe-filename}__{sha1(url)[:10]}.{ext}`

### JSON 內容
每個 `issue-id.json` 含有：
- `issue_id`
- `owner`
- `repo`
- `issue`：issue 本體完整資料（包含 body）
- `comments`：該 issue 全部 comment
- `attachments`：附件記錄（原始網址、下載路徑、sha1、scope、錯誤訊息）
- `export_meta`：匯出摘要（github id、是否含 comments、是否下載附件）

---

## 匯出流程

1. 解析 URL，取得 `owner`、`repo`（必要時 `issue_number`）
2. 驗證 `gh` 已安裝並登入
3. 取得登入帳號作為預設 `github-id`
4. 分頁抓取 issue（repo 模式）或抓取單一 issue（issue 模式）
5. 對每張 issue 逐頁抓取全部 comments
6. 擷取 body 內附件 URL
7. 下載附件並改寫為本機路徑
8. 輸出單筆 issue JSON

---

## 範例（含 `out-dir`）

```bash
bun run src/index.ts \
  https://github.com/doggy8088/GitHubClaw/issues \
  --out-dir ./exports \
  --state all \
  --verbose
```

若 `./exports` 沒有再接 `github-id` 與 `repo` 路徑，輸出示意如下：

```text
./exports/1.json
./exports/1/attachment.png
```

---

## 常見問題

### 為什麼不會看到 `all-issues.json`？
這個版本只輸出「每張 issue 一個檔案」，不再產生彙總檔。

### `gh` 未登入會怎樣？
直接終止並顯示提示，並回傳錯誤碼 `2`。

### 附件下載失敗會影響匯出嗎？
不會中斷整體流程。該附件會記錄在 `attachments[].error`，其他資料仍會寫入。

### 有沒有支援其他網站 URL？
V1 僅支援 `github.com` 的 issue/list URL。

---

## 離線行為（Exit Code）
- `0`：完成（可為全部成功或有 skipped）
- `1`：輸入參數/URL 錯誤
- `2`：`gh` 未安裝或未登入
- `3`：匯出過程發生可重試錯誤

---

## 開發備註

- 專案目前為 TypeScript + Bun，無需安裝額外 npm 套件，維運上主要關注 `src/index.ts`。
- 產品需求定義請參考 [docs/PRD.md](docs/PRD.md)。
- 若要新增輸出格式或加上 `--parallel`、`--incremental`，建議優先維持「每張 issue 單檔」這個核心輸出模型。

## 建置與執行

```bash
# 型別檢查
bun run check

# 建置輸出到 dist/
bun run build

# 用 dist 執行（建置完成後）
node dist/index.js --help
```

### 版本 bump

```bash
# 將 package.json 版本 patch +1（例如 0.1.0 -> 0.1.1）
bun run bump
```

### 初始化種子版（第一次手動發佈）

你已經推上 GitHub Repo 後，建議先用這個指令完成 seed publish（僅第一次）：

```powershell
bun run publish:seed -- -Version 0.1.0 -Tag latest
```

可選：

```powershell
bun run publish:seed -- -Version 0.1.0 -Tag latest -KeepWorkspace
bun run publish:seed -- -Version 0.1.0 -DryRun -Tag next
```

若要深入理解 seed publish 的運作原理，請參考：

- [docs/SEED_PUBLISH_MECHANISM.md](docs/SEED_PUBLISH_MECHANISM.md)

## 發佈（npm Trusted Publishing）

本專案已建立 `.github/workflows/auto-release.yml`，支援：

- `main` 有 push 時自動進行 patch version 自動加 1
- 自動提交版本變更為 `chore(release): vX.Y.Z`
- 建立 `vX.Y.Z` tag 與 GitHub Release
- 使用 npm Trusted Publishing 發佈（`npm publish --provenance --access public`）

首次發佈流程請先參考：

- [docs/NPM_TRUSTED_PUBLISHING.md](docs/NPM_TRUSTED_PUBLISHING.md)

自動發行整體邏輯（觸發、版本計算、tag/release、發佈控制）請參考：

- [docs/RELEASE_AUTOMATION.md](docs/RELEASE_AUTOMATION.md)
