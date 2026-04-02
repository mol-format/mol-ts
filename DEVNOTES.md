# Example Usage

```ts
import MOL from "mol-format";

let molContents = `
    # User 10
    
    Id: 10
    Username: janedoe
    Full name: Jane Doe
    
    ## Password
    
    Hash: aoX5r5pS5b3YF2z7LyN1g2dJ7pZ7s2P4G8H8Q2a1A
    Algorithm: argon2id
    Version: 19`;

let user = MOL.parse(molContents, MOL.camelCase);
console.log(user.id); // outputs 10
console.log(user.username); // outputs "janedoe"
console.log(user.fullName); // outputs "Jane Doe"
console.log(user.password); // outputs { hash: "aoX5r5pS5b3YF2z7LyN1g2dJ7pZ7s2P4G8H8Q2a1A",
```

# Diffs to Specs

- Inline quoted scalar values are treated as explicit string literals and are not auto-coerced.
- Supported forms are full-value single quotes and double quotes, for example `Year: "2025"` and `Flag: 'false'`.
- Basic escapes are supported inside quoted inline values: `\\`, `\"`, `\'`, `\n`, `\r`, and `\t`.
- ISO 8601 date and datetime values are an officially supported scalar convention.
- ISO date/time values are preserved as strings by the parser and are not auto-coerced to native date objects.

# Performance

- MOL is slower than JSON in the current benchmark because `JSON.parse` and `JSON.stringify` are native V8 implementations, while MOL parsing and serialization are custom TypeScript/JavaScript code.
- The MOL benchmark path does more work than JSON: line normalization, comment stripping, heading/list/fence detection, indentation-sensitive tree building, optional key transforms such as `camelCase`, scalar coercion, and canonical MOL serialization.
- Current benchmark results are still very fast in absolute terms. Recent round-trip averages were about `0.002ms` for JSON, `0.020ms` for MOL with `identity`, and `0.027ms` for MOL with `camelCase`.
- The main performance cost is in deserialization/parsing, not serialization.
- The `camelCase` path is slower than `identity` because it adds repeated string splitting, lowercasing, and reconstruction for every key.
- The most likely optimization targets are lexer/parser hot paths, repeated regex and string work, repeated structural checks per line, and key transform allocation costs.
