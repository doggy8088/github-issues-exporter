#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import {URL} from "node:url";
import http from "node:http";
import https from "node:https";

export const GITHUB_ATTACHMENT_HOSTS = new Set([
  "user-images.githubusercontent.com",
  "raw.githubusercontent.com",
  "github.com",
  "github-production-user-asset-6210df.s3.amazonaws.com",
  "github-production-release-asset-2e65be.s3.amazonaws.com",
  "objects.githubusercontent.com",
]);

export const KNOWN_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".pdf", ".zip",
  ".txt", ".log", ".json", ".yaml", ".yml", ".csv", ".md", ".mp4", ".mov",
  ".mp3", ".wav", ".exe",
]);

export const EXIT_CODE = {
  OK: 0,
  ARGUMENT: 1,
  GH_ERROR: 2,
  RUNTIME_ERROR: 3,
} as const;

type TargetMode = "repo" | "issue";

export interface ParsedTarget {
  mode: TargetMode;
  owner: string;
  repo: string;
  issueNumber: number | null;
}

export interface CliArgs {
  positionalUrl: string | null;
  url: string | null;
  githubId: string;
  outDir: string;
  outDirExplicit: boolean;
  state: "open" | "closed" | "all";
  pageSize: number;
  maxPages: number;
  maxCommentPages: number;
  noAttachments: boolean;
  skipComments: boolean;
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
}

interface GhIssue {
  number: number;
  [key: string]: unknown;
}

interface GhComment {
  body?: string | null;
  [key: string]: unknown;
}

interface AttachmentRecord {
  source_url: string;
  local_path: string | null;
  filename: string;
  sha1: string | null;
  scope: ("issue" | "comment")[];
  error?: string;
}

export function usage(): string {
  return `
使用方式:
  bun run src/index.ts [--url URL] [options] [url]

位置參數:
  url
    GitHub issues URL, e.g. /{owner}/{repo}/issues 或 /{owner}/{repo}/issues/{number}

選項:
  --url <url>                  與位置參數相同的 URL 輸入
  --github-id <name>           指定輸出目錄中的 github-id（預設取 gh 登入帳號）
  --out-dir <path>             輸出根目錄（預設: 目前目錄）
  --state <open|closed|all>    repo 模式 issue 過濾（預設: all）
  --page-size <n>              API 每頁筆數（預設: 100）
  --max-pages <n>              限制 repo issue 分頁數（0=不限制）
  --max-comment-pages <n>      限制每張 issue comment 分頁數（0=不限制）
  --no-attachments             不下載附件，只保留附件原始網址
  --skip-comments              不匯出 comments
  --force                      覆寫已存在的 issue 檔
  --dry-run                    只做參數與 gh 驗證，不寫檔
  --verbose                    顯示詳細流程
  --help                       顯示本說明

輸出:
  預設：{out-dir}/{github-id}/{repo}/{issue-id}.json
  指定 --out-dir 時：{out-dir}/{issue-id}.json
  附件目錄: {out-dir}/{issue-id}/
`;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    positionalUrl: null,
    url: null,
    githubId: "",
    outDir: ".",
    outDirExplicit: false,
    state: "all",
    pageSize: 100,
    maxPages: 0,
    maxCommentPages: 0,
    noAttachments: false,
    skipComments: false,
    force: false,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      return args;
    }
    if (arg === "--url") {
      if (i + 1 >= argv.length) throw new Error("--url 需要一個參數");
      args.url = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--github-id") {
      if (i + 1 >= argv.length) throw new Error("--github-id 需要一個參數");
      args.githubId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--out-dir") {
      if (i + 1 >= argv.length) throw new Error("--out-dir 需要一個參數");
      args.outDir = argv[i + 1];
      args.outDirExplicit = true;
      i += 1;
      continue;
    }
    if (arg === "--state") {
      if (i + 1 >= argv.length) throw new Error("--state 需要一個參數");
      const v = argv[i + 1];
      if (!["open", "closed", "all"].includes(v)) {
        throw new Error(`--state 只能是 open/closed/all，收到 ${v}`);
      }
      args.state = v as "open" | "closed" | "all";
      i += 1;
      continue;
    }
    if (arg === "--page-size") {
      if (i + 1 >= argv.length) throw new Error("--page-size 需要一個參數");
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isNaN(n) || n <= 0) {
        throw new Error(`--page-size 必須是正整數，收到 ${argv[i + 1]}`);
      }
      args.pageSize = n;
      i += 1;
      continue;
    }
    if (arg === "--max-pages") {
      if (i + 1 >= argv.length) throw new Error("--max-pages 需要一個參數");
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isNaN(n) || n < 0) {
        throw new Error(`--max-pages 必須是 0 或正整數，收到 ${argv[i + 1]}`);
      }
      args.maxPages = n;
      i += 1;
      continue;
    }
    if (arg === "--max-comment-pages") {
      if (i + 1 >= argv.length) throw new Error("--max-comment-pages 需要一個參數");
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isNaN(n) || n < 0) {
        throw new Error(`--max-comment-pages 必須是 0 或正整數，收到 ${argv[i + 1]}`);
      }
      args.maxCommentPages = n;
      i += 1;
      continue;
    }
    if (arg === "--no-attachments") args.noAttachments = true;
    else if (arg === "--skip-comments") args.skipComments = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg.startsWith("--")) {
      throw new Error(`未知參數: ${arg}`);
    } else if (args.positionalUrl === null) {
      args.positionalUrl = arg;
    } else {
      throw new Error(`收到多個 URL 參數: ${args.positionalUrl}, ${arg}`);
    }
  }
  return args;
}

function runGh(args: string[]): string {
  try {
    const out = execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return String(out ?? "").trim();
  } catch (err: unknown) {
    const anyErr = err as {stderr?: unknown; stdout?: unknown; message?: string};
    const stderr = typeof anyErr.stderr === "string" ? anyErr.stderr.trim() : "";
    const stdout = typeof anyErr.stdout === "string" ? anyErr.stdout.trim() : "";
    const msg = stderr || stdout || anyErr.message || "GitHub CLI 執行失敗";
    const wrapped = new Error(msg);
    throw wrapped;
  }
}

function ensureGhReady(verbose: boolean): string {
  runGh(["--version"]);
  runGh(["auth", "status"]);
  if (verbose) {
    runGh(["auth", "status"]);
  }
  return getGhLogin();
}

function getGhLogin(): string {
  const login = runGh(["api", "user", "-q", ".login"]);
  if (!login) throw new Error("無法從 gh 取得登入帳號（.login）");
  return login;
}

function getGhToken(): string {
  return runGh(["auth", "token"]);
}

export function parseTargetUrl(raw: string): ParsedTarget {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("URL 格式不正確");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("僅支援 http/https URL");
  }
  if (parsed.hostname.toLowerCase() !== "github.com") {
    throw new Error("僅支援 github.com");
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 3) {
    throw new Error("URL 不符合格式，請使用 /{owner}/{repo}/issues 或 /{owner}/{repo}/issues/{number}");
  }
  if (parts[2] !== "issues") {
    throw new Error("URL 必須為 issues 路徑");
  }
  const owner = parts[0];
  const repo = parts[1];
  if (parts.length === 3) {
    return {mode: "repo", owner, repo, issueNumber: null};
  }
  if (parts.length === 4) {
    const issueNumber = Number.parseInt(parts[3], 10);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      throw new Error("Issue URL 不正確，issue number 必須為正整數");
    }
    return {mode: "issue", owner, repo, issueNumber};
  }
  throw new Error("URL 格式不支援，僅支援 /issues 或 /issues/{number}");
}

function ghApiJson<T>(pathUrl: string, params?: Record<string, string>): T {
  let endpoint = pathUrl;
  if (params && Object.keys(params).length > 0) {
    const q = new URLSearchParams(params).toString();
    endpoint = `${pathUrl}?${q}`;
  }
  const raw = runGh(["api", endpoint]);
  return JSON.parse(raw) as T;
}

function fetchIssues(owner: string, repo: string, state: "open" | "closed" | "all", pageSize: number, maxPages: number): GhIssue[] {
  const all: GhIssue[] = [];
  let page = 1;
  while (true) {
    const issues = ghApiJson<unknown[]>(`/repos/${owner}/${repo}/issues`, {
      state,
      per_page: String(pageSize),
      page: String(page),
    });
    if (!Array.isArray(issues) || issues.length === 0) break;
    for (const issue of issues as GhIssue[]) {
      if (!(issue as {pull_request?: unknown}).pull_request) {
        all.push(issue as GhIssue);
      }
    }
    if (issues.length < pageSize) break;
    page += 1;
    if (maxPages > 0 && page > maxPages) break;
  }
  return all;
}

function fetchIssue(owner: string, repo: string, issueNumber: number): GhIssue {
  return ghApiJson<GhIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
}

function fetchComments(owner: string, repo: string, issueNumber: number, pageSize: number, maxPages: number): GhComment[] {
  const all: GhComment[] = [];
  let page = 1;
  while (true) {
    const comments = ghApiJson<unknown[]>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      per_page: String(pageSize),
      page: String(page),
    });
    if (!Array.isArray(comments) || comments.length === 0) break;
    all.push(...comments.map((item) => item as GhComment));
    if (comments.length < pageSize) break;
    page += 1;
    if (maxPages > 0 && page > maxPages) break;
  }
  return all;
}

export function isAttachmentUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    const p = u.pathname.toLowerCase();
    const ext = path.extname(p).toLowerCase();
    if (GITHUB_ATTACHMENT_HOSTS.has(host)) {
      if (host === "github.com" && p.includes("/user-attachments/assets/")) return true;
      if (KNOWN_EXTS.has(ext)) return true;
    }
    return KNOWN_EXTS.has(ext);
  } catch {
    return false;
  }
}

export function extractAttachmentUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const urls = new Set<string>();
  const patterns = [
    /!\[[^\]]*?\]\((https?:\/\/[^)\s]+)\)/gi,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /\[[^\]]+?\]\((https?:\/\/[^)\s]+)\)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) urls.add(m[1]);
    }
  }
  return [...urls].filter(isAttachmentUrl);
}

export function sanitizeFilename(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").trim();
  const trimmed = safe.slice(0, 120);
  return trimmed || "attachment";
}

function hashString(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function hashBuffer(value: Buffer): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

export function attachmentFilename(urlValue: string, used: Set<string>): string {
  const parsed = new URL(urlValue);
  const fileName = path.basename(parsed.pathname) || "attachment";
  const ext = path.extname(fileName).toLowerCase();
  const stem = sanitizeFilename(path.basename(fileName, ext) || "attachment");
  const h = hashString(urlValue).slice(0, 10);
  let candidate = `${stem}__${h}${ext || ".bin"}`;
  if (used.has(candidate)) {
    candidate = `${stem}__${h}_${hashString(`${urlValue}::${candidate}`).slice(0, 8)}${ext || ".bin"}`;
  }
  used.add(candidate);
  return candidate;
}

function downloadBinary(urlValue: string, token: string, verbose = false, redirectLeft = 5): Promise<{data: Buffer}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlValue);
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.get(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          "User-Agent": "github-issues-exporter",
          Accept: "application/octet-stream",
          ...(token ? {Authorization: `token ${token}`} : {}),
        },
      },
      (res: import("node:http").IncomingMessage) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          const location = (res.headers.location || "") as string;
          if (redirectLeft <= 0 || !location) {
            reject(new Error("下載重導失敗"));
            return;
          }
          const next = new URL(location, parsed.href).toString();
          downloadBinary(next, token, verbose, redirectLeft - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ""}`.trim()));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const data = Buffer.concat(chunks);
          try {
            if (verbose) console.log(`Downloaded: ${urlValue} (${data.length} bytes)`);
            resolve({data});
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on("error", (e) => reject(e));
  });
}

export function replaceAttachmentUrls(text: string | null | undefined, urlMap: Record<string, string>): string | null | undefined {
  if (!text) return text;
  let output = text;
  const keys = Object.keys(urlMap).sort((a, b) => b.length - a.length);
  for (const src of keys) {
    output = output.split(src).join(urlMap[src]);
  }
  return output;
}

async function processIssue(params: {
  issue: GhIssue;
  owner: string;
  repo: string;
  githubId: string;
  outDir: string;
  useDefaultRepoPath: boolean;
  token: string;
  includeComments: boolean;
  skipAttachments: boolean;
  pageSize: number;
  maxCommentPages: number;
  force: boolean;
  verbose: boolean;
}): Promise<string> {
  const {issue, owner, repo, githubId, outDir, token, includeComments, skipAttachments, pageSize, maxCommentPages, force, verbose} = params;
  const issueNumber = issue.number;
  if (!Number.isInteger(issueNumber)) {
    throw new Error("Issue 缺少 number");
  }

  const repoDir = params.useDefaultRepoPath ? path.join(outDir, githubId, repo) : outDir;
  fs.mkdirSync(repoDir, {recursive: true});
  const outputFile = path.join(repoDir, `${issueNumber}.json`);

  if (fs.existsSync(outputFile) && !force) {
    throw new Error("skip existing");
  }

  const comments = includeComments ? fetchComments(owner, repo, issueNumber, pageSize, maxCommentPages) : [];
  const urlScopes = new Map<string, Set<"issue" | "comment">>();
  for (const u of extractAttachmentUrls(issue.body as string | null | undefined)) {
    if (!urlScopes.has(u)) urlScopes.set(u, new Set());
    urlScopes.get(u)!.add("issue");
  }
  for (const c of comments) {
    for (const u of extractAttachmentUrls(c.body)) {
      if (!urlScopes.has(u)) urlScopes.set(u, new Set());
      urlScopes.get(u)!.add("comment");
    }
  }

  const attachmentMap: Record<string, string> = {};
  const attachments: AttachmentRecord[] = [];
  const usedNames = new Set<string>();
  const attachmentDir = path.join(repoDir, String(issueNumber));
  let attachmentDirReady = false;

  if (!skipAttachments) {
    for (const [urlValue, scopeSet] of urlScopes) {
      const fileName = attachmentFilename(urlValue, usedNames);
      const rel = path.join(String(issueNumber), fileName).split(path.sep).join("/");
      const abs = path.join(repoDir, rel);
      try {
        const result = await downloadBinary(urlValue, token, verbose);
        if (!attachmentDirReady) {
          fs.mkdirSync(attachmentDir, {recursive: true});
          attachmentDirReady = true;
        }
        fs.writeFileSync(abs, result.data);
        const digest = hashBuffer(result.data);
        attachmentMap[urlValue] = `./${rel}`;
        attachments.push({
          source_url: urlValue,
          local_path: `./${rel}`,
          filename: path.basename(abs),
          sha1: digest,
          scope: [...scopeSet].sort(),
        });
      } catch (e) {
        attachmentMap[urlValue] = urlValue;
        attachments.push({
          source_url: urlValue,
          local_path: null,
          filename: fileName,
          sha1: null,
          scope: [...scopeSet].sort(),
          error: (e as Error).message,
        });
      }
    }
  }

  const issuePayload = JSON.parse(JSON.stringify(issue)) as Record<string, unknown>;
  const originalIssueBody = issuePayload.body as string | null | undefined;
  const rewrittenIssueBody = replaceAttachmentUrls(originalIssueBody, attachmentMap);
  if (rewrittenIssueBody !== originalIssueBody && rewrittenIssueBody !== undefined && rewrittenIssueBody !== null) {
    issuePayload.body = rewrittenIssueBody;
    issuePayload.body_local = rewrittenIssueBody;
  }

  const commentsPayload: GhComment[] = [];
  for (const c of comments) {
    const cp = JSON.parse(JSON.stringify(c)) as Record<string, unknown> & GhComment;
    const originalBody = cp.body as string | null | undefined;
    const rewritten = replaceAttachmentUrls(originalBody, attachmentMap);
    if (rewritten !== originalBody && rewritten !== undefined && rewritten !== null) {
      cp.body = rewritten;
      cp.body_local = rewritten;
    }
    commentsPayload.push(cp as GhComment);
  }

  const exportObj = {
    issue_id: issueNumber,
    owner,
    repo,
    issue: issuePayload,
    comments: commentsPayload,
    attachments,
    export_meta: {
      github_id: githubId,
      generated_at: new Date().toISOString(),
      include_comments: includeComments,
      skip_attachments: skipAttachments,
    },
  };

  fs.writeFileSync(outputFile, JSON.stringify(exportObj, null, 2), "utf8");
  if (verbose) {
    console.log(`Exported #${issueNumber} -> ${outputFile}`);
  }
  return outputFile;
}

export async function run(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`參數錯誤: ${(e as Error).message}`);
    console.error(usage());
    return EXIT_CODE.ARGUMENT;
  }

  if (args.help) {
    console.log(usage());
    return EXIT_CODE.OK;
  }

  const inputUrl = args.url || args.positionalUrl;
  if (!inputUrl) {
    console.error("缺少 URL，請用位置參數或 --url 提供");
    console.error(usage());
    return EXIT_CODE.ARGUMENT;
  }

  let target: ParsedTarget;
  try {
    target = parseTargetUrl(inputUrl);
  } catch (e) {
    console.error(`URL 解析失敗: ${(e as Error).message}`);
    return EXIT_CODE.ARGUMENT;
  }

  let login = "";
  try {
    login = ensureGhReady(args.verbose);
  } catch (e) {
    console.error((e as Error).message);
    return EXIT_CODE.GH_ERROR;
  }

  const githubId = args.githubId.trim() || login;
  const outDir = path.resolve(args.outDir || ".");
  const useDefaultRepoPath = !args.outDirExplicit;
  const token = args.noAttachments ? "" : getGhToken();

  if (args.dryRun) {
    console.log(`[DRY-RUN] target=${target.owner}/${target.repo} mode=${target.mode}`);
    console.log(`[DRY-RUN] output=${outDir}`);
    console.log(`[DRY-RUN] github-id=${githubId}`);
    return EXIT_CODE.OK;
  }

  let issues: GhIssue[] = [];
  try {
    if (target.mode === "repo") {
      issues = fetchIssues(target.owner, target.repo, args.state, args.pageSize, args.maxPages);
    } else if (target.issueNumber !== null) {
      const issue = fetchIssue(target.owner, target.repo, target.issueNumber);
      if (!(issue as {pull_request?: unknown}).pull_request) {
        issues = [issue];
      }
    }
  } catch (e) {
    console.error(`抓取 issue 失敗: ${(e as Error).message}`);
    return EXIT_CODE.RUNTIME_ERROR;
  }

  if (!Array.isArray(issues) || issues.length === 0) {
    console.log("No issues found.");
    return EXIT_CODE.OK;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const issue of issues) {
    try {
      await processIssue({
        issue,
        owner: target.owner,
        repo: target.repo,
        githubId,
        outDir,
        useDefaultRepoPath,
        token,
        includeComments: !args.skipComments,
        skipAttachments: args.noAttachments,
        pageSize: args.pageSize,
        maxCommentPages: args.maxCommentPages,
        force: args.force,
        verbose: args.verbose,
      });
      ok += 1;
    } catch (e) {
      if ((e as Error).message.includes("skip existing")) {
        skipped += 1;
        if (args.verbose) console.log(`[skip] #${issue.number}`);
      } else {
        failed += 1;
        console.error(`Failed issue #${issue.number}: ${(e as Error).message}`);
      }
    }
  }

  console.log(`Summary: exported=${ok}, skipped=${skipped}, failed=${failed}, output_root=${outDir}`);
  return failed === 0 ? EXIT_CODE.OK : EXIT_CODE.RUNTIME_ERROR;
}
