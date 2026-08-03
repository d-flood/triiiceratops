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
     * expand tab's gutter. It used to be `fixedHeight + 55` with no gutter reserved
     * at all — the tab lived in the slack a short row happened to leave, and
     * overlapped a paged pair, whose second label line ate that slack. Reserving
     * the gutter properly costs nothing now that every row is one height: the band
     * comes out SHORTER than it was.
     */
    it('fits a strip row plus the expand tab, without growing the band', () => {
        const CARET_TAB = 12;
        const TRACK_PAD = 8;

        for (const fixedHeight of [50, 75, 120, 300]) {
            const band = getGalleryBandHeight(fixedHeight);
            const row = getGalleryThumbItemHeight(fixedHeight);

            // The gutter is genuinely reserved, not borrowed from the row's slack.
            expect(band - row - TRACK_PAD).toBeGreaterThanOrEqual(CARET_TAB);
            // And it still costs less than the band did before it reserved one.
            expect(band).toBeLessThan(fixedHeight + 55);
            expect(band).toBe(fixedHeight + 50);
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
                getGalleryThumbFloorItemWidth(fixedHeight) + 16,
            );
        }
    });

    /**
     * Both helpers stop at the gallery's border, which the callers add in `calc()`
     * from `--tri-border`. Baking the token's default in here instead would leave a
     * host that themes the border with a band that no longer agrees with the
     * padding math it is supposed to hold.
     */
    it('leaves the themeable border to the caller', () => {
        expect(getGalleryBandHeight(75)).toBe(125);
        expect(getGalleryRailWidth(75)).toBe(81);
    });

    /**
     * The pixels the thumbnail button spends around its frame are owned here and
     * published to the component's CSS, so the stylesheet never restates a value
     * the band and rail were measured from.
     */
    it('publishes the button geometry as CSS custom properties', () => {
        expect(GALLERY_THUMB_VARS).toBe(
            '--ui-thumb-pad: 4px; --ui-thumb-gap: 4px; ' +
                '--ui-thumb-label-line: 16px; --ui-caret-tab: 12px',
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
