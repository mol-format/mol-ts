import { isDeepStrictEqual } from "node:util";

import MOL from "../dist/index.js";

const failures = [];
let passed = 0;

function check(name, actual, expected) {
  if (isDeepStrictEqual(actual, expected)) {
    passed += 1;
    return;
  }

  failures.push({ name, actual, expected });
}

function checkRoundTrip(name, value, options = {}) {
  const text = MOL.serialize(value, options);
  const parsed = MOL.parse(text, { preserveRootHeadings: true });
  check(name, parsed, value);
}

// --- natural key transform ------------------------------------------------

check("natural: camelCase input", MOL.natural("entityType"), "Entity Type");
check("natural: single word", MOL.natural("username"), "Username");
check("natural: pascal case", MOL.natural("EntityType"), "Entity Type");
check("natural: snake case", MOL.natural("postal_code"), "Postal Code");
check("natural: kebab case", MOL.natural("postal-code"), "Postal Code");
check("natural: dotted", MOL.natural("user.name"), "User Name");
check("natural: acronym prefix", MOL.natural("HTTPServer"), "HTTP Server");
check("natural: acronym word", MOL.natural("URL"), "URL");
check("natural: trailing digits", MOL.natural("sha256Hash"), "Sha256 Hash");
check("natural: already natural", MOL.natural("Full name"), "Full Name");
check("natural: value key sentinel", MOL.natural("$value"), "$value");
check("natural: empty", MOL.natural(""), "");
check(
  "natural: idempotent",
  MOL.natural(MOL.natural("entityType")),
  MOL.natural("entityType"),
);

// --- parse defaults to natural -------------------------------------------

check(
  "parse: camelCase is the default transform",
  MOL.parse("Full name: Jane\nPostal Code: CH"),
  { fullName: "Jane", postalCode: "CH" },
);
check("parse: identity opt-out", MOL.parse("Full name: Jane", MOL.identity), {
  "Full name": "Jane",
});
check("parse: natural opt-in", MOL.parse("Full name: Jane", MOL.natural), {
  "Full Name": "Jane",
});
check(
  "serialize: natural is the default transform",
  MOL.serialize({ entityType: "user" }),
  "Entity Type: user",
);

// The two defaults are inverses, so JS property names survive a round trip.
check(
  "defaults: camelCase parse inverts natural serialize",
  MOL.parse(MOL.serialize({ entityType: 1, sha256Hash: "x", postalCode: "8045" })),
  { entityType: 1, sha256Hash: "x", postalCode: "8045" },
);

// --- headings -------------------------------------------------------------

check(
  "serialize: headings for nested containers",
  MOL.serialize({ id: 10, password: { hash: "abc", version: 19 } }),
  "Id: 10\n\n# Password\n\nHash: abc\nVersion: 19",
);

check(
  "serialize: heading depth increases with nesting",
  MOL.serialize({ addresses: { home: { city: "Zurich" } } }),
  "# Addresses\n\n## Home\n\nCity: Zurich",
);

check(
  "serialize: headingLevels 0 keeps everything indented",
  MOL.serialize({ password: { hash: "abc" } }, { headingLevels: 0 }),
  "Password:\n\tHash: abc",
);

check(
  "serialize: falls back to indentation past headingLevels",
  MOL.serialize({ a: { b: { c: { d: 1 } } } }, { headingLevels: 2 }),
  "# A\n\n## B\n\nC:\n\tD: 1",
);

check(
  "serialize: headingLevels clamps to markdown maximum",
  MOL.serialize({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }, {
    headingLevels: 99,
  }),
  "# A\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F\n\nG: 1",
);

check(
  "serialize: inline members are emitted before heading members",
  MOL.serialize({ nested: { a: 1 }, scalar: 2 }),
  "Scalar: 2\n\n# Nested\n\nA: 1",
);

check(
  "serialize: empty containers stay inline",
  MOL.serialize({ empty: {}, none: [], id: 1 }),
  "Empty:\nNone:\nId: 1",
);

check(
  "serialize: array of objects uses one heading per element",
  MOL.serialize({ item: [{ name: "Hammer" }, { name: "Nails" }] }),
  "# Item\n\n## Item\n\nName: Hammer\n\n## Item\n\nName: Nails",
);

check(
  "serialize: mixed array stays indented to preserve order",
  MOL.serialize({ mixed: [1, { a: 2 }, 3] }, { arrayItemKey: "Item" }),
  "# Mixed\n\nItem: 1\nItem:\n\tA: 2\nItem: 3",
);

check(
  "serialize: root array of objects becomes sibling headings",
  MOL.serialize([{ id: 10 }, { id: 11 }]),
  "# Item\n\nId: 10\n\n# Item\n\nId: 11",
);

check(
  "serialize: arrayItemKey is emitted verbatim",
  MOL.serialize({ tags: ["tool", "metal"] }, { arrayItemKey: "Tag" }),
  "# Tags\n\nTag: tool\nTag: metal",
);

check(
  "serialize: root scalar still uses a heading at headingLevels 0",
  MOL.serialize("hello", { headingLevels: 0, rootScalarKey: "Greeting" }),
  "# Greeting\n\nhello",
);

check(
  "serialize: multi-line scalars use fenced blocks under headings",
  MOL.serialize({ doc: { bio: "line one\nline two" } }),
  "# Doc\n\nBio:\n\t```txt\n\tline one\n\tline two\n\t```",
);

check(
  "serialize: custom indent applies below the heading cutoff",
  MOL.serialize({ a: { b: { c: 1 } } }, { headingLevels: 1, indent: "  " }),
  "# A\n\nB:\n  C: 1",
);

check(
  "serialize: keyTransform can be overridden",
  MOL.serialize({ entityType: 1 }, { keyTransform: MOL.identity }),
  "entityType: 1",
);

// --- array titles ---------------------------------------------------------

const TITLES = { arrayTitleKeys: ["label", "id"] };

check(
  "titles: element headings use the first matching key",
  MOL.serialize(
    {
      addresses: [
        { id: "addr-1", label: "Rechnungsadresse", city: "Zürich" },
        { id: "addr-2", label: "Firmenadresse", city: "Zürich" },
      ],
    },
    TITLES,
  ),
  "# Addresses\n\n## Rechnungsadresse\n\nId: addr-1\nLabel: Rechnungsadresse\nCity: Zürich" +
    "\n\n## Firmenadresse\n\nId: addr-2\nLabel: Firmenadresse\nCity: Zürich",
);

check(
  "titles: falls back to the next key in priority order",
  MOL.serialize({ rows: [{ label: "A", v: 1 }, { id: "B", v: 2 }] }, TITLES),
  "# Rows\n\n## A\n\nLabel: A\nV: 1\n\n## B\n\nId: B\nV: 2",
);

check(
  "titles: key lookup is case insensitive",
  MOL.serialize({ rows: [{ LABEL: "A", v: 1 }, { Id: "B", v: 2 }] }, TITLES),
  "# Rows\n\n## A\n\nLABEL: A\nV: 1\n\n## B\n\nId: B\nV: 2",
);

check(
  "titles: unusable values fall through to the next key",
  MOL.serialize(
    { rows: [{ label: "", id: "B", v: 1 }, { label: null, id: "C", v: 2 }] },
    TITLES,
  ),
  '# Rows\n\n## B\n\nLabel: ""\nId: B\nV: 1\n\n## C\n\nLabel: null\nId: C\nV: 2',
);

check(
  "titles: all-or-nothing when one element has no title",
  MOL.serialize({ rows: [{ label: "A", v: 1 }, { v: 2 }] }, TITLES),
  "# Rows\n\n## Item\n\nLabel: A\nV: 1\n\n## Item\n\nV: 2",
);

check(
  "titles: duplicate titles disqualify the whole array",
  MOL.serialize(
    { rows: [{ label: "Home", v: 1 }, { label: "Home", v: 2 }, { label: "Work", v: 3 }] },
    TITLES,
  ),
  "# Rows\n\n## Item\n\nLabel: Home\nV: 1\n\n## Item\n\nLabel: Home\nV: 2" +
    "\n\n## Item\n\nLabel: Work\nV: 3",
);

check(
  "titles: duplicate detection ignores case",
  MOL.serialize({ rows: [{ label: "Home", v: 1 }, { label: "home", v: 2 }] }, TITLES),
  "# Rows\n\n## Item\n\nLabel: Home\nV: 1\n\n## Item\n\nLabel: home\nV: 2",
);

check(
  "titles: a duplicate is not retried against the next candidate key",
  MOL.serialize(
    { rows: [{ label: "Home", id: "a", v: 1 }, { label: "Home", id: "b", v: 2 }] },
    TITLES,
  ),
  "# Rows\n\n## Item\n\nLabel: Home\nId: a\nV: 1\n\n## Item\n\nLabel: Home\nId: b\nV: 2",
);

check(
  "titles: finite numbers are usable titles",
  MOL.serialize({ rows: [{ id: 1, v: "x" }, { id: 2, v: "y" }] }, TITLES),
  "# Rows\n\n## 1\n\nId: 1\nV: x\n\n## 2\n\nId: 2\nV: y",
);

check(
  "titles: applied to the indented form too",
  MOL.serialize({ rows: [{ label: "A", v: 1 }, { label: "B", v: 2 }] }, {
    ...TITLES,
    headingLevels: 0,
  }),
  "Rows:\n\tA:\n\t\tLabel: A\n\t\tV: 1\n\tB:\n\t\tLabel: B\n\t\tV: 2",
);

check(
  "titles: a colon disqualifies a title in the indented form",
  MOL.serialize({ rows: [{ label: "A: x", v: 1 }, { label: "B", v: 2 }] }, {
    ...TITLES,
    headingLevels: 0,
  }),
  "Rows:\n\tItem:\n\t\tLabel: A: x\n\t\tV: 1\n\tItem:\n\t\tLabel: B\n\t\tV: 2",
);

check(
  "titles: line breaks collapse in the heading but not the value",
  MOL.serialize({ rows: [{ label: "A\nB", v: 1 }, { label: "C", v: 2 }] }, TITLES),
  "# Rows\n\n## A B\n\nLabel:\n\t```txt\n\tA\n\tB\n\t```\nV: 1\n\n## C\n\nLabel: C\nV: 2",
);

check(
  "titles: scalar elements are left alone",
  MOL.serialize({ rows: ["x", "y"] }, TITLES),
  "# Rows\n\nItem: x\nItem: y",
);

check(
  "titles: no effect without arrayTitleKeys",
  MOL.serialize({ rows: [{ label: "A" }, { label: "B" }] }),
  "# Rows\n\n## Item\n\nLabel: A\n\n## Item\n\nLabel: B",
);

// Distinct titles are by definition not repeated keys, so a titled nested
// array reads back as a keyed object rather than an array.
check(
  "titles: nested titled array deserializes as a keyed object",
  MOL.parse(
    MOL.serialize({ rows: [{ label: "A", v: 1 }, { label: "B", v: 2 }] }, TITLES),
    { preserveRootHeadings: true },
  ),
  { rows: { a: { label: "A", v: 1 }, b: { label: "B", v: 2 } } },
);

// Root headings are structural regardless of their names, so a titled root
// array still round trips as an array.
check(
  "titles: root titled array still deserializes as an array",
  MOL.parse(MOL.serialize([{ label: "A", v: 1 }, { label: "B", v: 2 }], TITLES)),
  [{ label: "A", v: 1 }, { label: "B", v: 2 }],
);

// --- round trips ----------------------------------------------------------

// Written with JS-idiomatic keys: `natural` on the way out, `camelCase` back.
const record = {
  id: 10,
  username: "janedoe",
  fullName: "Jane Doe",
  active: true,
  missing: null,
  postalCode: "8045",
  bio: "line one\nline two",
  password: { hash: "abc", version: 19 },
  addresses: { home: { city: "Zurich" }, work: { city: "Bern" } },
};

checkRoundTrip("round trip: record with headings", record);
checkRoundTrip("round trip: headingLevels 0", record, { headingLevels: 0 });
checkRoundTrip("round trip: headingLevels 1", record, { headingLevels: 1 });
checkRoundTrip("round trip: headingLevels 6", record, { headingLevels: 6 });
checkRoundTrip("round trip: two space indent", record, { indent: "  " });
checkRoundTrip("round trip: deep nesting", {
  a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } },
});
checkRoundTrip("round trip: scalars", {
  number: 1.5,
  negative: -3,
  isTrue: true,
  isFalse: false,
  nothing: null,
  numericString: "2025",
  boolString: "false",
  emptyString: "",
  iso: "2025-01-31T23:00:00.000Z",
});

// Root arrays of objects round trip exactly under heading mode, because
// repeated root headings deserialize back into an array.
check(
  "round trip: root array of objects",
  MOL.parse(MOL.serialize([{ id: 10 }, { id: 11 }])),
  [{ id: 10 }, { id: 11 }],
);

// --- reporting ------------------------------------------------------------

for (const failure of failures) {
  console.error(`serialize mismatch: ${failure.name}`);
  console.error(`  expected: ${JSON.stringify(failure.expected)}`);
  console.error(`  actual:   ${JSON.stringify(failure.actual)}`);
}

console.log(`passed ${passed} serialize test(s)`);

if (failures.length > 0) {
  process.exitCode = 1;
}
