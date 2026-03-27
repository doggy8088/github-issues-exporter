# Agent Skill：GitHub Actions + npm Trusted Publishing 自動發佈排查

本 Skill 用於在本專案（`@willh/github-issues-exporter`）上，快速診斷與修正 npm Trusted Publishing 的 CI 失敗。  
請直接依順序執行「快速確認 → 修正 → 驗證」三層流程。

## 目標

- 在 `auto-release` workflow 成功完成 `npm publish --provenance --access public`
- 發佈時不需要手動 `NPM_TOKEN`
- GitHub Actions 依賴 `id-token: write` + OIDC 設定穩定運作
- `workflow-lint` 不再失敗

## 先決條件

- 套件名稱：`@willh/github-issues-exporter`
- `package.json`:
  - `private: false`
  - `repository.url` 指向 `https://github.com/<owner>/<repo>.git`
- Workflow 權限：
  - `contents: write`
  - `id-token: write`
- npm 上已完成 package / scope 對應的 Trusted Publishing 設定

## 快速調查順序（優先順序）

1. 先看 workflow-lint
   - `gh run list --workflow=workflow-lint --branch=main`
   - 若失敗，先修正 workflow 語法再談 publish 邏輯
2. 再看 auto-release run
   - `gh run list --workflow=auto-release --branch=main`
3. 只聚焦最後一段錯誤訊息：  
   - YAML parse error / shellcheck / npm error code

## 常見失敗類型與修正

### 1) `actionlint` YAML parse error（`workflow-lint` 失敗）

現象：
- 例：`.github/workflows/auto-release.yml` line 19 parse error
- 常見訊息：`could not parse as YAML: mapping values are not allowed in this context`

修正：
- 避免在 `if:` 的 expression 中放容易踩到 YAML/冒號解讀的字串片段
- 例如：將 `startsWith(github.event.head_commit.message, 'chore(release): v')` 改為
  `startsWith(..., 'chore(release)')`
- 之後重新 push，確認 `workflow-lint` 全綠

### 2) shellcheck 認為 `run` 區塊語法錯誤

現象：
- `SC1009` / `SC1072` / `SC1073` / `SC1078` / `SC1079` 出現在 `node <<'NODE'` heredoc 區段

修正：
- 避免在 step 的 `$()` 中直接嵌 heredoc
- 改成先寫入暫存 `.js` 檔再 `node "$TMP_SCRIPT"`
- 保留行為不變，只改 shell 可讀性與解析穩定度

### 3) `Setup Node.js` 找不到版本（`Unable to find Node version 'lts'`）

現象：
- `actions/setup-node` 使用 `lts` 在某 runner 導致解析失敗

修正：
- 將 Node 版本固定為可用明確值（如 `22`）
- 例如：
  - `node-version: "22"`

### 4) `npm publish` 回傳 `ENEEDAUTH`（`You need to be logged in`）

現象：
- Workflow 步驟顯示 `need auth ... adduser`

修正：
- 檢查 `NPM` Trusted Publishing 是否真的已在 npm 端生效
- 確認 workflow 權限有 `id-token: write`
- 此問題通常在 OIDC 尚未建立/尚未對齊 repo/package 時發生

### 5) `422 Unprocessable Entity` + provenance 驗證錯誤

現象：
- `Error verifying sigstore provenance bundle: Failed to validate repository information`
- 錯誤內容提到 `package.json: "repository.url" is ""`

修正（最關鍵）：
- `package.json` 補齊：
  - `repository.url: "https://github.com/doggy8088/github-issues-exporter.git"`
  - optional: `homepage`、`bugs`
- 沒有 `repository.url` 時，trusted publishing 的 provenance 會比對失敗

## 已完成修正（本次案例）

- commit `c3fb568`：修正 auto-release `if` 條件式
- commit `09b951b`：修正 release commit 判斷前綴
- commit `640103d`：重寫版本計算 step 的 shell 寫法，通過 shellcheck
- commit `bbf452f`：將 Node 版本改為 22
- commit `f3d0ce7`：加入 `npm install -g npm@latest`
- commit `2361a0a`：補上 `package.json` 的 `repository.url`（以及 `homepage`/`bugs`）

## 建議的最小維持流程（可複製）

```bash
# 1) 檢查 workflow-lint
gh run list --workflow=workflow-lint --branch=main --limit 1

# 2) 推進 auto-release，若失敗先看最後一步錯誤
gh run list --workflow=auto-release --branch=main --limit 1
gh run view <run-id> --log | Select-String -Pattern "error","syntax","422","ENEEDAUTH","provenance"

# 3) 補正後重跑
git push
```

## 常用驗證指令（CI 後）

- `gh run view <run-id> --json conclusion,jobs`
- `gh run view <run-id> --log | Select-String -Pattern "npm publish|provenance|GitHub Release|workflow-lint"`
- `cat package.json` 確認 `private`、`repository`、`files` 是否正確

## 收斂原則

- 先修 workflow 語法，再修發佈權限/metadata
- 讓每次變更只改一件事，便於隔離責任
- 每次修一次就重新觀察 CI，避免連環改動
- 以 `workflow-lint` 通過為入口條件，不讓 publish 步驟被遮蔽

