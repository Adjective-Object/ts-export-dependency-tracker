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

-   The following import/export forms are currently not handled during parsing
    -   `module.exports = ...`
    -   `import module = ...`
-   Ambient requires are not currently handled
    (e.g. an import that has effects but is not explicitly referenced by any importers will be considered not referenced by any exported symbols)