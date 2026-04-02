export interface SerializeOptions {
  indent?: string;
  arrayItemKey?: string;
  rootScalarKey?: string;
}

interface SerializeContext {
  indent: string;
  arrayItemKey: string;
  rootScalarKey: string;
}

export function serialize(
  value: unknown,
  options: SerializeOptions = {},
): string {
  const context: SerializeContext = {
    indent: options.indent ?? "\t",
    arrayItemKey: options.arrayItemKey ?? "Item",
    rootScalarKey: options.rootScalarKey ?? "Value",
  };

  const lines = serializeRoot(value, context);
  return lines.join("\n");
}

function serializeRoot(value: unknown, context: SerializeContext): string[] {
  if (Array.isArray(value)) {
    return serializeArrayEntries(value, 0, context);
  }

  if (isPlainObject(value)) {
    return serializeObjectEntries(value, 0, context);
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
  depth: number,
  context: SerializeContext,
): string[] {
  const lines: string[] = [];

  for (const [key, entryValue] of Object.entries(value)) {
    lines.push(...serializeNamedValue(key, entryValue, depth, context));
  }

  return lines;
}

function serializeArrayEntries(
  value: unknown[],
  depth: number,
  context: SerializeContext,
): string[] {
  const lines: string[] = [];

  for (const item of value) {
    lines.push(...serializeNamedValue(context.arrayItemKey, item, depth, context));
  }

  return lines;
}

function serializeNamedValue(
  key: string,
  value: unknown,
  depth: number,
  context: SerializeContext,
): string[] {
  const prefix = `${context.indent.repeat(depth)}${key}`;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${prefix}:`];
    }

    return [
      `${prefix}:`,
      ...serializeArrayEntries(value, depth + 1, context),
    ];
  }

  if (isPlainObject(value)) {
    const childLines = serializeObjectEntries(value, depth + 1, context);
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
    `${context.indent.repeat(depth + 1)}\`\`\`txt`,
    ...scalar.lines.map(
      (line) => `${context.indent.repeat(depth + 1)}${line}`,
    ),
    `${context.indent.repeat(depth + 1)}\`\`\``,
  ];
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
