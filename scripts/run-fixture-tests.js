import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import MOL from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(__dirname, "../tests/test-files");
const transforms = {
  camelCase: MOL.camelCase,
  identity: MOL.identity,
};

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
  const actualByMode = new Map();
  let matchedFile;

  for (const expectation of expectations) {
    if (!actualByMode.has(expectation.mode)) {
      actualByMode.set(expectation.mode, MOL.parse(source, transforms[expectation.mode]));
    }

    const expected = JSON.parse(await fs.readFile(expectation.file, "utf8"));
    if (isDeepStrictEqual(actualByMode.get(expectation.mode), expected)) {
      matchedFile = expectation.file;
      break;
    }
  }

  if (matchedFile) {
    passed += 1;
    continue;
  }

  failures.push({
    file: path.relative(fixturesRoot, molFile),
    actualByMode: Object.fromEntries(actualByMode),
    expectations: expectations.map((expectation) =>
      path.relative(fixturesRoot, expectation.file),
    ),
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
  console.error(`  actual: ${JSON.stringify(failure.actualByMode)}`);
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
    .map((entry) => parseExpectationEntry(entry))
    .filter((entry) => {
      if (!entry) {
        return false;
      }

      return (
        entry.baseStem === stem ||
        entry.baseStem === canonicalStem ||
        entry.baseStem.startsWith(`${canonicalStem}.`)
      );
    })
    .sort()
    .map((entry) => ({
      file: path.join(directory, entry.fileName),
      mode: entry.mode,
    }));
}

function parseExpectationEntry(fileName) {
  if (!fileName.endsWith(".json")) {
    return undefined;
  }

  const jsonStem = fileName.replace(/\.json$/u, "");
  const parts = jsonStem.split(".");
  const mode = parts.at(-1);
  if (!mode || !(mode in transforms)) {
    return undefined;
  }

  return {
    fileName,
    mode,
    baseStem: parts.slice(0, -1).join("."),
  };
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
