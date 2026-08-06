# mol-format (TypeScript / JavaScript)

**The official TypeScript implementation of [Markdown Object Language (MOL)](https://github.com/mol-format).**

Zero dependencies, ESM, fully typed, parser + serializer.

Status: ``DRAFT / IN PROGRESS``

> This README covers the **TypeScript API only**. For what MOL is, why it exists, the syntax, and the full grammar see:
> - Org & overview: [https://github.com/mol-format](https://github.com/mol-format)
> - Specification: [SPECS.md](https://github.com/mol-format/mol-specs/blob/main/SPECS.md)

## Install

```bash
npm install mol-format
```

Requirements:

- Node.js `>= 18`
- **ESM only** — the package ships `"type": "module"` and exports only an `import` condition. There is no CommonJS build, so `require("mol-format")` will not resolve on older Node versions. In a CJS project use `await import("mol-format")`.
- TypeScript: set `"module"`/`"moduleResolution"` to `NodeNext` (or `Bundler`), and `"target": "ES2022"` or later. Type declarations are bundled — no `@types/*` package needed.

## Quick start

```ts
import MOL, { camelCase } from "mol-format";

interface User {
  id: number;
  username: string;
  fullName: string;
  active: boolean;
  password: { hash: string; algorithm: string; version: number };
}

const source = `# User 10

// the account record
Id: 10
Username: janedoe
Full name: Jane Doe
Active: true

## Password

Hash: aoX5r5pS5b3YF2z7LyN1g2dJ7pZ7s2P4G8H8Q2a1A
Algorithm: argon2id
Version: 19
`;

// `camelCase` is the default key transform on parse, so this is just
// MOL.parse(source) — passed explicitly here to show what is happening.
const user = MOL.parse(source, camelCase) as User;

user.id;              // 10          (number)
user.username;        // "janedoe"   (string)
user.fullName;        // "Jane Doe"  (string)
user.active;          // true        (boolean)
user.password.version; // 19         (number)
```

Named imports work equally well, and every symbol on the default export is also a named export:

```ts
import { parse, parseDocument, deserialize, serialize, coerceScalar, natural, camelCase, identity } from "mol-format";
```

### Typing the result

`parse()` and `deserialize()` return **`unknown`** on purpose. MOL is a loose format: types come from your deserialization layer, not the markup, so the library refuses to guess. Two idiomatic options:

```ts
// 1. Cast when the input is trusted (config you ship, fixtures, your own files)
const config = MOL.parse(source, camelCase) as AppConfig;

// 2. Validate when the input is not (user uploads, LLM output)
import { z } from "zod";

const UserSchema = z.object({ id: z.number(), username: z.string() });
const user = UserSchema.parse(MOL.parse(source, camelCase));
```

A small helper keeps casts in one place:

```ts
function parseMol<T>(source: string): T {
  return MOL.parse(source, camelCase) as T;
}

const user = parseMol<User>(source);
```

## API

| Function | Signature | Purpose |
| --- | --- | --- |
| `parse` | `(source: string, optionsOrKeyTransform?: ParseOptions \| KeyTransform) => unknown` | MOL text → plain JS value. Convenience wrapper for `deserialize(parseDocument(source), options)`. |
| `parseDocument` | `(source: string) => MolDocument` | MOL text → raw entry tree (AST). No key transforms, no scalar coercion. |
| `deserialize` | `(document: MolDocument, options?: ParseOptions) => unknown` | Entry tree → plain JS value. |
| `serialize` | `(value: unknown, options?: SerializeOptions) => string` | Plain JS value → canonical MOL text (no trailing newline). |
| `coerceScalar` | `(value: string) => unknown` | Applies MOL's scalar rules to a single raw string. Used internally; exported for custom pipelines. |
| `natural` | `(key: string) => string` | Built-in key transform: `"entityType"` → `"Entity Type"`. **Default for `serialize`.** |
| `camelCase` | `(key: string) => string` | Built-in key transform: `"Full name"` → `"fullName"`. **Default for `parse`.** |
| `identity` | `(key: string) => string` | Built-in key transform: keys are kept verbatim. |

The second argument to `parse` accepts either an options object or a bare `KeyTransform` function — `parse(src, camelCase)` is shorthand for `parse(src, { keyTransform: camelCase })`.

### Key transforms

| Input key | `natural` (serialize default) | `camelCase` (parse default) | `identity` |
| --- | --- | --- | --- |
| `Full name` | `Full Name` | `fullName` | `Full name` |
| `postal_code` | `Postal Code` | `postalCode` | `postal_code` |
| `entityType` | `Entity Type` | `entitytype` | `entityType` |
| `HTTPServer` | `HTTP Server` | `httpserver` | `HTTPServer` |
| `sha256Hash` | `Sha256 Hash` | `sha256hash` | `sha256Hash` |

`natural` splits on camel/Pascal humps, `_`, `-`, `.`, and whitespace, then title-cases each word. All-caps words are preserved as acronyms (`URL` stays `URL`), and it is idempotent — `natural(natural(k)) === natural(k)` — so repeated round-trips are stable.

Note the last three rows: `camelCase` splits only on non-alphanumeric characters, so it flattens humps that are already there (`entityType` → `entitytype`). That is fine for its intended input — the spaced keys people actually write in MOL — but it is not a general-purpose recamelizer. `natural` is the one that understands humps.

The two defaults are inverses of each other, chosen so each side of the boundary gets the convention it wants — **camelCase in JS, readable words in markdown**:

```ts
MOL.parse("Entity Type: user");        // { entityType: "user" }   <- camelCase, default
MOL.serialize({ entityType: "user" }); // "Entity Type: user"      <- natural, default
```

Because they invert cleanly, JS property names survive a full round trip unchanged:

```ts
MOL.parse(MOL.serialize({ entityType: 1, sha256Hash: "x", postalCode: "8045" }));
// { entityType: 1, sha256Hash: "x", postalCode: "8045" }
```

Pass `identity` on either side to opt out and keep keys exactly as written.

### `ParseOptions` flags

Used by `parse()` and `deserialize()`.

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `keyTransform` | `(key: string) => string` | `camelCase` | Applied to every key (headings, entries, list items) before it lands on the output object. Pass `camelCase`, `natural`, `identity`, or your own function. |
| `valueKey` | `string` | `"$value"` | Property name used when an entry has **both** an inline value and children, so neither is lost. |
| `preserveRootHeadings` | `boolean` | `false` | When `false`, a document whose roots are all headings is unwrapped: one root heading yields its body object directly, several yield an array. Set to `true` to keep the heading titles as object keys instead. |

```ts
// keyTransform
MOL.parse("Full name: Jane");             // { fullName: "Jane" }     <- camelCase, default
MOL.parse("Full name: Jane", natural);    // { "Full Name": "Jane" }
MOL.parse("Full name: Jane", identity);   // { "Full name": "Jane" }
MOL.parse("Full name: Jane", (k) => k.toUpperCase()); // { "FULL NAME": "Jane" }

// valueKey — "Title" has an inline value *and* nested children
const src = `Title: My Doc
    Author: Jane
    Year: 2025`;

MOL.parse(src, camelCase);
// { title: { author: "Jane", year: 2025, $value: "My Doc" } }

MOL.parse(src, { keyTransform: camelCase, valueKey: "_text" });
// { title: { author: "Jane", year: 2025, _text: "My Doc" } }

// preserveRootHeadings
const doc = `# User 10

Id: 10`;

MOL.parse(doc, camelCase);
// { id: 10 }                      <- heading unwrapped (default)

MOL.parse(doc, { keyTransform: camelCase, preserveRootHeadings: true });
// { user10: { id: 10 } }          <- heading kept as a key
```

Multiple sibling root headings unwrap to an array, which makes record files convenient:

```ts
MOL.parse(`# Level 1 A
- Id: 10

# Level 1 B
- Id: 11`, camelCase);
// [ { id: 10 }, { id: 11 } ]
```

### `SerializeOptions` flags

Used by `serialize()`.

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `headingLevels` | `number` | `4` | How many levels of nesting are written as markdown headings (`#`, `##`, …) before falling back to indentation. `0` disables headings entirely. Clamped to `0`–`6`, since markdown has no `#######`. |
| `indent` | `string` | `"\t"` | Indentation unit per nesting level, used below the `headingLevels` cutoff. Use `"  "` for two spaces. |
| `keyTransform` | `(key: string) => string` | `natural` | Applied to every object key before it is written. Does **not** apply to `arrayItemKey` or `rootScalarKey`, which are emitted verbatim. |
| `arrayItemKey` | `string` | `"Item"` | Key emitted for each element of an array. MOL expresses arrays as repeated keys, so array elements need a name. |
| `rootScalarKey` | `string` | `"Value"` | Heading emitted when the serialized root value is a bare scalar rather than an object or array. |

### `headingLevels`

By default, nested objects and arrays become markdown sections rather than indented blocks — the form used throughout the [MOL overview](https://github.com/mol-format):

```ts
MOL.serialize({
  id: 10,
  fullName: "Jane Doe",
  password: { hash: "abc", algorithm: "argon2id", version: 19 },
  addresses: { home: { city: "Zurich", postalCode: "8045" } },
});
```

```md
Id: 10
Full Name: Jane Doe

# Password

Hash: abc
Algorithm: argon2id
Version: 19

# Addresses

## Home

City: Zurich
Postal Code: "8045"
```

Set `headingLevels: 0` for the fully indented form:

```ts
MOL.serialize(value, { headingLevels: 0, indent: "    " });
```

```md
Id: 10
Full Name: Jane Doe
Password:
    Hash: abc
    Algorithm: argon2id
    Version: 19
Addresses:
    Home:
        City: Zurich
        Postal Code: "8045"
```

Any value in between switches over at that depth — `headingLevels: 2` writes `#` and `##`, then indents everything deeper.

Two consequences of heading mode are worth knowing:

- **Object members are reordered.** Scalar members are written before members that become headings, because anything emitted after a heading would be parsed as part of that heading's section. Object key order is not semantically meaningful in MOL, but it does mean output order may differ from your object's insertion order.
- **Array elements are never reordered.** Since order matters for arrays, headings are used for an array only when *every* element is a non-empty object or array. A mixed array such as `[1, { a: 2 }, 3]` falls back to indentation for all of its elements.

### Other flags

```ts
MOL.serialize({ tags: ["tool", "metal"] }, { arrayItemKey: "Tag" });
// # Tags
//
// Tag: tool
// Tag: metal

MOL.serialize("hello", { rootScalarKey: "Greeting" });
// # Greeting
//
// hello

MOL.serialize({ entityType: 1 }, { keyTransform: identity });
// entityType: 1
```

`rootScalarKey` always emits its heading, even at `headingLevels: 0` — a bare root scalar has no other representation that round-trips.

### Working with the AST

`parseDocument` gives you the untransformed tree when you need line numbers, want to distinguish headings from entries, or are building tooling (linters, formatters, editors).

```ts
import { parseDocument, deserialize, camelCase, type MolEntry } from "mol-format";

const doc = parseDocument("Id: 10\nName: Jane");
// {
//   entries: [
//     { key: "Id",   value: "10",   children: [], source: "entry", line: 1 },
//     { key: "Name", value: "Jane", children: [], source: "entry", line: 2 },
//   ]
// }

// same tree, now deserialized with your own options
const value = deserialize(doc, { keyTransform: camelCase });
```

Exported types: `MolDocument`, `MolEntry`, `KeyTransform`, `ParseOptions`, `SerializeOptions`.

```ts
export interface MolEntry {
  key: string;
  value?: string;
  children: MolEntry[];
  source: "heading" | "entry";  // came from `# Heading` or from `Key: value`
  line: number;                 // 1-based line number in the source
}

export interface MolDocument {
  entries: MolEntry[];
}
```

## How MOL maps to JavaScript values

### Scalar coercion

Values are untyped in the file; `coerceScalar` decides the JS type:

| MOL value | JS result | Type |
| --- | --- | --- |
| `10`, `-3`, `1.5`, `2e3` | `10`, `-3`, `1.5`, `2000` | `number` |
| `true`, `FALSE` (case-insensitive) | `true`, `false` | `boolean` |
| `null` (case-insensitive) | `null` | `null` |
| `"2025"`, `'false'` | `"2025"`, `"false"` | `string` — quotes force a literal |
| `2025-01-31T23:00:00.000Z` | `"2025-01-31T23:00:00.000Z"` | `string` — ISO values are **not** converted to `Date` |
| `plain text` | `"plain text"` | `string` |
| *(empty)* | `""` | `string` |

Escapes inside quoted values: `\\`, `\"`, `\'`, `\n`, `\r`, `\t`.

> **Gotcha:** anything that looks numeric becomes a number. `Postal Code: 8045` parses as `8045`, not `"8045"`. Quote it — `Postal Code: "8045"` — to keep leading zeros and identifier-like values intact. `serialize` does this for you automatically when a string would otherwise round-trip as a number, boolean, or `null`.

### Arrays

MOL has no array syntax — arrays come from **repeating a key** at the same level:

```md
Plugin:
    Name: cache
Plugin:
    Name: auth
```

```ts
{ plugin: [{ name: "cache" }, { name: "auth" }] }
```

A key that appears only once is *not* wrapped in an array. If you need a guaranteed list, normalize it:

```ts
const toArray = <T,>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
```

### Text and fenced blocks

Indented prose and fenced code blocks under a key become multi-line strings. Fenced content is preserved literally (no escape processing), and the fence markers themselves are stripped:

````md
Script:
    ```js
    const x = 1;
    ```
````

```ts
{ script: "const x = 1;" }
```

### Comments

Comments are stripped by the lexer before parsing — except inside fenced blocks, where they are content. The two styles behave differently:

- `// line` comments only start a comment when `//` is the **first non-whitespace text on the line**. That keeps `Url: https://example.com` intact, but it also means a trailing `Id: 10 // note` is *not* stripped — it parses as the string `"10 // note"`. Put line comments on their own line.
- `/* block */` comments are stripped anywhere, including mid-line and across multiple lines.

### Round-trip notes

**Parse heading-mode output with `preserveRootHeadings: true`.** This is the one sharp edge of the default `headingLevels: 4`. Root headings are titles by default, not keys, so a document whose root members are *all* containers loses its top-level key names:

```ts
const text = MOL.serialize({ password: { hash: "x" }, addresses: { home: { city: "Z" } } });
// "# Password\n\nHash: x\n\n# Addresses\n\n## Home\n\nCity: Z"

MOL.parse(text);
// [ { hash: "x" }, { home: { city: "Z" } } ]          <- keys lost, unwrapped to an array

MOL.parse(text, { preserveRootHeadings: true });
// { password: { hash: "x" }, addresses: { home: { city: "Z" } } }   <- correct
```

This only bites when every root member is a container. If the root has at least one scalar member — the common case — the document has a mix of entries and headings at root, no unwrapping happens, and a plain `parse()` is correct. Use `headingLevels: 0` if you would rather not think about it.

Beyond that, `parse(serialize(x))` recovers scalars, objects, and nested structures, but is **not** byte-for-byte lossless:

- Arrays serialize under their key with repeated `Item` members, so `{ id: 1, tags: ["a", "b"] }` parses back as `{ id: 1, tags: { item: ["a", "b"] } }` — that wrapper key is real structure in MOL, not an artifact. Two further wrinkles: a **single-element** array comes back as a lone value rather than an array, since one occurrence is not a repeated key; and a root-level array of objects is the happy exception, becoming sibling root headings that parse back as a true array.
- Empty arrays and empty objects both serialize to a bare `key:` and parse back as `{}`.
- Keys pass through `keyTransform` in both directions, but the defaults invert each other, so JS property names come back unchanged. Override only one side and they will not.
- Object member order may change in heading mode (see above).

## Development

```bash
npm run build                    # tsc -> dist/
npm test                         # build, then run parser fixture tests + serializer tests
npm run perf                     # build, then run the round-trip benchmark
npm run generate:test-fixtures   # regenerate .camelCase.json / .identity.json expectations
```

Parser fixtures live in `tests/test-files/<group>/`. Each `<name>.mol` is paired with `<name>.camelCase.json` and/or `<name>.identity.json`; the runner parses the `.mol` file with the matching key transform and deep-compares. Adding a case means adding those files — no test code required.

Serializer coverage lives in `scripts/run-serialize-tests.js` — key-transform cases, `headingLevels` output at each cutoff, and round-trip assertions. It is a plain assertion script with no dependencies.

## Differences from the spec

This implementation intentionally diverges from [SPECS.md](https://github.com/mol-format/mol-specs/blob/main/SPECS.md) in a few places:

- Inline quoted scalars are treated as explicit string literals and are never auto-coerced (`Year: "2025"` stays a string).
- ISO 8601 date and date-time values are preserved as strings, not converted to `Date` objects.

See [DEVNOTES.md](./DEVNOTES.md) for benchmark numbers and implementation notes.

## Links

- MOL overview and other implementations: [https://github.com/mol-format](https://github.com/mol-format)
- Specification: [mol-specs/SPECS.md](https://github.com/mol-format/mol-specs/blob/main/SPECS.md)
- Issues: [mol-ts/issues](https://github.com/mol-format/mol-ts/issues)

## License

MIT
