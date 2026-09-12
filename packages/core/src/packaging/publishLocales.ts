/*
 * Publish the locale catalogs core maintains but does not ship inline
 * (build-time tooling — lives in src/packaging, never published).
 *
 * English is imported by `state/i18n.svelte.ts` and therefore has to stay where
 * that import resolves, `dist/messages/en.json`. Every other catalog is an
 * ASSET: nothing shipped imports it, and it reaches a host only through the
 * `triiiceratops/locales/*` subpath export, which a host passes to
 * `config.messages`. Leaving such a catalog under `dist/messages` as well would
 * publish it twice, so this moves it.
 *
 * Run directly: `node ./src/packaging/publishLocales.ts` (Node strips the types).
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Catalogs published as assets, by locale tag. */
export const ASSET_LOCALES = ['de'] as const;

/**
 * Move each asset catalog from `distMessages` to `distLocales`. Returns the
 * locales moved; a catalog that is not there is an error, because the export map
 * promises it.
 */
export function publishLocales(
    distMessages: string,
    distLocales: string,
): string[] {
    mkdirSync(distLocales, { recursive: true });
    const moved: string[] = [];
    for (const locale of ASSET_LOCALES) {
        const from = join(distMessages, `${locale}.json`);
        if (!existsSync(from)) {
            throw new Error(`publish-locales: ${from} not found`);
        }
        copyFileSync(from, join(distLocales, `${locale}.json`));
        rmSync(from);
        moved.push(locale);
    }
    return moved;
}

// CLI entry: move within ./dist relative to the package root.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const dist = fileURLToPath(new URL('../../dist', import.meta.url));
    const moved = publishLocales(join(dist, 'messages'), join(dist, 'locales'));
    console.log(
        `publish-locales: published ${moved.length} locale asset(s) to ` +
            `dist/locales/ (${moved.join(', ')}).`,
    );
}
