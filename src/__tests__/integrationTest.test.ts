import { readdirSync } from 'fs';
import { join as joinPath, relative as relativePath } from 'path';
import { getExportMap } from '../index';
import * as ts from 'typescript';

const exampleSrcDir = joinPath(__dirname, 'test-data-owa', 'example-src');
const lazyIndecies = readdirSync(exampleSrcDir);
const lazyIndexPaths = lazyIndecies.map(indexPath =>
    joinPath(exampleSrcDir, indexPath),
);

const program = ts.createProgram(lazyIndexPaths, {});

for (let lazyIndexPath of lazyIndexPaths) {
    const relativeLazyIndexPath = relativePath(
        joinPath(__dirname, '..'),
        lazyIndexPath,
    );
    it(`snapshots ${relativeLazyIndexPath}`, () => {
        const tsSourceFile = program.getSourceFile(lazyIndexPath);

        if (!tsSourceFile) {
            throw new Error(`file ${relativeLazyIndexPath} not in program`);
        }

        const result = getExportMap(tsSourceFile);
        expect(result).toMatchSnapshot();
    });
}
