/**
 * What `/handles/` has to be true of as a declaration, before a browser sees it.
 *
 * The page answers a curator's question, and the two ways it can quietly stop
 * answering it are both invisible in a screenshot: a class named in the
 * specification's words rather than in the words a curator would use of their
 * own holdings, and the page drifting into the compliance claim that is made in
 * exactly one other place. Both are asserted here.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HERO_EXAMPLE } from '$lib/examples';
import { MATERIAL_CLASSES } from '$lib/materialClasses';

const SOURCE = readFileSync(
    fileURLToPath(new URL('../../src/lib/materialClasses.ts', import.meta.url)),
    'utf8',
);

/** Everything on the page a reader reads, per class. */
function prose(): string[] {
    return MATERIAL_CLASSES.flatMap((material) => [
        material.name,
        material.what,
        material.material,
        material.source.who,
    ]);
}

describe('the material classes', () => {
    it('are the five kinds the page promises', () => {
        expect(MATERIAL_CLASSES).toHaveLength(5);
    });

    it('name a kind of material rather than a property of a manifest', () => {
        // The vocabulary a curator would not use of their own holdings. Every
        // one of these is the right word somewhere in the documentation and the
        // wrong word here.
        const specification =
            /manifest|canvas|annotation|structures|viewingDirection|IIIF|recipe|cookbook|level ?0|image api|presentation api/i;
        for (const { name } of MATERIAL_CLASSES) {
            expect(name, name).not.toMatch(specification);
        }
    });

    it('claim no compliance, and cite no recipe', () => {
        // A recipe id — `0024-book-4-toc` — as a reader would read it. The
        // manifest URLs contain one and that is honest attribution; nothing a
        // reader reads may.
        for (const text of prose()) {
            expect(text, text).not.toMatch(/\d{4}-[a-z]/);
        }
        // Compliance is claimed in the recipe catalog and nowhere else, so this
        // page must not be able to reach it. The catalog is named in this
        // module's own prose, which is why the import rather than the mention
        // is what is asserted.
        expect(SOURCE).not.toMatch(/^import .*@triiiceratops\/cookbook/m);
    });

    it('each reserve their box from a real first canvas', () => {
        for (const { name, example } of MATERIAL_CLASSES) {
            expect(example.firstCanvas.width, name).toBeGreaterThan(0);
            expect(example.firstCanvas.height, name).toBeGreaterThan(0);
            expect(example.canvases, name).toBeGreaterThan(0);
        }
    });

    it('prerender no image, because the material is somebody else’s', () => {
        // The hero paints its first canvas into the reserved box because this
        // site serves that image. Doing the same here would put five requests
        // to other people's servers on this page's own load.
        for (const { name, example } of MATERIAL_CLASSES) {
            expect(example.firstCanvas.prerender, name).toBeUndefined();
        }
    });

    it('run five different manifests, none of them the front page’s', () => {
        const manifests = MATERIAL_CLASSES.map(
            (material) => material.example.manifest,
        );
        expect(new Set(manifests).size).toBe(manifests.length);
        for (const manifest of manifests) {
            expect(manifest).toMatch(/^https:\/\//);
            expect(manifest).not.toBe(HERO_EXAMPLE.manifest);
        }
    });

    it('configure no plugin, because this application ships none to a reader', () => {
        for (const { name, config } of MATERIAL_CLASSES) {
            expect(config.plugins, name).toBeUndefined();
        }
    });
});
