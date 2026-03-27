# Seed Publish (初始化發佈) 運作原理

本文件說明 `scripts/seed-publish.ps1` 的完整邏輯，讓第一次沒有 npm 套件時可以安全完成「種子版」發佈，建立 Trusted Publishing 之前的第一個可見版本。

## 1. 為什麼需要 Seed Publish

當套件尚未在 npm 存在時，Trusted Publishing (OIDC) 通常無法直接綁到既有版本流程。\
我們先用 seed publish 建立 `0.1.0` (可自訂) 作為第一版，讓 `@willh/github-issues-exporter` 在 npm 上真正存在；接著再啟用 GitHub Actions 自動發佈。

## 2. 腳本入口與預設參數

- npm script：
  - `bun run publish:seed`
- 對應 PowerShell 參數 (預設值)：
  - `-Version 0.1.0`
  - `-Tag latest`
  - `-RepoRoot <目前目錄>`
  - `-Registry https://registry.npmjs.org/`

腳本原始檔為：

- [../scripts/seed-publish.ps1](../scripts/seed-publish.ps1)

## 3. 運作流程 (逐步)

### 3.1 參數與環境驗證

1. 透過 `Get-Command` 檢查 `bun`、`npm`、`node` 是否可執行。
2. 檢查 `package.json` 是否存在。
3. 驗證 `package.json`:
   - 必須是 scoped package (`name` 以 `@` 開頭)
   - `private` 不得為 `true`
4. 如指定 `-Version`，驗證是 `x.y.z` 形式 (semver 單純主版)。
5. 檢查 npm 登入狀態 (`npm whoami`)。

若任一項失敗，腳本立即終止並輸出錯誤。

### 3.2 建置補齊

如果 `dist/index.js` 不存在：

- 會在 repo 根目錄執行 `bun run build`
- 目的是確保 `dist/index.js` 可供發佈。

### 3.3 版本寫入 (可選)

- `-Version` 若有提供，腳本會將版本套用到暫存區的 `package.json` (不直接改原始檔)。
- 若沒提供，使用原始版號。

### 3.4 建立「暫存發佈工作目錄」

腳本建立一個隨機 temp 目錄，例如：

- `%TEMP%\npm-seed-publish-<guid>\workspace`

將最少發佈必要檔案複製進去：

- `package.json`
- `dist/`
- `README.md` (存在時)
- `CHANGELOG.md` (存在時)
- `LICENSE` (存在時)
- `tsconfig.json` (存在時)

設計原則：

- **隔離性**：不在原 repo 直接操作發佈流程
- **可回溯性**：必要時用 `-KeepWorkspace` 保留該目錄
- **最小化**：只保留發佈必需檔案

### 3.5 發佈執行

切換到暫存 `workspace` 後執行：

- `npm publish --access public --registry <Registry> --tag <Tag>`

行為分支：

- 一般執行：直接 publish 到 npm
- `-DryRun`：只做流程檢查，不 publish

### 3.6 事後驗證與清理

- 成功後嘗試 `npm view <name>@<version> version` 驗證版本可見
- 預設清理暫存目錄
- 如加上 `-KeepWorkspace`，保留目錄供除錯

## 4. 失敗與防呆機制

- `npm whoami` 失敗：提示先執行 `npm login`
- 版本格式錯誤：只接受 `x.y.z`
- 未滿足 scoped package、或 `private: true`：立即停止
- 指令缺失：提前終止，避免半成品流程
- 發佈失敗會停在執行流程中，不會誤改原始 repo 版本

## 5. 與自動發佈 (auto-release) 銜接

完成 seed 後，建議流程：

1. 在 npm 完成第一版後設定 Trusted Publishing (package 設定頁)
2. 用一般開發流程提交變更到 `main`
3. 觸發 `.github/workflows/auto-release.yml` (自動 patch bump + release + npm publish)

這樣 `publish:seed` 只負責「第一次初始化」，後續版本都透過 CI 版本流程。

## 6. 指令範例

### 一般用法 (用預設)

```powershell
bun run publish:seed
```

### 指定版本與 tag

```powershell
bun run publish:seed -- -Version 0.1.0 -Tag latest
```

### 測試流程 (不 publish)

```powershell
bun run publish:seed -- -Version 0.1.0 -DryRun
```

### 保留暫存目錄檢查

```powershell
bun run publish:seed -- -Version 0.1.0 -KeepWorkspace
```

## 7. 與 `publish:seed` 的關係 (實際對外介面)

在 `package.json` 中：

- `publish:seed` 已封裝常用預設參數 (`-Version 0.1.0 -Tag latest`)
- 如需覆蓋，可加上 `--` 後續參數，例如：
  - `bun run publish:seed -- -Version 0.2.0 -DryRun`
