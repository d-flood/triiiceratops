import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    GALLERY_THUMB_VARS,
    getGalleryBandHeight,
    getGalleryRailWidth,
    getGalleryThumbFloorItemWidth,
    getGalleryThumbFloorWidth,
    getGalleryThumbItemHeight,
} from './galleryGeometry';

/**
 * The gallery's thumbnail arithmetic. Pinned numerically because the numbers are
 * consumed in three places that only line up if they agree: `ThumbnailGallery`
 * (which lays the thumbnails out), its scoped CSS (which reads them as custom
 * properties), and `TriiiceratopsViewer` (which sizes the docked band and rail
 * around them).
 *
 * Only the band and the rail commit to a size. Every view lays thumbnails out at
 * whatever width they turn out to be, so there is no cell size here to get wrong.
 */
/** Mirrors `LABEL_LINE` — used to price the gutter against the old paged row. */
const LABEL_LINE = 16;

describe('gallery thumbnail geometry', () => {
    /**
     * A thumbnail button is the same height in every view and every viewing mode.
     * That uniformity is load-bearing: the docked band reserves a gutter for the
     * expand tab out of what is left over, so a row that could be taller than the
     * one the band was sized for would put a thumbnail under the tab.
     */
    it('gives every thumbnail button one height', () => {
        expect(getGalleryThumbItemHeight(75)).toBe(103);
        expect(getGalleryThumbItemHeight(120)).toBe(148);
        // Frame + the button's padding, gap, and its single label line.
        for (const fixedHeight of [50, 75, 120, 300]) {
            expect(getGalleryThumbItemHeight(fixedHeight)).toBe(
                fixedHeight + 28,
            );
        }
    });

    /**
     * The width a frame stands in at when there is nothing to measure — a portrait
     * 3:4 page. Ceiling, not rounding: a floor a fraction of a pixel under the frame
     * it stands in for would crop it.
     */
    it('falls back to a portrait frame width', () => {
        expect(getGalleryThumbFloorWidth(75)).toBe(57);
        expect(getGalleryThumbFloorWidth(120)).toBe(90);
        expect(getGalleryThumbFloorItemWidth(75)).toBe(65);

        for (const fixedHeight of [50, 75, 120, 200, 300]) {
            expect(
                getGalleryThumbFloorWidth(fixedHeight),
            ).toBeGreaterThanOrEqual(fixedHeight * (3 / 4));
        }
    });

    /**
     * The band's whole job: hold one thumbnail button, the track's padding, and the
     * expand tab's gutter. It used to be `fixedHeight + 55` reserving nothing at all
     * for the tab — which is why the tab sat over a thumbnail — so the gutter is new
     * cost. Keeping every row to one height is what holds it to 7px: a 24px gutter on
     * top of the old two-label-line row would have cost 23.
     */
    it('fits a strip row plus a full-size expand tab', () => {
        const CARET_TAB = 24;
        const TRACK_PAD = 8;

        for (const fixedHeight of [50, 75, 120, 300]) {
            const band = getGalleryBandHeight(fixedHeight);
            const row = getGalleryThumbItemHeight(fixedHeight);

            // The gutter is genuinely reserved, not borrowed from the row's slack.
            expect(band - row - TRACK_PAD).toBeGreaterThanOrEqual(CARET_TAB);
            expect(band).toBe(fixedHeight + 62);
            // Cheaper than the 23px a gutter would have cost the old paged row.
            expect(band - (fixedHeight + 55)).toBeLessThan(
                CARET_TAB - LABEL_LINE,
            );
        }
    });

    /**
     * The rail is the only view that has to commit to a width before it knows what
     * is in it, so it commits to one portrait thumbnail plus the tab's gutter —
     * tight against its content rather than standing a band of empty space either
     * side of every page.
     */
    it('sizes the docked rail to one portrait thumbnail plus the tab gutter', () => {
        for (const fixedHeight of [50, 75, 120, 300]) {
            expect(getGalleryRailWidth(fixedHeight)).toBe(
                getGalleryThumbFloorItemWidth(fixedHeight) + 32,
            );
        }
    });

    /**
     * Both docked views reserve the tab a gutter at least WCAG 2.5.8's minimum target
     * size, so the control meets that criterion on size rather than on its spacing
     * exception — which a tab centred on the gallery's edge, with thumbnails just
     * inboard of it, cannot satisfy for less. `a11y-axe.spec.ts` is what actually
     * fails the build, but this is the arithmetic behind it.
     */
    it('reserves the tab a gutter of at least the WCAG 2.5.8 minimum', () => {
        const WCAG_MIN_TARGET = 24;

        for (const fixedHeight of [50, 75, 120, 300]) {
            const bandGutter =
                getGalleryBandHeight(fixedHeight) -
                getGalleryThumbItemHeight(fixedHeight) -
                8 -
                2;
            const railGutter =
                getGalleryRailWidth(fixedHeight) -
                getGalleryThumbFloorItemWidth(fixedHeight) -
                8;

            expect(bandGutter).toBeGreaterThanOrEqual(WCAG_MIN_TARGET);
            expect(railGutter).toBeGreaterThanOrEqual(WCAG_MIN_TARGET);
        }
    });

    /**
     * Both helpers stop at the gallery's border, which the callers add in `calc()`
     * from `--tri-border`. Baking the token's default in here instead would leave a
     * host that themes the border with a band that no longer agrees with the
     * padding math it is supposed to hold.
     */
    it('leaves the themeable border to the caller', () => {
        expect(getGalleryBandHeight(75)).toBe(137);
        expect(getGalleryRailWidth(75)).toBe(97);
    });

    /**
     * The pixels the thumbnail button spends around its frame are owned here and
     * published to the component's CSS, so the stylesheet never restates a value
     * the band and rail were measured from.
     */
    it('publishes the button geometry as CSS custom properties', () => {
        expect(GALLERY_THUMB_VARS).toBe(
            '--ui-thumb-pad: 4px; --ui-thumb-gap: 4px; ' +
                '--ui-thumb-label-line: 16px; --ui-caret-tab: 24px',
        );
    });

    /**
     * The one number above that CSS owns rather than this module: the track padding
     * is a shared layout token, so it is mirrored here and pinned against its
     * declaration. Everything else flows the other way (TS → CSS) and cannot drift.
     */
    it('mirrors the track padding token from layout.css', () => {
        // Resolved off `import.meta.url` without a literal inside `new URL()`:
        // Vite rewrites that pattern into an asset URL, which is not a path.
        const here = dirname(fileURLToPath(import.meta.url));
        const layoutCss = readFileSync(
            resolve(here, '../../styles/layout.css'),
            'utf8',
        );

        // 0.25rem per side = the 8px `getGalleryBandHeight` budgets for the track.
        expect(layoutCss).toContain('--ui-gallery-pad: 0.25rem;');
    });
});
