export interface MolEntry {
  key: string;
  value?: string;
  children: MolEntry[];
  source: "heading" | "entry";
  line: number;
}

export interface MolDocument {
  entries: MolEntry[];
}

export type KeyTransform = (key: string) => string;

export interface ParseOptions {
  keyTransform?: KeyTransform;
  valueKey?: string;
  preserveRootHeadings?: boolean;
}

interface PreparedLine {
  text: string;
  indent: number;
  trimmed: string;
  lineNumber: number;
}

interface Frame {
  entry: MolEntry;
  indent: number;
  headingDepth?: number;
  mode: "pending" | "text" | "children";
  textBaseIndent?: number;
  fence?: FenceInfo;
}

interface ParsedEntryLine {
  key: string;
  value?: string;
}

interface FenceInfo {
  markerChar: "`" | "~";
  markerLength: number;
}

const DEFAULT_VALUE_KEY = "$value";

export function camelCase(value: string): string {
  const words = value
    .trim()
    .replace(/['"`]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function identity(value: string): string {
  return value;
}

export function parseDocument(source: string): MolDocument {
  const lines = prepareLines(source);
  const document: MolDocument = { entries: [] };
  const stack: Frame[] = [];
  let rootHeadingLevel: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let reprocess = true;

    while (reprocess) {
      reprocess = false;

      const activeTextFrame = stack[stack.length - 1];
      if (activeTextFrame?.mode === "text") {
        if (activeTextFrame.fence) {
          if (isFenceClose(line, activeTextFrame.fence)) {
            activeTextFrame.fence = undefined;
            continue;
          }

          appendTextLine(activeTextFrame, line);
          continue;
        }

        const boundary = isTextBoundary(
          line,
          activeTextFrame,
          rootHeadingLevel,
        );

        if (boundary) {
          finalizeFrame(activeTextFrame);
          stack.pop();
          reprocess = true;
          continue;
        }

        appendTextLine(activeTextFrame, line);
        continue;
      }

      const pendingFrame = stack[stack.length - 1];
      if (pendingFrame?.mode === "pending") {
        const decision = decidePendingMode(
          line,
          pendingFrame,
          lines,
          index,
          rootHeadingLevel,
        );

        if (decision === "close") {
          finalizeFrame(pendingFrame);
          stack.pop();
          reprocess = true;
          continue;
        }

        if (decision === "text") {
          pendingFrame.mode = "text";
          appendTextLine(pendingFrame, line);
          continue;
        }

        if (decision === "fenced") {
          pendingFrame.mode = "text";
          pendingFrame.fence = getFenceInfo(line);
          pendingFrame.textBaseIndent = line.indent;
          continue;
        }

        if (decision === "children") {
          pendingFrame.mode = "children";
        }
      }

      if (line.trimmed.length === 0) {
        continue;
      }

      const headingMatch = matchHeading(line.text);
      if (headingMatch) {
        if (rootHeadingLevel === undefined) {
          rootHeadingLevel = headingMatch.depth;
        }

        const headingDepth = Math.max(
          1,
          headingMatch.depth - rootHeadingLevel + 1,
        );

        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.headingDepth !== undefined && top.headingDepth < headingDepth) {
            break;
          }

          finalizeFrame(top);
          stack.pop();
        }

        const entry: MolEntry = {
          key: headingMatch.key,
          children: [],
          source: "heading",
          line: line.lineNumber,
        };

        appendEntry(document, stack, entry);
        stack.push({
          entry,
          indent: line.indent,
          headingDepth,
          mode: "pending",
        });
        continue;
      }

      const entryLine = parseStructuralEntryLine(lines, index);
      if (!entryLine) {
        continue;
      }

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.headingDepth !== undefined) {
          break;
        }

        if (line.indent > top.indent) {
          break;
        }

        finalizeFrame(top);
        stack.pop();
      }

      const entry: MolEntry = {
        key: entryLine.key,
        value: entryLine.value,
        children: [],
        source: "entry",
        line: line.lineNumber,
      };

      appendEntry(document, stack, entry);
      stack.push({
        entry,
        indent: line.indent,
        mode: "pending",
      });
    }
  }

  while (stack.length > 0) {
    finalizeFrame(stack.pop()!);
  }

  return document;
}

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

export function parse(
  source: string,
  optionsOrKeyTransform: ParseOptions | KeyTransform = {},
): unknown {
  const options =
    typeof optionsOrKeyTransform === "function"
      ? { keyTransform: optionsOrKeyTransform }
      : optionsOrKeyTransform;

  return deserialize(parseDocument(source), options);
}

export function coerceScalar(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === "true";
  }

  if (/^null$/i.test(trimmed)) {
    return null;
  }

  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return value;
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

function prepareLines(source: string): PreparedLine[] {
  const normalized = source.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const rawLines = normalized.split("\n");
  const lines: PreparedLine[] = [];
  let inBlockComment = false;

  for (let index = 0; index < rawLines.length; index += 1) {
    const text = stripComments(rawLines[index], () => inBlockComment, (next) => {
      inBlockComment = next;
    });

    lines.push({
      text,
      indent: countIndent(text),
      trimmed: text.trim(),
      lineNumber: index + 1,
    });
  }

  return lines;
}

function stripComments(
  line: string,
  getBlockComment: () => boolean,
  setBlockComment: (value: boolean) => void,
): string {
  let result = "";
  let index = 0;

  while (index < line.length) {
    if (getBlockComment()) {
      const end = line.indexOf("*/", index);
      if (end === -1) {
        return result;
      }

      setBlockComment(false);
      index = end + 2;
      continue;
    }

    if (line.startsWith("/*", index)) {
      setBlockComment(true);
      index += 2;
      continue;
    }

    if (line.startsWith("//", index)) {
      const prefix = result.trim();
      if (prefix.length === 0) {
        return result;
      }
    }

    result += line[index];
    index += 1;
  }

  return result;
}

function countIndent(value: string): number {
  let indent = 0;

  while (indent < value.length && /\s/.test(value[indent])) {
    indent += 1;
  }

  return indent;
}

function appendEntry(document: MolDocument, stack: Frame[], entry: MolEntry): void {
  const parent = stack[stack.length - 1];
  if (!parent) {
    document.entries.push(entry);
    return;
  }

  parent.entry.children.push(entry);
}

function finalizeFrame(frame: Frame): void {
  if (frame.mode === "text" && frame.entry.value === undefined) {
    frame.entry.value = "";
  }
}

function appendTextLine(frame: Frame, line: PreparedLine): void {
  if (frame.textBaseIndent === undefined && line.trimmed.length > 0) {
    frame.textBaseIndent = line.indent;
  }

  const baseIndent = frame.textBaseIndent ?? 0;
  const text =
    line.trimmed.length === 0
      ? ""
      : line.text.slice(Math.min(baseIndent, line.text.length));

  if (frame.entry.value === undefined) {
    frame.entry.value = text;
    return;
  }

  frame.entry.value += `\n${text}`;
}

function isTextBoundary(
  line: PreparedLine,
  frame: Frame,
  rootHeadingLevel: number | undefined,
): boolean {
  if (frame.headingDepth !== undefined) {
    if (line.trimmed.length === 0) {
      return false;
    }

    const headingMatch = matchHeading(line.text);
    if (!headingMatch || rootHeadingLevel === undefined) {
      return false;
    }

    const normalizedDepth = Math.max(
      1,
      headingMatch.depth - rootHeadingLevel + 1,
    );

    return normalizedDepth <= frame.headingDepth;
  }

  if (line.trimmed.length === 0) {
    return false;
  }

  return line.indent <= frame.indent;
}

function decidePendingMode(
  line: PreparedLine,
  frame: Frame,
  lines: PreparedLine[],
  index: number,
  rootHeadingLevel: number | undefined,
): "close" | "text" | "fenced" | "children" | "ignore" {
  if (line.trimmed.length === 0) {
    return "ignore";
  }

  if (getFenceInfo(line)) {
    return "fenced";
  }

  if (frame.headingDepth !== undefined) {
    const headingMatch = matchHeading(line.text);
    if (headingMatch && rootHeadingLevel !== undefined) {
      const normalizedDepth = Math.max(
        1,
        headingMatch.depth - rootHeadingLevel + 1,
      );

      if (normalizedDepth <= frame.headingDepth) {
        return "close";
      }
    }

    return parseStructuralEntryLine(lines, index) || headingMatch
      ? "children"
      : "text";
  }

  if (line.indent <= frame.indent) {
    return "close";
  }

  return parseStructuralEntryLine(lines, index) || matchHeading(line.text)
    ? "children"
    : "text";
}

function matchHeading(
  line: string,
): { depth: number; key: string } | undefined {
  const match = line.match(/^\s*(#{1,6})[ \t]+(.+?)\s*$/);
  if (!match) {
    return undefined;
  }

  return {
    depth: match[1].length,
    key: match[2].trim(),
  };
}

function parseStructuralEntryLine(
  lines: PreparedLine[],
  index: number,
): ParsedEntryLine | undefined {
  const line = lines[index];
  const listMatch = line.text.match(/^\s*(?:[-*+]|\d+\.)[ \t]+(.*)$/);
  if (listMatch) {
    return parseEntryPayload(listMatch[1].trim(), true);
  }

  return parseEntryPayload(line.trimmed, false, lines, index);
}

function parseEntryPayload(
  payload: string,
  listItem: boolean,
  lines: PreparedLine[] = [],
  index = -1,
): ParsedEntryLine | undefined {
  if (payload.length === 0) {
    return undefined;
  }

  const colonIndex = payload.indexOf(":");
  if (colonIndex >= 0) {
    const key = payload.slice(0, colonIndex).trim();
    if (key.length === 0) {
      return undefined;
    }

    const remainder = payload.slice(colonIndex + 1).trimStart();
    return {
      key,
      value: remainder.length > 0 ? remainder : undefined,
    };
  }

  if (!listItem && !looksLikeBareEntry(payload, lines, index)) {
    return undefined;
  }

  return { key: payload.trim() };
}

function looksLikeBareEntry(
  payload: string,
  lines: PreparedLine[],
  index: number,
): boolean {
  if (index < 0) {
    return false;
  }

  const childIndex = findNextMeaningfulLine(lines, index + 1);
  if (childIndex === undefined) {
    return false;
  }

  const current = lines[index];
  const child = lines[childIndex];
  if (child.indent <= current.indent) {
    return false;
  }

  return isStructuralLine(lines, childIndex);
}

function isStructuralLine(lines: PreparedLine[], index: number): boolean {
  const line = lines[index];
  if (matchHeading(line.text) || getFenceInfo(line)) {
    return true;
  }

  const listMatch = line.text.match(/^\s*(?:[-*+]|\d+\.)[ \t]+(.*)$/);
  if (listMatch) {
    return parseEntryPayload(listMatch[1].trim(), true, lines, index) !== undefined;
  }

  return parseEntryPayload(line.trimmed, false, lines, index) !== undefined;
}

function findNextMeaningfulLine(
  lines: PreparedLine[],
  startIndex: number,
): number | undefined {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trimmed.length > 0) {
      return index;
    }
  }

  return undefined;
}

function getFenceInfo(line: PreparedLine): FenceInfo | undefined {
  const match = line.trimmed.match(/^([`~]{3,})(.*)$/);
  if (!match) {
    return undefined;
  }

  const marker = match[1];
  return {
    markerChar: marker[0] as "`" | "~",
    markerLength: marker.length,
  };
}

function isFenceClose(line: PreparedLine, fence: FenceInfo): boolean {
  const match = line.trimmed.match(/^([`~]{3,})\s*$/);
  if (!match) {
    return false;
  }

  return (
    match[1][0] === fence.markerChar &&
    match[1].length >= fence.markerLength
  );
}

const MOL = {
  parse,
  parseDocument,
  deserialize,
  coerceScalar,
  camelCase,
  identity,
};

export default MOL;
