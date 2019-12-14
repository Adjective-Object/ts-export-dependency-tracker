import { getSymbolMap } from '../internal';
import * as ts from 'typescript';

describe('getSymbolMap', () => {
    it('works for direct exports', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            export { importedFoo } from "./import-foo";
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./import-foo",
              },
              "moduleExportsToDirectImports": Map {
                "importedFoo" => "./import-foo",
              },
              "moduleExportsToModuleSymbols": Map {},
              "moduleSymbolsToImports": Map {},
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('works for renamed direct exports', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            export { importedFoo as exportedBar } from "./import-foo";
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./import-foo",
              },
              "moduleExportsToDirectImports": Map {
                "exportedBar" => "./import-foo",
              },
              "moduleExportsToModuleSymbols": Map {},
              "moduleSymbolsToImports": Map {},
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('Can reexport named imports', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import {foo} from "./import-foo";

            export default foo;
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./import-foo",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "foo",
                },
              },
              "moduleSymbolsToImports": Map {
                "foo" => Set {
                  "./import-foo",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('Can reexport multiple named imports with exportAssignments', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import {foo1, foo2} from "./import-foo";

            export const exportedFoo1 = foo1;
            export const exportedFoo2 = foo2;
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./import-foo",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "exportedFoo1" => Set {
                  "foo1",
                },
                "exportedFoo2" => Set {
                  "foo2",
                },
              },
              "moduleSymbolsToImports": Map {
                "foo1" => Set {
                  "./import-foo",
                },
                "foo2" => Set {
                  "./import-foo",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('tracks symbol dependencies on multiple imports', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import foo from "./import-foo";
            import bar from "./import-bar";

            export const singleExport = foo + bar;
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./import-foo",
                "./import-bar",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "singleExport" => Set {
                  "foo",
                  "bar",
                },
              },
              "moduleSymbolsToImports": Map {
                "foo" => Set {
                  "./import-foo",
                },
                "bar" => Set {
                  "./import-bar",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('tracks export function declarations', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';

            export function someFunction () {
              bar()
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "someFunction" => Set {
                  "bar",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {
                "someFunction" => Set {
                  "bar",
                },
              },
            }
        `);
    });

    it('tracks default export function declarations', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';

            export default function someFunction () {
              bar()
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "bar",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {
                "someFunction" => Set {
                  "bar",
                },
              },
            }
        `);
    });

    describe('shadowing identifiers in function scopes', () => {
        it('(base case) tracks multiple referenced identifiers', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                import bar from './bar';
                import foo from './foo';
        
                export default function someFunction () {
                  foo()
                  bar()
                }
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getSymbolMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "importModuleIdentifiers": Set {
                    "./bar",
                    "./foo",
                  },
                  "moduleExportsToDirectImports": Map {},
                  "moduleExportsToModuleSymbols": Map {
                    "default" => Set {
                      "foo",
                      "bar",
                    },
                  },
                  "moduleSymbolsToImports": Map {
                    "bar" => Set {
                      "./bar",
                    },
                    "foo" => Set {
                      "./foo",
                    },
                  },
                  "moduleSymbolsToOtherModuleSymbols": Map {
                    "someFunction" => Set {
                      "foo",
                      "bar",
                    },
                  },
                }
            `);
        });

        it('tracks referenced identifiers, accounting for shadowing in function scope variable declarations', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
            import bar from './bar';
            import foo from './foo';
  
            export default function someFunction () {
              const foo = 1;
              foo()
              bar()
            }
            `,
                ts.ScriptTarget.ES2015,
            );

            const result = getSymbolMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "importModuleIdentifiers": Set {
                    "./bar",
                    "./foo",
                  },
                  "moduleExportsToDirectImports": Map {},
                  "moduleExportsToModuleSymbols": Map {
                    "default" => Set {
                      "bar",
                    },
                  },
                  "moduleSymbolsToImports": Map {
                    "bar" => Set {
                      "./bar",
                    },
                    "foo" => Set {
                      "./foo",
                    },
                  },
                  "moduleSymbolsToOtherModuleSymbols": Map {
                    "someFunction" => Set {
                      "bar",
                    },
                  },
                }
            `);
        });
    });

    describe('shadowing identifiers in for scopes', () => {
        it('(base case) tracks multiple referenced identifiers', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                import bar from './bar';
                import foo from './foo';

                export default () => {
                  for (let baz in [() => 1]) {
                    foo()
                    bar()
                  }
                }
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getSymbolMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "importModuleIdentifiers": Set {
                    "./bar",
                    "./foo",
                  },
                  "moduleExportsToDirectImports": Map {},
                  "moduleExportsToModuleSymbols": Map {
                    "default" => Set {
                      "foo",
                      "bar",
                    },
                  },
                  "moduleSymbolsToImports": Map {
                    "bar" => Set {
                      "./bar",
                    },
                    "foo" => Set {
                      "./foo",
                    },
                  },
                  "moduleSymbolsToOtherModuleSymbols": Map {},
                }
            `);
        });

        it('tracks referenced identifiers, accounting for shadowing from the for-in initializer', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                import bar from './bar';
                import foo from './foo';

                export default () => {
                  for (let foo in [() => 1]) {
                    bar(foo)
                  }
                }
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getSymbolMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "importModuleIdentifiers": Set {
                    "./bar",
                    "./foo",
                  },
                  "moduleExportsToDirectImports": Map {},
                  "moduleExportsToModuleSymbols": Map {
                    "default" => Set {
                      "bar",
                    },
                  },
                  "moduleSymbolsToImports": Map {
                    "bar" => Set {
                      "./bar",
                    },
                    "foo" => Set {
                      "./foo",
                    },
                  },
                  "moduleSymbolsToOtherModuleSymbols": Map {},
                }
            `);
        });

        it('tracks referenced identifiers, accounting for shadowing from the for-of initializer', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                import bar from './bar';
                import foo from './foo';

                export default () => {
                  for (let foo of [() => 1]) {
                    foo()
                    bar()
                  }
                }
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getSymbolMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "importModuleIdentifiers": Set {
                    "./bar",
                    "./foo",
                  },
                  "moduleExportsToDirectImports": Map {},
                  "moduleExportsToModuleSymbols": Map {
                    "default" => Set {
                      "bar",
                    },
                  },
                  "moduleSymbolsToImports": Map {
                    "bar" => Set {
                      "./bar",
                    },
                    "foo" => Set {
                      "./foo",
                    },
                  },
                  "moduleSymbolsToOtherModuleSymbols": Map {},
                }
            `);
        });

        it('tracks referenced identifiers, accounting for shadowing from the for initializer', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                import bar from './bar';
                import foo from './foo';

                export default () => {
                  for (let foo = 1;;) {
                    bar(foo)
                  }
                }
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getSymbolMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "importModuleIdentifiers": Set {
                    "./bar",
                    "./foo",
                  },
                  "moduleExportsToDirectImports": Map {},
                  "moduleExportsToModuleSymbols": Map {
                    "default" => Set {
                      "bar",
                    },
                  },
                  "moduleSymbolsToImports": Map {
                    "bar" => Set {
                      "./bar",
                    },
                    "foo" => Set {
                      "./foo",
                    },
                  },
                  "moduleSymbolsToOtherModuleSymbols": Map {},
                }
            `);
        });
    });

    it('tracks referenced identifiers, accounting for shadowing in the same if block', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';
            import foo from './foo';

            export default () => {
              if (true) {
                const foo = 1;
                bar(foo)
              }
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "bar",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('tracks referenced identifiers, accounting for shadowing in try/catch/finally blocks', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';
            import foo from './foo';
            import baz from './baz';
            import bam from './bam';
            import e from './e';

            export const x = () => {
              try {
                const foo = () => {};
                foo()              
              } catch (e) {
                const foo = 1
                console.log(foo);
              } finally {
                let baz = 1;
                bam(baz);
              }
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
                "./baz",
                "./bam",
                "./e",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "x" => Set {
                  "console",
                  "bam",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
                "baz" => Set {
                  "./baz",
                },
                "bam" => Set {
                  "./bam",
                },
                "e" => Set {
                  "./e",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('tracks referenced identifiers, accounting for shadowing from multiple parent scopes', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';
            import foo from './foo';
            import baz from './baz';

            export default () => {
              const bar = 1;
              if (true) {
                const foo = 1;
                bar(foo, baz)
              }
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
                "./baz",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "bar",
                  "baz",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
                "baz" => Set {
                  "./baz",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {},
            }
        `);
    });

    it('tracks indirect references, accounting for basic array binding patterns', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';
            import foo from './foo';
            import baz from './baz';

            const [a, b] = baz

            export default () => {
              return a;
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
                "./baz",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "a",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
                "baz" => Set {
                  "./baz",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {
                "a" => Set {
                  "baz",
                },
                "b" => Set {
                  "baz",
                },
              },
            }
        `);
    });

    it('tracks indirect references, accounting for specific position in array binding patterns', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';
            import foo from './foo';
            import baz from './baz';

            const [a, b, c] = [bar, baz, 1];

            export default () => {
              return a;
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
                "./baz",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "a",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
                "baz" => Set {
                  "./baz",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {
                "a" => Set {
                  "bar",
                },
                "b" => Set {
                  "baz",
                },
                "c" => Set {},
              },
            }
        `);
    });

    it('tracks indirect references, and bails on specific positions if there is a spread expression', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            import bar from './bar';
            import foo from './foo';
            import baz from './baz';

            const [a, b, c] = [bar, ...baz];

            export default () => {
              return a;
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
                "./baz",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "a",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
                "baz" => Set {
                  "./baz",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {
                "a" => Set {
                  "bar",
                  "baz",
                },
                "b" => Set {
                  "bar",
                  "baz",
                },
                "c" => Set {
                  "bar",
                  "baz",
                },
              },
            }
        `);
    });

    it('tracks indirect references, accounting for basic object binding patterns', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
          import bar from './bar';
          import foo from './foo';
          import baz from './baz';

          const {a, c: b} = baz

          export default () => {
            return a;
          }
          `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
                "./baz",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "a",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
                "baz" => Set {
                  "./baz",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {
                "a" => Set {
                  "baz",
                },
                "b" => Set {
                  "baz",
                },
              },
            }
        `);
    });

    it('tracks indirect references, accounting for nested object and array binding patterns', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
          import bar from './bar';
          import foo from './foo';
          import baz from './baz';

          const {a, c: [b, d]} = [baz, bar]

          export default () => {
            return a;
          }
          `,
            ts.ScriptTarget.ES2015,
        );

        const result = getSymbolMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Object {
              "importModuleIdentifiers": Set {
                "./bar",
                "./foo",
                "./baz",
              },
              "moduleExportsToDirectImports": Map {},
              "moduleExportsToModuleSymbols": Map {
                "default" => Set {
                  "a",
                },
              },
              "moduleSymbolsToImports": Map {
                "bar" => Set {
                  "./bar",
                },
                "foo" => Set {
                  "./foo",
                },
                "baz" => Set {
                  "./baz",
                },
              },
              "moduleSymbolsToOtherModuleSymbols": Map {
                "a" => Set {
                  "baz",
                  "bar",
                },
                "b" => Set {
                  "baz",
                  "bar",
                },
                "d" => Set {
                  "baz",
                  "bar",
                },
              },
            }
        `);
    });
});
