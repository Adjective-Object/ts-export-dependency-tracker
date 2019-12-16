import { getNonshadowedIdentifiersReferencedInNode } from '../internal';
import * as ts from 'typescript';

describe('getNonshadowedIdentifiersReferencedInNode', () => {
    it('finds no identifiers on a literal expression', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            1 + 2
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual([]);
    });

    it('finds no identifiers on an assignment from a literal expresion', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            const y = 10000
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual([]);
    });

    it('finds names on an expression containing identifiers', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            x + 10000 / z
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['x', 'z']);
    });

    it('finds identifiers on an assignment from an expression referencing nodes', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            const y = 10000 + x / z
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['x', 'z']);
    });

    it('finds no identifiers on an empty function', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            function foo() {
                return;
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual([]);
    });

    it('finds identifiers not declared in the function', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            function foo() {
                return lol;
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['lol']);
    });

    it('does not find identifiers both referenced and declared in the function', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            function foo() {
                const x = 1;
                return x + y;
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['y']);
    });

    it('does not find function parameters', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            function foo(x: int) {
                return x + y;
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['y']);
    });

    it('does not find function type arguments', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            function foo<T>(x: int) {
                return new Set<T>([y])
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['Set', 'y']);
    });

    it('does not find catch() block bound variables', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            {
                try {}
                catch (e) {
                    cb(e);
                }    
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['cb']);
    });

    it('does not find property access', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            console.log("lol")
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['console']);
    });

    it('does not find shadowed variables in if statements', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            if (true) {
                let x = 1;
                cb(x);
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['cb']);
    });

    it('does not find shadowed variables in if/else', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            {
                if (false) {
                } else {
                    let x = 1;
                    cb(x);
                }    
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['cb']);
    });

    it('does not find variables declared in a scope through array pattern matching', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            {
                const [a,b,c] = ['a', 'b', 'c'];
                cb(a,b,c,d)
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['cb', 'd']);
    });

    it('does not find variables declared in a scope through object pattern matching', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            {
                const {a,b,c: {d}} = {a: 1, b:2, c:{d:1}};
                cb(a,b,c,d)
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual(['c', 'cb']);
    });

    it('does not find variables declared in a scope through nested array and object pattern matching', () => {
        const sourceFile = ts.createSourceFile(
            'example.ts',
            `
            {
                const {a, something: [b,{asdasdas: {e, k: [,,f,,]}}],c: {d}} = initializer;
                cb(a,b,c,d,e,f,something,asdasdas,k)
            }
            `,
            ts.ScriptTarget.ES2015,
        );

        const node = sourceFile.getChildAt(0).getChildAt(0);

        const result = getNonshadowedIdentifiersReferencedInNode(node);

        expect(Array.from(result).sort()).toEqual([
            'asdasdas',
            'c',
            'cb',
            'initializer',
            'k',
            'something',
        ]);
    });
});
