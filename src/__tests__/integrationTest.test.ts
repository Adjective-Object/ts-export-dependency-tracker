import { readFileSync, readdirSync } from 'fs';
import { join as joinPath, relative as relativePath } from 'path';
import { getExportMap, getSymbolMap } from '../internal';
import * as ts from 'typescript';

const exampleSrcDir = joinPath(__dirname, 'test-data', 'example-src');
const lazyIndecies = readdirSync(exampleSrcDir);
const lazyIndexPaths = lazyIndecies.map(indexPath =>
    joinPath(exampleSrcDir, indexPath),
);

for (let lazyIndexPath of lazyIndexPaths) {
    const relativeLazyIndexPath = relativePath(
        joinPath(__dirname, '..'),
        lazyIndexPath,
    );
    const relativeUnixLazyIndexPath = relativeLazyIndexPath.replace(
        /\/\//g,
        '/',
    );
    describe('getExportMap', () => {
        it(`snapshots ${relativeUnixLazyIndexPath}`, () => {
            const tsSourceFile = ts.createSourceFile(
                relativeUnixLazyIndexPath,
                readFileSync(lazyIndexPath, 'utf-8'),
                ts.ScriptTarget.ES2015,
            );

            const result = getExportMap(tsSourceFile);
            expect(result).toMatchSnapshot();
        });
    });

    describe('getSymbolMap', () => {
        it(`snapshots ${relativeUnixLazyIndexPath}`, () => {
            const tsSourceFile = ts.createSourceFile(
                relativeUnixLazyIndexPath,
                readFileSync(lazyIndexPath, 'utf-8'),
                ts.ScriptTarget.ES2015,
            );

            const result = getSymbolMap(tsSourceFile);
            expect(result).toMatchSnapshot();
        });
    });
}
