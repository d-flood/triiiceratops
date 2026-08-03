import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    GALLERY_THUMB_VARS,
    getGalleryBandHeight,
    getGalleryPairFrame,
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
describe('gallery thumbnail geometry', () => {
    /**
     * A thumbnail button is the same height in every view and every viewing mode.
     * That uniformity is load-bearing: the docked band is sized to exactly one row,
     * so a row that could be taller than the one the band was sized for would be
     * clipped by it.
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
     * The band's whole job: hold one thumbnail button and the track's padding. It
     * reserves nothing for the expand tab, which overlays the middle thumbnail
     * instead — a 24px gutter is a large fraction of a band this thin, and spending
     * it there both fattened the strip and pushed its row off-centre.
     */
    it('sizes the docked band to exactly one strip row', () => {
        const TRACK_PAD = 8;
        const BAND_SLACK = 2;

        for (const fixedHeight of [50, 75, 120, 300]) {
            const band = getGalleryBandHeight(fixedHeight);
            const row = getGalleryThumbItemHeight(fixedHeight);

            expect(band - row).toBe(TRACK_PAD + BAND_SLACK);
            expect(band).toBe(fixedHeight + 38);
        }
    });

    /**
     * The rail is the only view that has to commit to a width before it knows what
     * is in it, so it commits to one portrait thumbnail and the track's padding —
     * tight against its content rather than standing a band of empty space either
     * side of every page.
     */
    it('sizes the docked rail to one portrait thumbnail', () => {
        for (const fixedHeight of [50, 75, 120, 300]) {
            expect(getGalleryRailWidth(fixedHeight)).toBe(
                getGalleryThumbFloorItemWidth(fixedHeight) + 8,
            );
        }
    });

    /**
     * A paged pair in the rail shrinks to fit rather than being cropped in half, and
     * the arithmetic that makes that true is an inversion of the rail's own width —
     * so it has to hold at every `fixedHeight`, not just the default.
     */
    it('shrinks a paged pair to fit the rail it is in', () => {
        const PANE_GAP = 1;
        const ITEM_PAD = 8;
        const TRACK_PAD = 8;

        for (const fixedHeight of [50, 75, 120, 300]) {
            const { paneWidth, frameHeight } = getGalleryPairFrame(fixedHeight);
            const frame =
                getGalleryRailWidth(fixedHeight) - TRACK_PAD - ITEM_PAD;

            // Both panes and the gap between them fit the frame the rail leaves.
            expect(paneWidth * 2 + PANE_GAP).toBeLessThanOrEqual(frame);
            // Smaller than a single page in the same rail — that is the trade.
            expect(frameHeight).toBeLessThan(fixedHeight);
            // Still a portrait page, so a pair reads as two pages rather than two
            // slivers: the height is what 3:4 is at the pane width.
            expect(frameHeight).toBeGreaterThanOrEqual(paneWidth * (4 / 3));
        }

        expect(getGalleryPairFrame(75)).toEqual({
            paneWidth: 28,
            frameHeight: 38,
        });
    });

    /**
     * The tab still meets WCAG 2.5.8 on size — 24px is published as
     * `--ui-caret-tab` and is the tab's own short axis wherever it is drawn. What
     * changed is that a docked gallery no longer buys that size out of its own
     * thickness: the tab is drawn over the middle thumbnail (above it, so it is
     * neither obscured nor unclickable). `a11y-axe.spec.ts` is what fails the build.
     */
    it('keeps the tab itself at the WCAG 2.5.8 minimum', () => {
        expect(GALLERY_THUMB_VARS).toContain('--ui-caret-tab: 24px');
    });

    /**
     * Both helpers stop at the gallery's border, which the callers add in `calc()`
     * from `--tri-border`. Baking the token's default in here instead would leave a
     * host that themes the border with a band that no longer agrees with the
     * padding math it is supposed to hold.
     */
    it('leaves the themeable border to the caller', () => {
        expect(getGalleryBandHeight(75)).toBe(113);
        expect(getGalleryRailWidth(75)).toBe(73);
    });

    /**
     * The pixels the thumbnail button spends around its frame are owned here and
     * published to the component's CSS, so the stylesheet never restates a value
     * the band and rail were measured from.
     */
    it('publishes the button geometry as CSS custom properties', () => {
        expect(GALLERY_THUMB_VARS).toBe(
            '--ui-thumb-pad: 4px; --ui-thumb-gap: 4px; ' +
                '--ui-thumb-pane-gap: 1px; ' +
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
