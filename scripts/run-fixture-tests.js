import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import MOL from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(__dirname, "../tests/test-files");

const molFiles = await collectMolFiles(fixturesRoot);
const failures = [];
const missing = [];
let passed = 0;

for (const molFile of molFiles) {
  const expectations = await findExpectations(molFile);
  if (expectations.length === 0) {
    missing.push(path.relative(fixturesRoot, molFile));
    continue;
  }

  const source = await fs.readFile(molFile, "utf8");
  const actual = MOL.parse(source, MOL.camelCase);
  let matched = false;

  for (const expectationFile of expectations) {
    const expected = JSON.parse(await fs.readFile(expectationFile, "utf8"));
    if (isDeepStrictEqual(actual, expected)) {
      matched = true;
      break;
    }
  }

  if (matched) {
    passed += 1;
    continue;
  }

  failures.push({
    file: path.relative(fixturesRoot, molFile),
    actual,
    expectations: expectations.map((file) => path.relative(fixturesRoot, file)),
  });
}

if (missing.length > 0) {
  console.error("missing fixture JSON files:");
  for (const file of missing) {
    console.error(`  - ${file}`);
  }
}

for (const failure of failures) {
  console.error(`fixture mismatch: ${failure.file}`);
  console.error(`  expected one of: ${failure.expectations.join(", ")}`);
  console.error(`  actual: ${JSON.stringify(failure.actual)}`);
}

console.log(`passed ${passed} fixture test(s)`);

if (missing.length > 0 || failures.length > 0) {
  process.exitCode = 1;
}

async function findExpectations(molFile) {
  const directory = path.dirname(molFile);
  const fileName = path.basename(molFile);
  const stem = fileName.replace(/\.mol$/u, "");
  const canonicalStem = stem.replace(/\.\d+$/u, "");
  const entries = await fs.readdir(directory);

  return entries
    .filter((entry) => {
      if (!entry.endsWith(".json")) {
        return false;
      }

      const jsonStem = entry.replace(/\.json$/u, "");
      return (
        jsonStem === stem ||
        jsonStem === canonicalStem ||
        jsonStem.startsWith(`${canonicalStem}.`)
      );
    })
    .sort()
    .map((entry) => path.join(directory, entry));
}

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
