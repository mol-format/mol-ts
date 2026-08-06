import { natural } from "./transforms.js";
import type { KeyTransform } from "./types.js";

export interface SerializeOptions {
  indent?: string;
  arrayItemKey?: string;
  arrayTitleKeys?: string[];
  rootScalarKey?: string;
  headingLevels?: number;
  keyTransform?: KeyTransform;
}

const DEFAULT_HEADING_LEVELS = 4;
const MAX_HEADING_LEVEL = 6;

interface SerializeContext {
  indent: string;
  arrayItemKey: string;
  arrayTitleKeys: string[];
  rootScalarKey: string;
  headingLevels: number;
  keyTransform: KeyTransform;
}

interface Position {
  headingDepth: number;
  indentDepth: number;
}

const ROOT_POSITION: Position = { headingDepth: 0, indentDepth: 0 };

export function serialize(
  value: unknown,
  options: SerializeOptions = {},
): string {
  const context: SerializeContext = {
    indent: options.indent ?? "\t",
    arrayItemKey: options.arrayItemKey ?? "Item",
    arrayTitleKeys: options.arrayTitleKeys ?? [],
    rootScalarKey: options.rootScalarKey ?? "Value",
    headingLevels: normalizeHeadingLevels(options.headingLevels),
    keyTransform: options.keyTransform ?? natural,
  };

  const lines = serializeRoot(value, context);
  return lines.join("\n");
}

function normalizeHeadingLevels(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return DEFAULT_HEADING_LEVELS;
  }

  return Math.max(0, Math.min(MAX_HEADING_LEVEL, Math.floor(value)));
}

function serializeRoot(value: unknown, context: SerializeContext): string[] {
  if (Array.isArray(value)) {
    return serializeArrayEntries(value, ROOT_POSITION, context);
  }

  if (isPlainObject(value)) {
    return serializeObjectEntries(value, ROOT_POSITION, context);
  }

  return serializeRootScalar(value, context);
}

function serializeRootScalar(
  value: unknown,
  context: SerializeContext,
): string[] {
  const scalar = serializeScalar(value);
  if (scalar.kind === "inline") {
    return [`# ${context.rootScalarKey}`, "", scalar.value];
  }

  return [
    `# ${context.rootScalarKey}`,
    "",
    "```txt",
    ...scalar.lines,
    "```",
  ];
}

function serializeObjectEntries(
  value: Record<string, unknown>,
  position: Position,
  context: SerializeContext,
): string[] {
  const inlineEntries: [string, unknown][] = [];
  const headingEntries: [string, unknown][] = [];

  // Entries emitted after a sibling heading would be swallowed by that
  // heading's section, so inline members are always written first.
  for (const entry of Object.entries(value)) {
    if (usesHeading(entry[1], position, context)) {
      headingEntries.push(entry);
    } else {
      inlineEntries.push(entry);
    }
  }

  const lines: string[] = [];

  for (const [key, entryValue] of inlineEntries) {
    lines.push(...serializeNamedValue(key, entryValue, position, context));
  }

  for (const [key, entryValue] of headingEntries) {
    appendSection(
      lines,
      serializeNamedValue(key, entryValue, position, context),
    );
  }

  return lines;
}

function serializeArrayEntries(
  value: unknown[],
  position: Position,
  context: SerializeContext,
): string[] {
  // Array order is significant, so elements cannot be reordered the way object
  // members can. Headings are only used when every element can take one.
  const asHeadings =
    value.length > 0 &&
    value.every((item) => usesHeading(item, position, context));

  const titles = resolveArrayTitles(value, context, asHeadings);
  const lines: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const block = serializeNamedValue(
      titles?.[index] ?? context.arrayItemKey,
      value[index],
      position,
      context,
      { allowHeading: asHeadings, transformKey: false },
    );

    if (asHeadings) {
      appendSection(lines, block);
    } else {
      lines.push(...block);
    }
  }

  return lines;
}

// Names each element after a value taken from the element itself, so arrays of
// records read as titled sections instead of a run of identical keys. Applied
// all-or-nothing: a partly titled array would split into unrelated keys.
function resolveArrayTitles(
  items: unknown[],
  context: SerializeContext,
  asHeadings: boolean,
): string[] | undefined {
  if (context.arrayTitleKeys.length === 0 || items.length === 0) {
    return undefined;
  }

  const titles: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const title = resolveTitle(item, context.arrayTitleKeys, asHeadings);
    if (title === undefined) {
      return undefined;
    }

    // Repeated titles are repeated keys, which would turn just those elements
    // back into an array and leave the rest as plain members. Titling the
    // array at all is only coherent when every title is distinct.
    const identity = title.toLowerCase();
    if (seen.has(identity)) {
      return undefined;
    }

    seen.add(identity);
    titles.push(title);
  }

  return titles;
}

function resolveTitle(
  item: unknown,
  titleKeys: string[],
  asHeadings: boolean,
): string | undefined {
  if (!isPlainObject(item)) {
    return undefined;
  }

  for (const candidate of titleKeys) {
    const key = findKeyIgnoringCase(item, candidate);
    if (key === undefined) {
      continue;
    }

    const title = normalizeTitle(item[key]);
    if (title === undefined) {
      continue;
    }

    // Outside heading form the title becomes a `Key: Value` key, and the
    // reader splits on the first colon, so a colon would corrupt the entry.
    if (!asHeadings && title.includes(":")) {
      continue;
    }

    return title;
  }

  return undefined;
}

function findKeyIgnoringCase(
  item: Record<string, unknown>,
  candidate: string,
): string | undefined {
  const target = candidate.toLowerCase();

  for (const key of Object.keys(item)) {
    if (key.toLowerCase() === target) {
      return key;
    }
  }

  return undefined;
}

function normalizeTitle(value: unknown): string | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return undefined;
    }

    return String(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  // A heading or key occupies a single line, so any internal break collapses.
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length > 0 ? text : undefined;
}

function serializeNamedValue(
  key: string,
  value: unknown,
  position: Position,
  context: SerializeContext,
  options: { allowHeading?: boolean; transformKey?: boolean } = {},
): string[] {
  const allowHeading = options.allowHeading ?? true;
  const name =
    options.transformKey === false ? key : context.keyTransform(key);

  if (allowHeading && usesHeading(value, position, context)) {
    return serializeHeadingValue(name, value, position, context);
  }

  const prefix = `${context.indent.repeat(position.indentDepth)}${name}`;
  const childPosition: Position = {
    headingDepth: position.headingDepth,
    indentDepth: position.indentDepth + 1,
  };

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${prefix}:`];
    }

    return [
      `${prefix}:`,
      ...serializeArrayEntries(value, childPosition, context),
    ];
  }

  if (isPlainObject(value)) {
    const childLines = serializeObjectEntries(value, childPosition, context);
    if (childLines.length === 0) {
      return [`${prefix}:`];
    }

    return [`${prefix}:`, ...childLines];
  }

  const scalar = serializeScalar(value);
  if (scalar.kind === "inline") {
    return [`${prefix}: ${scalar.value}`];
  }

  return [
    `${prefix}:`,
    `${context.indent.repeat(childPosition.indentDepth)}\`\`\`txt`,
    ...scalar.lines.map(
      (line) => `${context.indent.repeat(childPosition.indentDepth)}${line}`,
    ),
    `${context.indent.repeat(childPosition.indentDepth)}\`\`\``,
  ];
}

function serializeHeadingValue(
  name: string,
  value: unknown,
  position: Position,
  context: SerializeContext,
): string[] {
  const childPosition: Position = {
    headingDepth: position.headingDepth + 1,
    indentDepth: 0,
  };

  const childLines = Array.isArray(value)
    ? serializeArrayEntries(value, childPosition, context)
    : serializeObjectEntries(
        value as Record<string, unknown>,
        childPosition,
        context,
      );

  return [
    `${"#".repeat(position.headingDepth + 1)} ${name}`,
    "",
    ...childLines,
  ];
}

function usesHeading(
  value: unknown,
  position: Position,
  context: SerializeContext,
): boolean {
  // A heading closes any open indented entry, so once indentation has started
  // the remaining depth must stay indented.
  if (position.indentDepth > 0) {
    return false;
  }

  if (position.headingDepth >= context.headingLevels) {
    return false;
  }

  return isNonEmptyContainer(value);
}

function isNonEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return isPlainObject(value) && Object.keys(value).length > 0;
}

function appendSection(lines: string[], block: string[]): void {
  // A blank line before a heading reads better, but a text body absorbs any
  // blank line that follows it, so the separator is dropped after a fence.
  if (
    lines.length > 0 &&
    lines[lines.length - 1] !== "" &&
    !endsFencedBlock(lines)
  ) {
    lines.push("");
  }

  lines.push(...block);
}

function endsFencedBlock(lines: string[]): boolean {
  return /^[`~]{3,}$/u.test(lines[lines.length - 1].trim());
}

function serializeScalar(
  value: unknown,
): { kind: "inline"; value: string } | { kind: "block"; lines: string[] } {
  if (typeof value === "string") {
    if (value.includes("\n")) {
      return {
        kind: "block",
        lines: value.split("\n"),
      };
    }

    return {
      kind: "inline",
      value: quoteStringIfNeeded(value),
    };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return {
      kind: "inline",
      value: String(value),
    };
  }

  if (value === null) {
    return {
      kind: "inline",
      value: "null",
    };
  }

  return {
    kind: "inline",
    value: quoteStringIfNeeded(String(value)),
  };
}

function quoteStringIfNeeded(value: string): string {
  if (value === "") {
    return `""`;
  }

  if (
    /^\s|\s$/u.test(value) ||
    /^(true|false|null)$/i.test(value) ||
    /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/u.test(value) ||
    /["'\\\t\r]/u.test(value)
  ) {
    return JSON.stringify(value);
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
