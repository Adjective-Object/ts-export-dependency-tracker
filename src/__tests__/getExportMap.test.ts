import { getExportMap } from '../index';
import * as ts from 'typescript';

describe('getExportMap', () => {
    it('works for direct exports', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            export { importedFoo } from "./import-foo";
            `,
            ts.ScriptTarget.ES2015,
        );

        const result = getExportMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Map {
              "importedFoo" => Set {
                "./import-foo",
              },
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

        const result = getExportMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Map {
              "exportedBar" => Set {
                "./import-foo",
              },
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

        const result = getExportMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Map {
              "default" => Set {
                "./import-foo",
              },
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

        const result = getExportMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Map {
              "exportedFoo1" => Set {
                "./import-foo",
              },
              "exportedFoo2" => Set {
                "./import-foo",
              },
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

        const result = getExportMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Map {
              "singleExport" => Set {
                "./import-foo",
                "./import-bar",
              },
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

        const result = getExportMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Map {
              "someFunction" => Set {
                "./bar",
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

        const result = getExportMap(sourceFile);
        expect(result).toMatchInlineSnapshot(`
            Map {
              "default" => Set {
                "./bar",
              },
            }
        `);
    });

    describe('require() tracking', () => {
        it('tracks const named exports that depend directly on requires', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                export const foo = require('./bar')
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Map {
                  "foo" => Set {
                    "./bar",
                  },
                }
            `);
        });
        it('tracks default exports that depend directly on requires', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                export default foo = require('./bar')
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Map {
                  "default" => Set {
                    "./bar",
                  },
                }
            `);
        });
        it('tracks exports that depend indirectly via a require in a lambda function body', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                const internalFunction = () => {
                  return require('./bar')
                }
                export default foo = internalFunction()
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Map {
                  "default" => Set {
                    "./bar",
                  },
                }
            `);
        });

        it('tracks exports that depend indirectly via a require in a non-lambda function expression body', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                const internalFunction = function() {
                  return require('./bar')
                }
                export default foo = internalFunction()
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
                Map {
                  "default" => Set {
                    "./bar",
                  },
                }
            `);
        });

        it('tracks exports that depend indirectly via a require in a function declaration', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                function internalFunction() {
                  return require('./bar')
                }
                export default foo = internalFunction()
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
              Map {
                "default" => Set {
                  "./bar",
                },
              }
            `);
        });

        it('tracks exports that depend indirectly via a require in a non-forward-declared function declaration', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                export default foo = internalFunction()

                function internalFunction() {
                  return require('./bar')
                }
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
              Map {
                "default" => Set {
                  "./bar",
                },
              }
            `);
        });

        it('tracks exports that depend indirectly via a constant in the module', () => {
            const sourceFile = ts.createSourceFile(
                'example.ts',
                `
                import { observer } from 'mobx-react';
                import { patchStylesForTheme } from 'styles-patcher';
                const styles = require('./styles.scss')

                const patchedStyles = patchStylesForTheme(styles)

                function MyComponentInner(props: any) {
                  return <div styles={patchedStyles.Container}>Thing</div>
                }

                export const MyComponent = observer(MyComponentInner)
                `,
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(sourceFile);
            expect(result).toMatchInlineSnapshot(`
              Map {
                "MyComponent" => Set {
                  "mobx-react",
                  "styles-patcher",
                  "./styles.scss",
                },
              }
            `);
        });
    });
});
