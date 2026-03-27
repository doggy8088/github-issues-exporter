#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";

type Semver = { major: number; minor: number; patch: number };

const packagePath = new URL("../package.json", import.meta.url);

function parseVersion(value: string): Semver {
  const parts = value.split(".");
  if (parts.length !== 3) {
    throw new Error(`版本格式不正確：${value}，預期為 x.y.z`);
  }

  const [major, minor, patch] = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new Error(`版本格式不正確：${value}，版本號段必須為數字`);
    }
    return Number(part);
  });

  return { major, minor, patch };
}

const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
const currentVersion = pkg.version ?? "0.0.0";

const parsed = parseVersion(currentVersion);
const nextVersion = `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;

pkg.version = nextVersion;
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

console.log(nextVersion);
