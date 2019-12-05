# webpack-chunk-entrypoint-costs

[npm](https://www.npmjs.com/package/webpack-chunk-entrypoint-costs), [github](https://github.com/Adjective-Object/webpack-chunk-entrypoint-costs)

Gets a mapping between a typescript module's exports each export's corresponding imports.

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
