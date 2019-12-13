import { readFileSync, readdirSync } from 'fs';
import { join as joinPath, relative as relativePath } from 'path';
import { getExportMap } from '../index';
import * as ts from 'typescript';

const exampleSrcDir = joinPath(__dirname, 'test-data-owa', 'example-src');
const lazyIndecies = readdirSync(exampleSrcDir);
const lazyIndexPaths = lazyIndecies.map(indexPath =>
    joinPath(exampleSrcDir, indexPath),
);

for (let lazyIndexPath of lazyIndexPaths) {
    const relativeLazyIndexPath = relativePath(
        joinPath(__dirname, '..'),
        lazyIndexPath,
    );
    it(`snapshots ${relativeLazyIndexPath}`, () => {
        const tsSourceFile = ts.createSourceFile(
            relativeLazyIndexPath,
            readFileSync(lazyIndexPath, 'utf-8'),
            ts.ScriptTarget.ES2015,
        );

        const result = getExportMap(tsSourceFile);
        expect(result).toMatchSnapshot();
    });
}
