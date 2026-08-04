import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    GALLERY_THUMB_VARS,
    getGalleryThumbFrameHeight,
    getGalleryThumbFrameWidth,
    getGalleryThumbItemHeight,
    getGalleryThumbItemWidth,
} from './galleryGeometry';

/**
 * The gallery's thumbnail arithmetic. Pinned numerically because the numbers are
 * consumed in three places that only line up if they agree: `ThumbnailGallery`
 * (which lays the thumbnails out), its scoped CSS (which reads them as custom
 * properties), and `TriiiceratopsViewer` (which sizes the docked band and rail
 * from `gallery.size` directly).
 *
 * Everything here derives a THUMBNAIL from the gallery's committed extent, never
 * the reverse. `gallery.size` is the band's height or the rail's width, and a
 * thumbnail gets what is left of it — which is why a landscape page can be shown
 * at the rail's full width instead of being shrunk to fit a width guessed from a
 * portrait page.
 */
describe('gallery thumbnail geometry', () => {
    /** Sizes spanning the settings slider's range, plus its two ends. */
    const SIZES = [90, 120, 150, 340];

    /**
     * A strip row is the band's height less the track's padding and the slack the
     * band keeps back. Stated explicitly by the strip rather than left intrinsic:
     * the band's height is fixed by the config, so a row that worked its own height
     * out separately could exceed it and be clipped.
     */
    it('fits a thumbnail button inside the band it was given', () => {
        expect(getGalleryThumbItemHeight(150)).toBe(140);
        expect(getGalleryThumbItemHeight(120)).toBe(110);

        for (const size of SIZES) {
            // The track's padding (8) and the band's slack (2).
            expect(getGalleryThumbItemHeight(size)).toBe(size - 10);
            // Never wider than the band it has to fit in.
            expect(getGalleryThumbItemHeight(size)).toBeLessThan(size);
        }
    });

    /**
     * The frame is the row less the button's own chrome — its padding, the gap under
     * the frame, and the single label line. That chrome is a fixed cost, so a taller
     * band buys frame height one-for-one.
     */
    it('spends the button chrome out of the extent, not on top of it', () => {
        expect(getGalleryThumbFrameHeight(150)).toBe(112);
        expect(getGalleryThumbFrameHeight(120)).toBe(82);

        for (const size of SIZES) {
            expect(getGalleryThumbFrameHeight(size)).toBe(size - 38);
            expect(
                getGalleryThumbItemHeight(size) -
                    getGalleryThumbFrameHeight(size),
            ).toBe(28);
        }
    });

    /**
     * The rail's width, less the track's padding and the button's. No slack: a
     * vertical track scrolls on the free axis, so a row that rounds up costs a pixel
     * of scroll rather than being clipped.
     */
    it('fits a thumbnail button inside the rail it was given', () => {
        expect(getGalleryThumbItemWidth(150)).toBe(142);
        expect(getGalleryThumbFrameWidth(150)).toBe(134);

        for (const size of SIZES) {
            expect(getGalleryThumbItemWidth(size)).toBe(size - 8);
            expect(getGalleryThumbFrameWidth(size)).toBe(size - 16);
            // Fits the rail, so a thumbnail never spills out of both its edges.
            expect(getGalleryThumbItemWidth(size)).toBeLessThan(size);
        }
    });

    /**
     * A paged pair needs no arithmetic of its own. Width-constrained, its two panes
     * split the frame with a gap between them and the pair comes out shorter than a
     * single page — so the halves are whole pages, not pages cropped in half.
     */
    it('leaves room for two panes and a gap in a width-constrained frame', () => {
        const PANE_GAP = 1;

        for (const size of SIZES) {
            const pane = (getGalleryThumbFrameWidth(size) - PANE_GAP) / 2;
            expect(pane).toBeGreaterThan(0);
            expect(pane * 2 + PANE_GAP).toBe(getGalleryThumbFrameWidth(size));
        }
    });

    /**
     * The chrome around a frame is a fixed cost, so a small enough `gallery.size`
     * would derive a zero or negative frame and render a row of labels with nothing
     * above them. The slider does not go low enough to reach that; a host writing
     * the config directly can, so the floor is in the arithmetic rather than in the
     * control.
     */
    it('never derives a frame too small to be an image', () => {
        for (const size of [0, 1, 20, 50, 61]) {
            expect(getGalleryThumbFrameHeight(size)).toBeGreaterThanOrEqual(24);
            expect(getGalleryThumbFrameWidth(size)).toBeGreaterThanOrEqual(24);
        }
    });

    /**
     * The tab still meets WCAG 2.5.8 on size — 24px is published as
     * `--ui-caret-tab` and is the tab's own short axis wherever it is drawn. A
     * docked gallery does not buy that size out of its own thickness: the tab is
     * drawn over the middle thumbnail (above it, so it is neither obscured nor
     * unclickable). `a11y-axe.spec.ts` is what fails the build.
     */
    it('keeps the tab itself at the WCAG 2.5.8 minimum', () => {
        expect(GALLERY_THUMB_VARS).toContain('--ui-caret-tab: 24px');
    });

    /**
     * The fallback shape an image takes before it has one of its own, published as a
     * ratio rather than a pixel width because either axis can be the free one. `auto`
     * is prepended by the CSS: a loaded image's own ratio has to win, or every
     * non-portrait canvas would be letterboxed into 3:4 forever.
     */
    it('publishes a portrait fallback aspect rather than a fallback width', () => {
        expect(GALLERY_THUMB_VARS).toContain('--ui-thumb-floor-aspect: 3 / 4');
    });

    /**
     * The pixels the thumbnail button spends around its frame are owned here and
     * published to the component's CSS, so the stylesheet never restates a value
     * the thumbnail was measured from.
     */
    it('publishes the button geometry as CSS custom properties', () => {
        expect(GALLERY_THUMB_VARS).toBe(
            '--ui-thumb-pad: 4px; --ui-thumb-gap: 4px; ' +
                '--ui-thumb-pane-gap: 1px; ' +
                '--ui-thumb-label-line: 16px; ' +
                '--ui-thumb-floor-aspect: 3 / 4; --ui-caret-tab: 24px',
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

        // 0.25rem per side = the 8px the thumbnail budgets for the track.
        expect(layoutCss).toContain('--ui-gallery-pad: 0.25rem;');
    });
});
