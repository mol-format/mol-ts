import type { FenceInfo, ParsedEntryLine, PreparedLine } from "./types.js";

export function prepareLines(source: string): PreparedLine[] {
  const normalized = source.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const rawLines = normalized.split("\n");
  const lines: PreparedLine[] = [];
  let inBlockComment = false;
  let activeFence: FenceInfo | undefined;

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index];
    let text: string;

    if (activeFence) {
      text = rawLine;
      if (isFenceCloseFromText(rawLine.trim(), activeFence)) {
        activeFence = undefined;
      }
    } else {
      const fence = getFenceInfoFromText(rawLine.trim());
      if (fence && !inBlockComment) {
        text = rawLine;
        activeFence = fence;
      } else {
        text = stripComments(rawLine, () => inBlockComment, (next) => {
          inBlockComment = next;
        });
      }
    }

    lines.push({
      text,
      indent: countIndent(text),
      trimmed: text.trim(),
      lineNumber: index + 1,
    });
  }

  return lines;
}

export function matchHeading(
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

export function parseStructuralEntryLine(
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

export function getFenceInfo(line: PreparedLine): FenceInfo | undefined {
  return getFenceInfoFromText(line.trimmed);
}

export function isFenceClose(line: PreparedLine, fence: FenceInfo): boolean {
  return isFenceCloseFromText(line.trimmed, fence);
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

  if (!listItem && !looksLikeBareEntry(lines, index)) {
    return undefined;
  }

  return { key: payload.trim() };
}

function looksLikeBareEntry(lines: PreparedLine[], index: number): boolean {
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

function getFenceInfoFromText(trimmedText: string): FenceInfo | undefined {
  const match = trimmedText.match(/^([`~]{3,})(.*)$/);
  if (!match) {
    return undefined;
  }

  const marker = match[1];
  return {
    markerChar: marker[0] as "`" | "~",
    markerLength: marker.length,
  };
}

function isFenceCloseFromText(
  trimmedText: string,
  fence: FenceInfo,
): boolean {
  const match = trimmedText.match(/^([`~]{3,})\s*$/);
  if (!match) {
    return false;
  }

  return (
    match[1][0] === fence.markerChar &&
    match[1].length >= fence.markerLength
  );
}
