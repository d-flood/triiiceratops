#!/usr/bin/env node
// Post-build: relocate 404, index prose, write CNAME.

import {
    existsSync,
    mkdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSearchIndex } from './search-index.mjs';

const SITE_HOST = 'triiiceratops.org';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILD = join(APP_ROOT, 'build');
const SOURCE = join(BUILD, '404', 'index.html');
const TARGET = join(BUILD, '404.html');

if (!existsSync(SOURCE)) {
    console.error(
        `finish-build: expected a prerendered not-found page at ${SOURCE}. ` +
            'The site contract promises /404.html; without it the static host ' +
            'serves its own default for every retired URL.',
    );
    process.exit(1);
}

mkdirSync(BUILD, { recursive: true });
rmSync(TARGET, { force: true });
renameSync(SOURCE, TARGET);
rmSync(join(BUILD, '404'), { recursive: true, force: true });
console.log('finish-build: 404/index.html -> 404.html');

try {
    const { pages, output } = await buildSearchIndex({ build: BUILD });
    console.log(
        `finish-build: ${pages} page(s) indexed -> ${relative(BUILD, output)}/`,
    );
} catch (error) {
    console.error(
        `finish-build: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
}

if (process.env.PUBLISH_CNAME === '1') {
    writeFileSync(join(BUILD, 'CNAME'), `${SITE_HOST}\n`, 'utf8');
    console.log(`finish-build: CNAME -> ${SITE_HOST}`);
} else {
    console.log(
        'finish-build: CNAME not written (set PUBLISH_CNAME=1 once the domain resolves)',
    );
}
