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

export function natural(value: string): string {
  const words = splitWords(value);
  if (words.length === 0) {
    return "";
  }

  return words.map(capitalizeWord).join(" ");
}

export function identity(value: string): string {
  return value;
}

function splitWords(value: string): string[] {
  return value
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[_\-.\s]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function capitalizeWord(word: string): string {
  if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
    return word;
  }

  return word.charAt(0).toUpperCase() + word.slice(1);
}
