import { getFenceInfo, isFenceClose, matchHeading, parseStructuralEntryLine, prepareLines } from "./lexer.js";
import { normalizeTextBodyLine } from "./scalars.js";
import type { Frame, MolDocument, MolEntry, PreparedLine } from "./types.js";

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

      if (consumeTextFrame(stack, line, rootHeadingLevel)) {
        continue;
      }

      const pendingResolution = resolvePendingFrame(
        stack,
        line,
        lines,
        index,
        rootHeadingLevel,
      );
      if (pendingResolution === "reprocess") {
        reprocess = true;
        continue;
      }
      if (pendingResolution === "handled") {
        continue;
      }

      if (line.trimmed.length === 0) {
        continue;
      }

      const headingMatch = matchHeading(line.text);
      if (headingMatch) {
        if (rootHeadingLevel === undefined) {
          rootHeadingLevel = headingMatch.depth;
        }

        pushHeadingEntry(document, stack, line, headingMatch, rootHeadingLevel);
        continue;
      }

      const entryLine = parseStructuralEntryLine(lines, index);
      if (!entryLine) {
        continue;
      }

      closeIndentedSiblings(stack, line.indent);
      appendEntry(document, stack, {
        key: entryLine.key,
        value: entryLine.value,
        children: [],
        source: "entry",
        line: line.lineNumber,
      });
      stack.push({
        entry: getLastEntry(document, stack),
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

function consumeTextFrame(
  stack: Frame[],
  line: PreparedLine,
  rootHeadingLevel: number | undefined,
): boolean {
  const activeTextFrame = stack[stack.length - 1];
  if (activeTextFrame?.mode !== "text") {
    return false;
  }

  if (activeTextFrame.fence) {
    if (isFenceClose(line, activeTextFrame.fence)) {
      activeTextFrame.fence = undefined;
      return true;
    }

    appendTextLine(activeTextFrame, line);
    return true;
  }

  if (isTextBoundary(line, activeTextFrame, rootHeadingLevel)) {
    finalizeFrame(activeTextFrame);
    stack.pop();
    return false;
  }

  appendTextLine(activeTextFrame, line);
  return true;
}

function resolvePendingFrame(
  stack: Frame[],
  line: PreparedLine,
  lines: PreparedLine[],
  index: number,
  rootHeadingLevel: number | undefined,
): "continue" | "handled" | "reprocess" {
  const pendingFrame = stack[stack.length - 1];
  if (pendingFrame?.mode !== "pending") {
    return "continue";
  }

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
    return "reprocess";
  }

  if (decision === "text") {
    pendingFrame.mode = "text";
    appendTextLine(pendingFrame, line);
    return "handled";
  }

  if (decision === "fenced") {
    pendingFrame.mode = "text";
    pendingFrame.fence = getFenceInfo(line);
    pendingFrame.textBaseIndent = line.indent;
    return "handled";
  }

  if (decision === "children") {
    pendingFrame.mode = "children";
  }

  return "continue";
}

function pushHeadingEntry(
  document: MolDocument,
  stack: Frame[],
  line: PreparedLine,
  headingMatch: { depth: number; key: string },
  rootHeadingLevel: number,
): void {
  const headingDepth = Math.max(1, headingMatch.depth - rootHeadingLevel + 1);

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
}

function closeIndentedSiblings(stack: Frame[], lineIndent: number): void {
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.headingDepth !== undefined || lineIndent > top.indent) {
      break;
    }

    finalizeFrame(top);
    stack.pop();
  }
}

function getLastEntry(document: MolDocument, stack: Frame[]): MolEntry {
  const parent = stack[stack.length - 1];
  if (!parent) {
    return document.entries[document.entries.length - 1];
  }

  return parent.entry.children[parent.entry.children.length - 1];
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
  const text = normalizeTextBodyLine(
    line.trimmed.length === 0
      ? ""
      : line.text.slice(Math.min(baseIndent, line.text.length)),
    frame.fence !== undefined,
  );

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

  if (frame.headingDepth !== undefined) {
    if (getFenceInfo(line)) {
      return "fenced";
    }

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

  if (getFenceInfo(line)) {
    return "fenced";
  }

  return parseStructuralEntryLine(lines, index) || matchHeading(line.text)
    ? "children"
    : "text";
}
