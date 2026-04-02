import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import MOL from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(__dirname, "../tests/test-files");
const runsPerCase = 100;
const molModes = [
  { name: "camelCase", transform: MOL.camelCase },
  { name: "identity", transform: MOL.identity },
];

const fixtureFiles = await collectBenchmarkFiles(fixturesRoot);
const suites = await buildBenchmarkSuites(fixtureFiles, fixturesRoot);

const roundTripResults = suites.roundTripCases.map((benchmarkCase) =>
  runRoundTripCase(benchmarkCase, runsPerCase),
);
const parseOnlyResults = suites.parseOnlyCases.map((benchmarkCase) =>
  runSinglePhaseCase(benchmarkCase, runsPerCase),
);
const serializeOnlyResults = suites.serializeOnlyCases.map((benchmarkCase) =>
  runSinglePhaseCase(benchmarkCase, runsPerCase),
);

printConfigSummary(fixtureFiles, suites, runsPerCase);

printRoundTripSection(roundTripResults);
printGroupedRoundTripSection(roundTripResults);
printSlowestRoundTripCases(roundTripResults, 12);

printSinglePhaseSection("Parse Only", parseOnlyResults);
printGroupedSinglePhaseSection("Parse Only By Pipeline", parseOnlyResults);
printSlowestSinglePhaseCases("Slowest Parse-Only Cases", parseOnlyResults, 10);

printSinglePhaseSection("Serialize Only", serializeOnlyResults);
printGroupedSinglePhaseSection("Serialize Only By Pipeline", serializeOnlyResults);
printSlowestSinglePhaseCases("Slowest Serialize-Only Cases", serializeOnlyResults, 10);

async function buildBenchmarkSuites(files, root) {
  const roundTripCases = [];
  const parseOnlyCases = [];
  const serializeOnlyCases = [];

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    const relativeFile = path.relative(root, file);

    if (file.endsWith(".mol")) {
      for (const mode of molModes) {
        const parsedValue = MOL.parse(source, mode.transform);
        const serializedValue = MOL.serialize(parsedValue);

        roundTripCases.push({
          name: `${relativeFile} [${mode.name}]`,
          pipeline: `mol:${mode.name}`,
          extension: ".mol",
          bytes: Buffer.byteLength(source),
          run() {
            const deserializeStart = performance.now();
            const value = MOL.parse(source, mode.transform);
            const deserializeEnd = performance.now();
            const serialized = MOL.serialize(value);
            const serializeEnd = performance.now();

            return {
              deserializeMs: deserializeEnd - deserializeStart,
              serializeMs: serializeEnd - deserializeEnd,
              roundTripMs: serializeEnd - deserializeStart,
              outputBytes: Buffer.byteLength(serialized),
            };
          },
        });

        parseOnlyCases.push({
          name: `${relativeFile} [${mode.name}]`,
          pipeline: `mol:${mode.name}`,
          extension: ".mol",
          bytes: Buffer.byteLength(source),
          outputBytes: Buffer.byteLength(serializedValue),
          run() {
            const start = performance.now();
            MOL.parse(source, mode.transform);
            return performance.now() - start;
          },
        });

        serializeOnlyCases.push({
          name: `${relativeFile} [${mode.name}]`,
          pipeline: `mol:${mode.name}`,
          extension: ".mol",
          bytes: Buffer.byteLength(source),
          outputBytes: Buffer.byteLength(serializedValue),
          run() {
            const start = performance.now();
            MOL.serialize(parsedValue);
            return performance.now() - start;
          },
        });
      }
      continue;
    }

    if (file.endsWith(".json")) {
      const parsedValue = JSON.parse(source);
      const serializedValue = JSON.stringify(parsedValue);

      roundTripCases.push({
        name: relativeFile,
        pipeline: "json",
        extension: ".json",
        bytes: Buffer.byteLength(source),
        run() {
          const deserializeStart = performance.now();
          const value = JSON.parse(source);
          const deserializeEnd = performance.now();
          const serialized = JSON.stringify(value);
          const serializeEnd = performance.now();

          return {
            deserializeMs: deserializeEnd - deserializeStart,
            serializeMs: serializeEnd - deserializeEnd,
            roundTripMs: serializeEnd - deserializeStart,
            outputBytes: Buffer.byteLength(serialized),
          };
        },
      });

      parseOnlyCases.push({
        name: relativeFile,
        pipeline: "json",
        extension: ".json",
        bytes: Buffer.byteLength(source),
        outputBytes: Buffer.byteLength(serializedValue),
        run() {
          const start = performance.now();
          JSON.parse(source);
          return performance.now() - start;
        },
      });

      serializeOnlyCases.push({
        name: relativeFile,
        pipeline: "json",
        extension: ".json",
        bytes: Buffer.byteLength(source),
        outputBytes: Buffer.byteLength(serializedValue),
        run() {
          const start = performance.now();
          JSON.stringify(parsedValue);
          return performance.now() - start;
        },
      });
    }
  }

  return {
    roundTripCases,
    parseOnlyCases,
    serializeOnlyCases,
  };
}

function runRoundTripCase(benchmarkCase, runs) {
  const deserializeSamples = [];
  const serializeSamples = [];
  const roundTripSamples = [];
  let outputBytes = 0;

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const sample = benchmarkCase.run();
    deserializeSamples.push(sample.deserializeMs);
    serializeSamples.push(sample.serializeMs);
    roundTripSamples.push(sample.roundTripMs);
    outputBytes = sample.outputBytes;
  }

  return {
    name: benchmarkCase.name,
    pipeline: benchmarkCase.pipeline,
    extension: benchmarkCase.extension,
    bytes: benchmarkCase.bytes,
    outputBytes,
    runs,
    deserialize: summarizeSamples(deserializeSamples),
    serialize: summarizeSamples(serializeSamples),
    roundTrip: summarizeSamples(roundTripSamples),
  };
}

function runSinglePhaseCase(benchmarkCase, runs) {
  const samples = [];

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    samples.push(benchmarkCase.run());
  }

  return {
    name: benchmarkCase.name,
    pipeline: benchmarkCase.pipeline,
    extension: benchmarkCase.extension,
    bytes: benchmarkCase.bytes,
    outputBytes: benchmarkCase.outputBytes,
    runs,
    stats: summarizeSamples(samples),
  };
}

function summarizeSamples(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const average = total / sorted.length;

  return {
    avg: average,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    total,
    opsPerSecond: average === 0 ? Number.POSITIVE_INFINITY : 1000 / average,
  };
}

function percentile(sortedSamples, percentileValue) {
  if (sortedSamples.length === 1) {
    return sortedSamples[0];
  }

  const rank = (percentileValue / 100) * (sortedSamples.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  return (
    sortedSamples[lowerIndex] +
    (sortedSamples[upperIndex] - sortedSamples[lowerIndex]) * weight
  );
}

function printConfigSummary(files, suites, runs) {
  const molFiles = files.filter((file) => file.endsWith(".mol")).length;
  const jsonFiles = files.filter((file) => file.endsWith(".json")).length;

  console.log("Performance Benchmark");
  console.log(`fixtures: ${files.length} files (${molFiles} .mol, ${jsonFiles} .json)`);
  console.log(`round-trip cases: ${suites.roundTripCases.length}`);
  console.log(`parse-only cases: ${suites.parseOnlyCases.length}`);
  console.log(`serialize-only cases: ${suites.serializeOnlyCases.length}`);
  console.log(`runs per case: ${runs}`);
  console.log("");
}

function printRoundTripSection(caseResults) {
  console.log("Round Trip");
  printRoundTripStatsTable(
    aggregateRoundTripResults(caseResults),
    `across ${caseResults.length} benchmark case(s)`,
  );
  console.log("");
}

function printGroupedRoundTripSection(caseResults) {
  console.log("Round Trip By Pipeline");
  for (const [pipeline, results] of groupByPipeline(caseResults)) {
    printRoundTripStatsTable(aggregateRoundTripResults(results), pipeline);
  }
  console.log("");
}

function printSinglePhaseSection(title, caseResults) {
  console.log(title);
  printSinglePhaseStatsTable(
    aggregateSinglePhaseResults(caseResults),
    `across ${caseResults.length} benchmark case(s)`,
  );
  console.log("");
}

function printGroupedSinglePhaseSection(title, caseResults) {
  console.log(title);
  for (const [pipeline, results] of groupByPipeline(caseResults)) {
    printSinglePhaseStatsTable(aggregateSinglePhaseResults(results), pipeline);
  }
  console.log("");
}

function printSlowestRoundTripCases(caseResults, count) {
  console.log(`Slowest Round-Trip Cases (${count})`);
  const rows = [...caseResults]
    .sort((left, right) => right.roundTrip.avg - left.roundTrip.avg)
    .slice(0, count)
    .map((result) => ({
      file: result.name,
      bytes: result.bytes,
      roundTripAvg: result.roundTrip.avg,
      roundTripP95: result.roundTrip.p95,
      deserializeAvg: result.deserialize.avg,
      serializeAvg: result.serialize.avg,
    }));

  const header =
    `${pad("case", 62)} ${pad("bytes", 8)} ${pad("rt-avg", 10)} ` +
    `${pad("rt-p95", 10)} ${pad("de-avg", 10)} ${pad("se-avg", 10)}`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    console.log(
      `${pad(truncate(row.file, 62), 62)} ${pad(String(row.bytes), 8)} ` +
        `${pad(formatMs(row.roundTripAvg), 10)} ${pad(formatMs(row.roundTripP95), 10)} ` +
        `${pad(formatMs(row.deserializeAvg), 10)} ${pad(formatMs(row.serializeAvg), 10)}`,
    );
  }
  console.log("");
}

function printSlowestSinglePhaseCases(title, caseResults, count) {
  console.log(`${title} (${count})`);
  const rows = [...caseResults]
    .sort((left, right) => right.stats.avg - left.stats.avg)
    .slice(0, count)
    .map((result) => ({
      file: result.name,
      bytes: result.bytes,
      avg: result.stats.avg,
      p95: result.stats.p95,
      opsPerSecond: result.stats.opsPerSecond,
    }));

  const header =
    `${pad("case", 62)} ${pad("bytes", 8)} ${pad("avg", 10)} ` +
    `${pad("p95", 10)} ${pad("ops/s", 10)}`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    console.log(
      `${pad(truncate(row.file, 62), 62)} ${pad(String(row.bytes), 8)} ` +
        `${pad(formatMs(row.avg), 10)} ${pad(formatMs(row.p95), 10)} ` +
        `${pad(formatOps(row.opsPerSecond), 10)}`,
    );
  }
  console.log("");
}

function aggregateRoundTripResults(caseResults) {
  const deserializeSamples = caseResults.map((result) => result.deserialize.avg);
  const serializeSamples = caseResults.map((result) => result.serialize.avg);
  const roundTripSamples = caseResults.map((result) => result.roundTrip.avg);

  return {
    cases: caseResults.length,
    totalInputBytes: sumBytes(caseResults, "bytes"),
    totalOutputBytes: sumBytes(caseResults, "outputBytes"),
    deserialize: summarizeSamples(deserializeSamples),
    serialize: summarizeSamples(serializeSamples),
    roundTrip: summarizeSamples(roundTripSamples),
  };
}

function aggregateSinglePhaseResults(caseResults) {
  const samples = caseResults.map((result) => result.stats.avg);

  return {
    cases: caseResults.length,
    totalInputBytes: sumBytes(caseResults, "bytes"),
    totalOutputBytes: sumBytes(caseResults, "outputBytes"),
    stats: summarizeSamples(samples),
  };
}

function printRoundTripStatsTable(aggregate, label) {
  console.log(label);
  console.log(`cases: ${aggregate.cases}`);
  console.log(`input bytes: ${aggregate.totalInputBytes}`);
  console.log(`output bytes: ${aggregate.totalOutputBytes}`);
  console.log(
    `${pad("phase", 12)} ${pad("avg", 10)} ${pad("min", 10)} ${pad("max", 10)} ` +
      `${pad("median", 10)} ${pad("p95", 10)} ${pad("ops/s", 10)}`,
  );
  console.log("-".repeat(78));
  for (const [labelName, stats] of [
    ["deserialize", aggregate.deserialize],
    ["serialize", aggregate.serialize],
    ["roundTrip", aggregate.roundTrip],
  ]) {
    console.log(
      `${pad(labelName, 12)} ${pad(formatMs(stats.avg), 10)} ${pad(formatMs(stats.min), 10)} ` +
        `${pad(formatMs(stats.max), 10)} ${pad(formatMs(stats.median), 10)} ` +
        `${pad(formatMs(stats.p95), 10)} ${pad(formatOps(stats.opsPerSecond), 10)}`,
    );
  }
  console.log("");
}

function printSinglePhaseStatsTable(aggregate, label) {
  const stats = aggregate.stats;

  console.log(label);
  console.log(`cases: ${aggregate.cases}`);
  console.log(`input bytes: ${aggregate.totalInputBytes}`);
  console.log(`reference output bytes: ${aggregate.totalOutputBytes}`);
  console.log(
    `${pad("avg", 10)} ${pad("min", 10)} ${pad("max", 10)} ` +
      `${pad("median", 10)} ${pad("p95", 10)} ${pad("ops/s", 10)}`,
  );
  console.log("-".repeat(66));
  console.log(
    `${pad(formatMs(stats.avg), 10)} ${pad(formatMs(stats.min), 10)} ` +
      `${pad(formatMs(stats.max), 10)} ${pad(formatMs(stats.median), 10)} ` +
      `${pad(formatMs(stats.p95), 10)} ${pad(formatOps(stats.opsPerSecond), 10)}`,
  );
  console.log("");
}

async function collectBenchmarkFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectBenchmarkFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && (fullPath.endsWith(".mol") || fullPath.endsWith(".json"))) {
      files.push(fullPath);
    }
  }

  files.sort();
  return files;
}

function groupByPipeline(caseResults) {
  const grouped = new Map();

  for (const result of caseResults) {
    if (!grouped.has(result.pipeline)) {
      grouped.set(result.pipeline, []);
    }

    grouped.get(result.pipeline).push(result);
  }

  return [...grouped.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function sumBytes(caseResults, key) {
  return caseResults.reduce((sum, result) => sum + result[key], 0);
}

function pad(value, length) {
  return String(value).padEnd(length, " ");
}

function truncate(value, length) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, Math.max(0, length - 3))}...`;
}

function formatMs(value) {
  return `${value.toFixed(3)}ms`;
}

function formatOps(value) {
  if (!Number.isFinite(value)) {
    return "inf";
  }

  return value.toFixed(1);
}
