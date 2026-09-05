/**
 * The front page's local visual study set.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HERO_EXAMPLE } from '$lib/examples';

const STATIC = fileURLToPath(new URL('../../static/', import.meta.url));

describe('the hero example', () => {
    it('serves its first-paint image from the same local tile tree as its manifest', () => {
        const prerender = HERO_EXAMPLE.firstCanvas.prerender;
        expect(prerender).toBeDefined();
        // Root-relative, so the one image on the page's own critical path costs
        // no second connection setup.
        expect(prerender?.src).toMatch(/^\//);
        const src = prerender?.src ?? '';
        expect(existsSync(join(STATIC, src)), `${src} is not in static/`).toBe(
            true,
        );
    });

    it('reserves a gentler box than the folio it paints into it', () => {
        /*
         * Gentler, not landscape. The hero's band declares its own height, so
         * this shape only sizes the box below that band's width — where the
         * column is narrow, a nearly-square folio is close to the right thing
         * to reserve, and the landscape frame this used to be would have
         * letterboxed a portrait page into a third of its own height.
         *
         * What still has to hold is the reason the shape is declared at all: a
         * page much taller than it is wide would otherwise give an embed a box
         * taller than the screen it is read on.
         */
        const { reserve, firstCanvas } = HERO_EXAMPLE;
        expect(firstCanvas.height / firstCanvas.width).toBeGreaterThan(1);
        expect(reserve).toBeDefined();

        const box = (reserve?.height ?? 1) / (reserve?.width ?? 1);
        expect(box).toBeLessThan(firstCanvas.height / firstCanvas.width);
        // At a phone's width the box is still shorter than the viewport.
        expect(box).toBeLessThan(1.3);
    });
});
