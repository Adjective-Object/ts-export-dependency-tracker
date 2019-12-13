import { getSymbolMap } from '../index';
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
                  "someFunction",
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
                  "someFunction",
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
                  "someFunction",
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
                  "someFunction",
                  "bar",
                },
              },
            }
        `);
    });
});
