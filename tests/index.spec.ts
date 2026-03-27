import {describe, expect, test} from "bun:test";
import {
  extractAttachmentUrls,
  isAttachmentUrl,
  parseArgs,
  parseTargetUrl,
  sanitizeFilename,
  replaceAttachmentUrls,
  attachmentFilename,
} from "../src/index";

describe("CLI argument parser", () => {
  test("解析預設參數與位置參數 URL", () => {
    const args = parseArgs(["bun", "src/index.ts", "https://github.com/doggy8088/GitHubClaw/issues"]);
    expect(args.positionalUrl).toBe("https://github.com/doggy8088/GitHubClaw/issues");
    expect(args.url).toBe(null);
    expect(args.state).toBe("all");
    expect(args.pageSize).toBe(100);
    expect(args.maxPages).toBe(0);
    expect(args.maxCommentPages).toBe(0);
    expect(args.noAttachments).toBe(false);
    expect(args.skipComments).toBe(false);
  });

  test("解析 --url 與各旗標", () => {
    const args = parseArgs([
      "bun",
      "src/index.ts",
      "--url",
      "https://github.com/owner/repo/issues/123",
      "--github-id",
      "me",
      "--out-dir",
      "./tmp",
      "--state",
      "closed",
      "--page-size",
      "50",
      "--max-pages",
      "2",
      "--max-comment-pages",
      "3",
      "--force",
      "--verbose",
    ]);

    expect(args.url).toBe("https://github.com/owner/repo/issues/123");
    expect(args.positionalUrl).toBe(null);
    expect(args.githubId).toBe("me");
    expect(args.outDir).toBe("./tmp");
    expect(args.state).toBe("closed");
    expect(args.pageSize).toBe(50);
    expect(args.maxPages).toBe(2);
    expect(args.maxCommentPages).toBe(3);
    expect(args.force).toBe(true);
    expect(args.verbose).toBe(true);
  });

  test("不合法參數會拋錯", () => {
    expect(() => parseArgs(["bun", "src/index.ts", "--state", "bad"])).toThrow("只能是 open/closed/all");
  });

  test("--help 會直接回傳 help flag", () => {
    const args = parseArgs(["bun", "src/index.ts", "--help"]);
    expect(args.help).toBe(true);
  });
});

describe("URL parser", () => {
  test("repo 模式 URL", () => {
    const t = parseTargetUrl("https://github.com/owner/repo/issues");
    expect(t).toEqual({mode: "repo", owner: "owner", repo: "repo", issueNumber: null});
  });

  test("single issue URL", () => {
    const t = parseTargetUrl("https://github.com/owner/repo/issues/88");
    expect(t.mode).toBe("issue");
    expect(t.issueNumber).toBe(88);
  });

  test("錯誤格式會拋錯", () => {
    expect(() => parseTargetUrl("https://github.com/owner/repo/pulls/1")).toThrow("URL 必須為 issues 路徑");
    expect(() => parseTargetUrl("https://example.com/owner/repo/issues")).toThrow("僅支援 github.com");
  });
});

describe("附件輔助函式", () => {
  test("sanitizeFilename 會移除不安全字元", () => {
    expect(sanitizeFilename("foo/bar\\baz:qux.txt")).toBe("foo_bar_baz_qux.txt");
  });

  test("isAttachmentUrl 判斷", () => {
    expect(isAttachmentUrl("https://raw.githubusercontent.com/a/b/c.png")).toBe(true);
    expect(isAttachmentUrl("https://github.com/owner/repo/user-attachments/assets/abc123")).toBe(true);
    expect(isAttachmentUrl("https://example.com/file.bin?download=true")).toBe(false);
  });

  test("extractAttachmentUrls 會抽出 markdown + img + markdown link", () => {
    const text = `
      ![alt](https://raw.githubusercontent.com/u/r/f.txt)
      <img src='https://user-images.githubusercontent.com/u/r/p.png'>
      [readme](https://github.com/owner/repo/user-attachments/assets/abc)
      [ignore](https://example.com/ignore.doc)
    `;
    const result = extractAttachmentUrls(text);
    expect(result).toContain("https://raw.githubusercontent.com/u/r/f.txt");
    expect(result).toContain("https://user-images.githubusercontent.com/u/r/p.png");
    expect(result).toContain("https://github.com/owner/repo/user-attachments/assets/abc");
    expect(result).not.toContain("https://example.com/ignore.doc");
  });

  test("attachmentFilename 會避免衝突", () => {
    const used = new Set<string>();
    const first = attachmentFilename("https://raw.githubusercontent.com/a/b/c.png", used);
    const second = attachmentFilename("https://raw.githubusercontent.com/a/b/c.png", used);
    expect(first).toMatch(/^c__[\da-f]{10}\.png$/);
    expect(second).not.toBe(first);
    expect(used.has(first)).toBe(true);
    expect(used.has(second)).toBe(true);
  });

  test("replaceAttachmentUrls 會替換網址為本機路徑", () => {
    const text = "A=[link](https://raw.githubusercontent.com/a/b/c.txt) B=https://raw.githubusercontent.com/a/b/c.txt";
    const out = replaceAttachmentUrls(text, {
      "https://raw.githubusercontent.com/a/b/c.txt": "./123/c__abc.txt",
    });
    expect(out).toBe("A=[link](./123/c__abc.txt) B=./123/c__abc.txt");
  });
});
