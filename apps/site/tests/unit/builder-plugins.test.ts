/**
 * The plugins the builder offers, held to the documentation that covers them.
 *
 * The claim a snippet makes is that a reader can paste it and be running, so
 * every plugin's package specifier and exported symbol are read out of
 * `apps/site/content/docs/` rather than written twice. A plugin that renames
 * its export fails here rather than shipping a paste that resolves to nothing —
 * the same discipline the framework snippets are held to, for the same reason.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BUILDER_PLUGINS } from '../../src/lib/builder/plugins';

/** A documentation page as one string: prose, code blocks and all. */
function docText(slug: string): string {
    return readFileSync(
        fileURLToPath(
            new URL(`../../content/docs/${slug}.json`, import.meta.url),
        ),
        'utf8',
    );
}

const ROOT = new URL('../../../../', import.meta.url);

describe('every plugin the builder offers', () => {
    it('is a package this workspace publishes', () => {
        for (const plugin of BUILDER_PLUGINS) {
            const directory = plugin.pkg.replace('@triiiceratops/', '');
            const manifest = JSON.parse(
                readFileSync(
                    fileURLToPath(
                        new URL(`packages/${directory}/package.json`, ROOT),
                    ),
                    'utf8',
                ),
            ) as { name: string; private?: boolean };

            expect(manifest.name).toBe(plugin.pkg);
            expect(manifest.private).not.toBe(true);
        }
    });

    it('exports the symbol the snippets import', () => {
        for (const plugin of BUILDER_PLUGINS) {
            const directory = plugin.pkg.replace('@triiiceratops/', '');
            const index = readFileSync(
                fileURLToPath(
                    new URL(`packages/${directory}/src/index.ts`, ROOT),
                ),
                'utf8',
            );
            expect(index).toContain(plugin.symbol);
        }
    });

    it('is covered by a documentation page that names it', () => {
        for (const plugin of BUILDER_PLUGINS) {
            const doc = docText(plugin.doc);
            expect(doc).toContain(plugin.pkg);
            expect(doc).toContain(plugin.symbol);
            expect(plugin.href).toBe(`/docs/${plugin.doc}/`);
        }
    });

    it('is offered once, under a distinct id', () => {
        const ids = BUILDER_PLUGINS.map((plugin) => plugin.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    /*
     * The annotation editor is an authoring surface rather than a viewing one,
     * and this route builds a viewer. Named here so that adding it is a
     * decision somebody makes rather than one that happens.
     */
    it('is not the annotation editor', () => {
        for (const plugin of BUILDER_PLUGINS) {
            expect(plugin.pkg).not.toContain('annotation-editor');
        }
    });
});
