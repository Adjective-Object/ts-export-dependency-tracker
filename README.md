# ts-export-dependency-tracker

[npm](https://www.npmjs.com/package/ts-export-dependency-tracker), [github](https://github.com/Adjective-Object/ts-export-dependency-tracker)

Calcualte a mapping mapping between a typescript module's exports each export's corresponding imports.

## Overview

This tool assumes your chunk has a single entry point that branches out to several imports.  
e.g. lazyIndex here is a single module which reexports `mod1`, `mod2`, and `mod3`.

```
                  +
                  |
                  |  async
                  |  import
                  |
                  v
           +------+-------+
     +-----+  lazy index  +-----+
     |     +------+-------+     | sync imports
     |            |             |
     v            v             v
+----+-----+ +----+-----+ +-----+----+
|          | |          | |          |
|   mod1   | |   mod2   | |   mod3   |
|          | |          | |          |
+----------+ +----------+ +----------+
```

This tool associates exports of the lazy index with some combination of mod1, mod2, and mod3 by parsing the source of the typescript file.

## Known issues

The parser gives a best-effort guess based on tracking the imports, exports, and referenced identifiers of each module-scope identifier in the file.

This is sufficient for simple analysis, but if you're analyzing more complicated export scenarios, you should be aware of the following issues:

-   Shadowed variables are not taken into account when accounting for the referenced identifiers of an expression.

    ```ts
    // identifier x will reference identifiers a and b
    const x = a + b;
    // identifier y will reference identifier a,
    // even though the `a` in the function is a different variable
    // that shadows the name `a`
    const y = function() {
        const a = 1;
        return a;
    };
    // identifier z will reference identifiers a and b,
    // even though the `b` in the expression is a property access
    const z = a.b;
    ```

-   The following import/export forms are currently not handled during parsing
    -   `module.exports = ...`
    -   `import module = ...`
    -   `require(...)`
