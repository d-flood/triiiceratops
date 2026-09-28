#!/usr/bin/env node
// Search index built from the published HTML; scope is declared in the markup.

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as pagefind from 'pagefind';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export const BUNDLE_DIRECTORY = 'pagefind';

const BODY_MARKER = 'data-pagefind-body';

function markedPages(build) {
    return readdirSync(build, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
        .filter((entry) =>
            readFileSync(join(entry.parentPath, entry.name), 'utf8').includes(
                BODY_MARKER,
            ),
        ).length;
}

function indexedPages(output) {
    const entry = JSON.parse(
        readFileSync(join(output, 'pagefind-entry.json'), 'utf8'),
    );
    return Object.values(entry.languages).reduce(
        (total, language) => total + language.page_count,
        0,
    );
}

function parseArgs(argv) {
    const args = { build: join(APP_ROOT, 'build') };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--build') args.build = argv[++i];
        else throw new Error(`unknown argument: ${flag}`);
    }
    if (!args.build) throw new Error('--build <dir> requires a value');
    return args;
}

export async function buildSearchIndex({ build }) {
    if (!existsSync(build)) {
        throw new Error(
            `no site build output at ${build} — this step runs after \`vite build\`.`,
        );
    }

    const declared = markedPages(build);
    if (declared === 0) {
        throw new Error(
            `nothing under ${build} carries \`${BODY_MARKER}\`. Indexing scope is ` +
                "declared by the chrome layout's page body region, so a tree without " +
                'it holds no prose route at all — and Pagefind would fall back to ' +
                'indexing every page whole, the bare viewer included.',
        );
    }

    const output = join(build, BUNDLE_DIRECTORY);
    rmSync(output, { recursive: true, force: true });

    const { errors: createErrors, index } = await pagefind.createIndex();
    if (createErrors.length > 0 || index === undefined) {
        throw new Error(
            `could not start the indexer: ${createErrors.join('; ')}`,
        );
    }

    try {
        const { errors: addErrors } = await index.addDirectory({ path: build });
        if (addErrors.length > 0) {
            throw new Error(
                `indexing ${build} failed: ${addErrors.join('; ')}`,
            );
        }

        const { errors: writeErrors } = await index.writeFiles({
            outputPath: output,
        });
        if (writeErrors.length > 0) {
            throw new Error(
                `writing ${output} failed: ${writeErrors.join('; ')}`,
            );
        }

        const pages = indexedPages(output);
        if (pages !== declared) {
            throw new Error(
                `${declared} page(s) under ${build} declare \`${BODY_MARKER}\` but ` +
                    `${pages} reached the index. The index and the markup disagree ` +
                    'about what is in scope.',
            );
        }
        return { pages, output };
    } finally {
        await pagefind.close();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { build } = parseArgs(process.argv.slice(2));
    try {
        const { pages, output } = await buildSearchIndex({ build });
        console.log(
            `search-index: ${pages} page(s) -> ${relative(REPO_ROOT, output) || output}`,
        );
    } catch (error) {
        console.error(
            `search-index: ${error instanceof Error ? error.message : error}`,
        );
        process.exit(1);
    }
}
