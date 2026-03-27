import fs from "node:fs";

const entry = "dist/cli.js";
const header = "#!/usr/bin/env node\n";

if (!fs.existsSync(entry)) {
  throw new Error(`${entry} not found`);
}

const content = fs.readFileSync(entry, "utf8");
if (!content.startsWith("#!")) {
  fs.writeFileSync(entry, `${header}${content}`);
}
