import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import MOL from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(__dirname, "../tests/test-files");
const transforms = {
  camelCase: MOL.camelCase,
  identity: MOL.identity,
};

const molFiles = await collectMolFiles(fixturesRoot);
let generated = 0;
let skipped = 0;

for (const molFile of molFiles) {
  const source = await fs.readFile(molFile, "utf8");
  for (const [mode, transform] of Object.entries(transforms)) {
    const jsonFile = molFile.replace(/\.mol$/u, `.${mode}.json`);

    try {
      await fs.access(jsonFile);
      skipped += 1;
      continue;
    } catch {
      // Missing expectation; generate below.
    }

    const result = MOL.parse(source, transform);
    await fs.writeFile(jsonFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    generated += 1;
    console.log(`generated ${path.relative(fixturesRoot, jsonFile)}`);
  }
}

console.log(`generated ${generated} missing fixture file(s)`);
console.log(`skipped ${skipped} existing fixture file(s)`);

async function collectMolFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMolFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".mol")) {
      files.push(fullPath);
    }
  }

  files.sort();
  return files;
}
