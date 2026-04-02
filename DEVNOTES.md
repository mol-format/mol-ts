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
