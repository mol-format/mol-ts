export function coerceScalar(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  const quoted = parseQuotedString(trimmed);
  if (quoted !== undefined) {
    return quoted;
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

export function normalizeTextBodyLine(text: string, literal: boolean): string {
  if (literal) {
    return text;
  }

  return text.replace(/\\([\\#:\-+*`~])/g, "$1");
}

function parseQuotedString(value: string): string | undefined {
  if (value.length < 2) {
    return undefined;
  }

  const quote = value[0];
  if ((quote !== `"` && quote !== `'`) || value[value.length - 1] !== quote) {
    return undefined;
  }

  let result = "";
  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      result += char;
      continue;
    }

    index += 1;
    if (index >= value.length - 1) {
      result += "\\";
      break;
    }

    const escaped = value[index];
    switch (escaped) {
      case "n":
        result += "\n";
        break;
      case "r":
        result += "\r";
        break;
      case "t":
        result += "\t";
        break;
      case "\\":
        result += "\\";
        break;
      case `"`:
        result += `"`;
        break;
      case "'":
        result += "'";
        break;
      default:
        result += escaped;
        break;
    }
  }

  return result;
}
