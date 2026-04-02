import { coerceScalar } from "./scalars.js";
import { identity } from "./transforms.js";
import type { KeyTransform, MolDocument, MolEntry, ParseOptions } from "./types.js";

const DEFAULT_VALUE_KEY = "$value";

export function deserialize(
  document: MolDocument,
  options: ParseOptions = {},
): unknown {
  const keyTransform = options.keyTransform ?? identity;
  const valueKey = options.valueKey ?? DEFAULT_VALUE_KEY;

  if (
    !options.preserveRootHeadings &&
    document.entries.length === 1 &&
    document.entries[0].source === "heading"
  ) {
    return deserializeEntry(document.entries[0], keyTransform, valueKey);
  }

  if (
    !options.preserveRootHeadings &&
    document.entries.length > 1 &&
    document.entries.every((entry) => entry.source === "heading")
  ) {
    return document.entries.map((entry) =>
      deserializeEntry(entry, keyTransform, valueKey),
    );
  }

  return deserializeEntries(document.entries, keyTransform, valueKey);
}

function deserializeEntries(
  entries: MolEntry[],
  keyTransform: KeyTransform,
  valueKey: string,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const entry of entries) {
    const key = keyTransform(entry.key);
    const value = deserializeEntry(entry, keyTransform, valueKey);
    const existing = record[key];

    if (existing === undefined) {
      record[key] = value;
      continue;
    }

    if (Array.isArray(existing)) {
      existing.push(value);
      continue;
    }

    record[key] = [existing, value];
  }

  return record;
}

function deserializeEntry(
  entry: MolEntry,
  keyTransform: KeyTransform,
  valueKey: string,
): unknown {
  const hasChildren = entry.children.length > 0;
  const hasValue = entry.value !== undefined;

  if (!hasChildren) {
    if (!hasValue) {
      return {};
    }

    return coerceScalar(entry.value!);
  }

  const objectValue = deserializeEntries(entry.children, keyTransform, valueKey);
  if (hasValue) {
    objectValue[valueKey] = coerceScalar(entry.value!);
  }

  return objectValue;
}
