<#
.SYNOPSIS
初始化種子版（seed publish）發佈腳本，用於首次將套件發佈到 npm。

.DESCRIPTION
此腳本為第一次發佈設計，會將專案的最小必要檔案複製到暫存目錄後，在暫存環境中執行 npm publish。
設計目的在於避免直接在原始目錄污染發佈流程，並且保留可複現的發佈步驟。

流程：
1. 檢查 bun/npm/node 可執行。
2. 驗證 package.json（scoped package 且 private=false）。
3. 若無 dist/index.js，先執行 bun run build。
4. 檢查 npm 是否已登入（npm whoami）。
5. 將必要檔案複製到暫存目錄後發佈。
6. 發佈完成後清除暫存目錄（除非設定 -KeepWorkspace）。

.PARAMETER RepoRoot
指定專案根目錄。預設為目前工作目錄。

.PARAMETER Registry
指定 npm registry。預設為 https://registry.npmjs.org/。

.PARAMETER Tag
指定 npm tag。預設為 latest。

.PARAMETER Version
可指定要發佈的版本（SemVer，例：0.1.0）。
若未指定則保留 package.json 中原本版本。

.PARAMETER DryRun
僅驗證流程，不實際執行 npm publish。

.PARAMETER KeepWorkspace
保留臨時工作目錄，便於發生錯誤時排查。

.PARAMETER Help
顯示完整說明並離開。

.EXAMPLE
bun run publish:seed

.EXAMPLE
bun run publish:seed -- -Version 0.1.0 -Tag latest

.EXAMPLE
bun run publish:seed -- -Version 0.1.0 -DryRun -KeepWorkspace

.NOTES
首次種子版建議用公開 tag（latest）發佈。成功後再改用 GitHub Actions + Trusted Publishing 的自動發行流程。
#>

param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$Registry = "https://registry.npmjs.org/",
  [string]$Tag = "latest",
  [string]$Version = "",
  [switch]$DryRun,
  [switch]$KeepWorkspace,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Get-Help -Full $PSCommandPath
  exit 0
}

function Fail($message) {
  Write-Error $message
  exit 1
}

function Assert-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Fail "缺少命令：$name，請先安裝並加入 PATH。"
  }
}

Assert-Command bun
Assert-Command npm
Assert-Command node

$repo = Resolve-Path $RepoRoot | Select-Object -ExpandProperty Path
$pkgPath = Join-Path $repo "package.json"

if (-not (Test-Path $pkgPath)) {
  Fail "找不到 package.json：$pkgPath"
}

$package = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($null -eq $package.name -or -not $package.name.StartsWith("@")) {
  Fail "package.json 的 name 需為 scoped package，例如 @willh/github-issues-exporter。"
}
if ($package.private -eq $true) {
  Fail "package.json private 必須是 false。"
}

if (-not (Test-Path (Join-Path $repo "dist/index.js"))) {
  Write-Host "dist/index.js 不存在，先執行 bun run build ..."
  Push-Location $repo
  try {
    bun run build
  } finally {
    Pop-Location
  }
}

if ($Version -and $Version -match "^\d+\.\d+\.\d+$") {
  $package.version = $Version
} elseif ($Version) {
  Fail "Version 格式不正確，請使用 SemVer x.y.z（例如 0.1.0）。"
}

try {
  Push-Location $repo
  $who = npm whoami --registry $Registry 2>$null
} catch {
  Fail "npm 尚未登入，請先執行 npm login。"
} finally {
  Pop-Location
}

$temp = Join-Path $env:TEMP "npm-seed-publish-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temp | Out-Null
Write-Host "暫存工作目錄：$temp"

try {
  $publishRoot = Join-Path $temp "workspace"
  New-Item -ItemType Directory -Path $publishRoot | Out-Null

  Copy-Item (Join-Path $repo "package.json") -Destination (Join-Path $publishRoot "package.json")
  if (Test-Path (Join-Path $repo "tsconfig.json")) {
    Copy-Item (Join-Path $repo "tsconfig.json") -Destination (Join-Path $publishRoot "tsconfig.json")
  }
  if (Test-Path (Join-Path $repo "README.md")) {
    Copy-Item (Join-Path $repo "README.md") -Destination (Join-Path $publishRoot "README.md")
  }
  if (Test-Path (Join-Path $repo "CHANGELOG.md")) {
    Copy-Item (Join-Path $repo "CHANGELOG.md") -Destination (Join-Path $publishRoot "CHANGELOG.md")
  }
  if (Test-Path (Join-Path $repo "LICENSE")) {
    Copy-Item (Join-Path $repo "LICENSE") -Destination (Join-Path $publishRoot "LICENSE")
  }
  if (Test-Path (Join-Path $repo "dist")) {
    Copy-Item (Join-Path $repo "dist") -Destination (Join-Path $publishRoot "dist") -Recurse -Force
  }

  if ($Version) {
    $stagedPackagePath = Join-Path $publishRoot "package.json"
    $stagedPackage = Get-Content $stagedPackagePath -Raw | ConvertFrom-Json
    $stagedPackage.version = $package.version
    $stagedPackage | ConvertTo-Json -Depth 10 | Set-Content $stagedPackagePath
  }

  $pkg = Get-Content (Join-Path $publishRoot "package.json") -Raw | ConvertFrom-Json
  if (-not $pkg.version) {
    Fail "package.json 缺少 version。"
  }

  Write-Host "預估發佈套件：$($pkg.name)@$($pkg.version)"
  Write-Host "暫存目錄版本內容已就緒。"

  if ($DryRun) {
    Write-Host "DryRun 模式：不執行 npm publish。"
    exit 0
  }

  Push-Location $publishRoot
  try {
    if ($Tag -eq "latest") {
      npm publish --access public --registry $Registry --tag $Tag
    } else {
      npm publish --access public --registry $Registry --tag $Tag
    }
  } finally {
    Pop-Location
  }

  Write-Host "已完成種子版發佈：$($pkg.name)@$($pkg.version)"
  $published = npm view "$($pkg.name)@$($pkg.version)" version --registry $Registry 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "npm 驗證成功：$published"
  } else {
    Write-Host "發佈命令成功，但尚未即時驗證版本，請稍後執行 npm view $($pkg.name) version"
  }
} finally {
  if ($KeepWorkspace) {
    Write-Host "KeepWorkspace = true，保留暫存目錄：$temp"
  } else {
    Remove-Item -Recurse -Force $temp
    Write-Host "已清除暫存目錄：$temp"
  }
}
