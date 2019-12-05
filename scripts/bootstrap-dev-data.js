#!/usr/bin/env node
//@ts-check
const readJsonStream = require('read-json-stream').default;
const fs = require('fs');
const path = require('path');
const deriveBundleData = require('webpack-bundle-diff').deriveBundleData;
const getModuleGraphWithReasons = require('webpack-bundle-diff-add-reasons')
    .getModuleGraphWithReasons;

console.log('reading example data');
const exampleDataDir = path.join(__dirname, '..', 'example-data');
const statsJsonStream = readJsonStream(path.join(exampleDataDir, 'stats.json'));
statsJsonStream.done((err, statsJson) => {
    if (err) {
        console.log('got error while parsing stats json');
        console.error(err);
    } else {
        console.log('Deriving bundle data');
        const bundleData = deriveBundleData(statsJson);

        console.log('adding extra data');
        const graphWithExtraData = getModuleGraphWithReasons(
            bundleData.graph,
            statsJson,
        );

        const destDir = path.join(
            __dirname,
            '..',
            'src',
            '__tests__',
            'test-data',
            'derived',
        );
        if (!fs.existsSync(destDir)) {
            console.log('making directory', destDir);
            fs.mkdirSync(destDir);
        }

        const bundleStatsPath = path.join(destDir, 'bundleStats.json');
        console.log('writing bundlestats output to', bundleStatsPath);
        fs.writeFileSync(
            bundleStatsPath,
            JSON.stringify(
                {
                    ...bundleData,
                    graph: graphWithExtraData,
                },
                null,
                2,
            ),
            'utf-8',
        );
    }
});
