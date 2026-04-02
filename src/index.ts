import { deserialize } from "./deserialize.js";
import { parseDocument } from "./parser.js";
import { coerceScalar } from "./scalars.js";
import { camelCase, identity } from "./transforms.js";

import type { KeyTransform, MolDocument, MolEntry, ParseOptions } from "./types.js";

export type { KeyTransform, MolDocument, MolEntry, ParseOptions } from "./types.js";
export { coerceScalar } from "./scalars.js";
export { parseDocument } from "./parser.js";
export { camelCase, identity } from "./transforms.js";
export { deserialize } from "./deserialize.js";

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

const MOL = {
  parse,
  parseDocument,
  deserialize,
  coerceScalar,
  camelCase,
  identity,
};

export default MOL;
