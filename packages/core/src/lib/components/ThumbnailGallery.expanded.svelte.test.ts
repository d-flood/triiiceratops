import {
    describe,
    it,
    expect,
    vi,
    beforeAll,
    beforeEach,
    afterEach,
} from 'vitest';
import { mount, unmount, tick } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import {
    getGalleryThumbFrameHeight,
    getGalleryThumbFrameWidth,
    getGalleryThumbItemHeight,
    getGalleryThumbItemWidth,
} from './galleryGeometry';

/**
 * The expanded gallery — a wrapped track of thumbnails filling the viewer's
 * center column.
 *
 * The contract these tests hold down:
 *
 * - The gallery renders in exactly ONE place at a time. Expanding moves it from
 *   its docked band/rail into the `.gallery-expanded` overlay; two mounted
 *   instances would both run the dockSide sync effects and fight over them.
 * - Expanding leaves `dockSide` alone, so collapsing puts the gallery back
 *   exactly where it was without any saved-state bookkeeping.
 * - The caret keeps its edge across the transition — a bottom dock's caret is on
 *   its top edge and stays there as that edge travels to the top of the column —
 *   so the control never jumps out from under the cursor. Only the glyph flips,
 *   to keep pointing the way the gallery will travel next.
 * - The expanded view is the floating window's track at viewer size, not a third
 *   layout with its own density. Thumbnails are laid out at whatever width their
 *   image turns out to be — the same way the docked strip lays them out — so no
 *   view reserves space a thumbnail does not fill.
 * - The overlay covers the center column only: side panels stay usable.
 */

const MANIFEST_ID = 'https://example.org/iiif/book/manifest';
const CANVAS = (name: string) => `${MANIFEST_ID}/canvas/${name}`;

function makeCanvas(name: string) {
    const id = CANVAS(name);
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label: name,
        height: 1000,
        width: 800,
        images: [
            {
                '@id': `${id}/image`,
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
                on: id,
                resource: {
                    '@id': `https://example.org/iiif/${name}/full/full/0/default.jpg`,
                    '@type': 'dctypes:Image',
                    format: 'image/jpeg',
                    height: 1000,
                    width: 800,
                    service: {
                        '@context': 'http://iiif.io/api/image/2/context.json',
                        '@id': `https://example.org/iiif/${name}`,
                        profile: 'http://iiif.io/api/image/2/level2.json',
                    },
                },
            },
        ],
    };
}

const manifestJson = {
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': MANIFEST_ID,
    '@type': 'sc:Manifest',
    label: 'Book',
    sequences: [
        {
            '@id': `${MANIFEST_ID}/sequence/normal`,
            '@type': 'sc:Sequence',
            canvases: [
                makeCanvas('page-1'),
                makeCanvas('page-2'),
                makeCanvas('page-3'),
            ],
        },
    ],
};

async function settle(ms = 300) {
    await tick();
    await new Promise((r) => setTimeout(r, ms));
    await tick();
}

// happy-dom ships an incomplete Web Animations API and Svelte's panel/gallery
// transitions call `element.animate()`. This stub completes immediately by firing
// `onfinish` on the next tick — it must actually finish, not merely no-op: the
// expanded gallery's drawer transition has an OUTRO, and Svelte only unmounts the
// node once the animation reports completion. A permanently-pending animation
// would leave the collapsed overlay in the DOM forever and every `toBeNull()`
// below would fail for the wrong reason.
beforeAll(() => {
    Element.prototype.animate = function () {
        const anim = {
            onfinish: null as null | (() => void),
            oncancel: null as null | (() => void),
            cancel() {
                anim.oncancel?.();
            },
            finish() {
                anim.onfinish?.();
            },
            play() {},
            pause() {},
            addEventListener() {},
            removeEventListener() {},
            finished: Promise.resolve(),
            currentTime: 0,
            playState: 'finished',
        };
        setTimeout(() => anim.onfinish?.(), 0);
        return anim as unknown as Animation;
    };
    // `scrollIntoView` is unimplemented in happy-dom; the auto-scroll effect
    // calls it on every canvas change.
    Element.prototype.scrollIntoView = function () {};
});

describe('expanded thumbnail gallery', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;
    const apps: Array<ReturnType<typeof mount>> = [];

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => manifestJson,
        }));
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) {
            await unmount(app);
        }
        target.remove();
        vi.restoreAllMocks();
    });

    async function mountViewer(gallery: Record<string, unknown>) {
        const props = $state({
            manifestId: MANIFEST_ID,
            config: { gallery: { open: true, ...gallery } } as Record<
                string,
                unknown
            >,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settle();
        return props;
    }

    const roots = () => target.querySelectorAll('.gallery-root');
    const overlay = () => target.querySelector('.gallery-expanded');
    const band = () => target.querySelector('.gallery-band');
    const caret = () =>
        target.querySelector('.expand-toggle') as HTMLButtonElement | null;
    const caretAnchor = () => target.querySelector('.toggle-anchor');

    it('renders the docked strip with an expand caret when collapsed', async () => {
        await mountViewer({ dockPosition: 'bottom' });

        expect(band()).not.toBeNull();
        expect(overlay()).toBeNull();
        expect(roots()).toHaveLength(1);

        const toggle = caret();
        expect(toggle).not.toBeNull();
        expect(toggle?.getAttribute('aria-expanded')).toBe('false');
        expect(toggle?.getAttribute('aria-label')).toBe('Expand Gallery');
    });

    /**
     * The tab is 12px of glyph, so the label has to come from somewhere: it gets
     * the same hover tooltip the toolbar buttons use, tracking the same label the
     * button announces. Collapsed, the bubble opens outward over the canvas;
     * expanded, the gallery IS the column, so it opens inward instead of off the
     * viewer's edge.
     */
    it('labels the caret with a tooltip that follows the toggle state', async () => {
        const props = await mountViewer({ dockPosition: 'bottom' });

        expect(caretAnchor()?.getAttribute('data-tip')).toBe('Expand Gallery');
        expect(caretAnchor()?.classList.contains('place-top')).toBe(true);

        props.viewerState?.setGalleryExpanded(true);
        await settle();

        expect(caretAnchor()?.getAttribute('data-tip')).toBe(
            'Collapse Gallery',
        );
        expect(caretAnchor()?.classList.contains('place-bottom')).toBe(true);
    });

    /**
     * `gallery.size` IS the rail's width — the gallery is given the number and its
     * thumbnails come out of it, rather than the rail guessing a width from a
     * thumbnail. Pinned end-to-end because the two consumers are separate
     * components; the border comes from `--tri-border` in `calc()` rather than being
     * baked into the number.
     */
    it('sizes the docked rail to gallery.size', async () => {
        await mountViewer({ dockPosition: 'left', size: 120 });

        const host = target.querySelector('.gallery-host') as HTMLElement;
        expect(host.style.getPropertyValue('--ui-gallery-rail')).toBe('120px');

        // ...and the thumbnail is what fits inside it.
        const root = target.querySelector('.gallery-root') as HTMLElement;
        expect(root.style.getPropertyValue('--ui-thumb-item-w').trim()).toBe(
            `${getGalleryThumbItemWidth(120)}px`,
        );
    });

    /**
     * A docked strip spends nothing on the tab: it overlays whichever thumbnail is
     * under the middle of the canvas-facing edge, so the band is exactly one row deep
     * and the row sits centred in it. A 24px gutter there is a large fraction of a
     * band this thin — it fattened the strip and shoved its thumbnails off-centre.
     *
     * The tab itself is still 24px (WCAG 2.5.8 on size), which is what the root
     * publishes as `--ui-caret-tab` for its own CSS to draw from. Only the expanded
     * overlay, which can afford it, turns that into root padding.
     */
    it('overlays the expand tab on the docked strip rather than reserving a gutter', async () => {
        await mountViewer({ dockPosition: 'bottom' });

        const root = target.querySelector('.gallery-root') as HTMLElement;
        // Bottom-docked, so the canvas-facing edge — and the tab — is the top.
        expect(root.classList.contains('caret-top')).toBe(true);
        expect(root.classList.contains('expanded')).toBe(false);

        // The tab keeps its full target size...
        const tab = Number.parseFloat(
            root.style.getPropertyValue('--ui-caret-tab'),
        );
        expect(tab).toBeGreaterThanOrEqual(24);

        // ...but the band's height goes to the row alone, with no room set aside
        // for the tab: the track's padding and a pixel or two of slack is all that
        // separates the row from the band's edges.
        const slack = 100 - getGalleryThumbItemHeight(100) - 8;
        expect(slack).toBeLessThan(tab);
    });

    /**
     * A paged pair in the rail needs no sizing path of its own. The rail constrains
     * WIDTH, so a pair is two half-width panes inside the one width every thumbnail
     * there gets: both pages come out whole and shorter than a single page, instead
     * of being cropped in half to fit a frame committed to a full-height page.
     *
     * Asserted through the wiring — the pair's frame carries two panes inside the
     * same committed width, and the root publishes no pair-specific size — because
     * happy-dom has no layout to measure.
     */
    it("splits the rail's committed width between a paged pair's two panes", async () => {
        const props = await mountViewer({ dockPosition: 'right' });
        props.viewerState.viewingMode = 'paged';
        await settle();

        const root = target.querySelector('.gallery-root') as HTMLElement;
        expect(root.classList.contains('dock-vertical')).toBe(true);
        expect(root.classList.contains('constrain-width')).toBe(true);

        // Three canvases pair as [1+2], [3] — so both shapes are on screen, and
        // only the pair is marked.
        const frames = [...target.querySelectorAll('.thumb-frame')];
        const paged = frames.filter((f) => f.classList.contains('frame-paged'));
        expect(paged).toHaveLength(1);
        expect(frames).toHaveLength(2);
        expect(paged[0].querySelectorAll('.thumb-pane')).toHaveLength(2);

        // One committed width, whatever is in the frame — the pair divides it.
        expect(root.style.getPropertyValue('--ui-thumb-item-w').trim()).toBe(
            `${getGalleryThumbItemWidth(100)}px`,
        );
        expect(getGalleryThumbFrameWidth(100)).toBe(84);
    });

    /**
     * A paged pair names two canvases, and used to get a second label line of its
     * own — which made a paged strip row taller than an unpaged one and left the
     * band, sized for the taller row, nothing to spare for the tab's gutter. The
     * second line rides over the bottom of the frame instead, so every row is one
     * height whatever the viewing mode.
     */
    it('keeps a paged pair the same height as a single page', async () => {
        const props = await mountViewer({ dockPosition: 'bottom' });

        const rowHeights = () =>
            [...target.querySelectorAll('.thumb-item')].map(
                (item) => (item as HTMLElement).style.height,
            );
        const expected = `${getGalleryThumbItemHeight(100)}px`;

        expect(rowHeights().length).toBeGreaterThan(0);
        expect(new Set(rowHeights())).toEqual(new Set([expected]));

        props.viewerState.viewingMode = 'paged';
        await settle();

        // Three canvases pair as [1+2], [3] — so both shapes are on screen.
        const items = [...target.querySelectorAll('.thumb-item')];
        const stacks = items.map((item) => item.querySelector('.label-stack')!);
        expect(stacks.some((s) => s.classList.contains('label-overlay'))).toBe(
            true,
        );
        expect(stacks.some((s) => !s.classList.contains('label-overlay'))).toBe(
            true,
        );

        // The pair carries a line per canvas, and still costs the same height.
        const pair = stacks.find((s) => s.classList.contains('label-overlay'))!;
        expect(pair.querySelectorAll('.label-line')).toHaveLength(2);
        expect(new Set(rowHeights())).toEqual(new Set([expected]));
    });

    it('moves the gallery into the center-column overlay when the caret is clicked', async () => {
        const props = await mountViewer({ dockPosition: 'bottom' });

        caret()?.click();
        await settle();

        expect(props.viewerState?.galleryExpanded).toBe(true);
        expect(overlay()).not.toBeNull();
        // The docked site stood down — one gallery, never two.
        expect(band()).toBeNull();
        expect(roots()).toHaveLength(1);
        expect(roots()[0].classList.contains('expanded')).toBe(true);

        const toggle = caret();
        expect(toggle?.getAttribute('aria-expanded')).toBe('true');
        expect(toggle?.getAttribute('aria-label')).toBe('Collapse Gallery');
    });

    it('keeps dockSide through an expand/collapse round trip', async () => {
        const props = await mountViewer({ dockPosition: 'left' });
        expect(props.viewerState?.dockSide).toBe('left');

        props.viewerState?.setGalleryExpanded(true);
        await settle();

        expect(overlay()).not.toBeNull();
        expect(props.viewerState?.dockSide).toBe('left');

        props.viewerState?.setGalleryExpanded(false);
        await settle();

        // Back in the rail, and the overlay is gone.
        expect(overlay()).toBeNull();
        expect(target.querySelector('.gallery-host')).not.toBeNull();
        expect(roots()).toHaveLength(1);
    });

    /**
     * Unlike the top/bottom band, the side rail animates shut with
     * `transition:slideWidth`, so it stays in the DOM for the ~200ms outro after
     * expanding — briefly two mounted galleries. That is benign: both instances
     * mirror `viewerState.dockSide` into their local proxy and write back only
     * on a difference, so they converge on the same value instead of fighting.
     * This test pins that convergence, since it is the thing that would break if
     * the dockSide sync ever became order-dependent.
     */
    it('keeps dockSide stable while the side rail animates shut', async () => {
        const props = await mountViewer({ dockPosition: 'right' });

        props.viewerState?.setGalleryExpanded(true);
        await tick();

        expect(props.viewerState?.dockSide).toBe('right');

        await settle();

        expect(props.viewerState?.dockSide).toBe('right');

        // And it survives the round trip back into the rail.
        props.viewerState?.setGalleryExpanded(false);
        await settle();

        expect(props.viewerState?.dockSide).toBe('right');
    });

    it('renders as a wrapped track, not a strip, when expanded from a horizontal dock', async () => {
        await mountViewer({ dockPosition: 'bottom', expanded: true });

        const track = target.querySelector('.gallery-track');
        expect(track?.classList.contains('track-vertical')).toBe(true);
        expect(track?.classList.contains('track-horizontal')).toBe(false);
    });

    /**
     * The expanded view is the floating window's track at viewer size, not a third
     * layout: same track classes, same (absent) inline sizing. Asserted by comparing
     * the two directly, so a future density tweak to one that skips the other fails
     * here.
     */
    it('uses the same track geometry as the floating window', async () => {
        const trackStyle = (root: HTMLElement) =>
            root.querySelector('.gallery-track')?.getAttribute('style')?.trim();
        const trackClass = (root: HTMLElement) =>
            root.querySelector('.gallery-track')?.className;

        await mountViewer({ dockPosition: 'bottom', expanded: true });
        const expandedStyle = trackStyle(target);
        const expandedClass = trackClass(target);

        // A floating window tall enough to take the grid branch.
        for (const app of apps.splice(0)) await unmount(app);
        target.remove();
        target = document.createElement('div');
        document.body.appendChild(target);
        await mountViewer({ dockPosition: 'none', height: 500, width: 400 });

        expect(expandedStyle).toBe(trackStyle(target));
        expect(expandedClass).toBe(trackClass(target));
        // Neither carries an inline cell size: the track wraps items at whatever
        // width their thumbnail turns out to be, so there is no cell to size.
        expect(expandedStyle ?? '').not.toContain('grid-template-columns');
    });

    /**
     * `gallery.size` is the only knob that changes a thumbnail's size, in the
     * expanded view exactly as in the strip. Expanded out of a bottom dock, the
     * constrained axis is still the HEIGHT, and widths follow from the images — so
     * the frame height is what pins the two views together.
     */
    it('sizes the expanded thumbnail from gallery.size', async () => {
        await mountViewer({
            dockPosition: 'bottom',
            expanded: true,
            size: 120,
        });

        const root = target.querySelector('.gallery-root') as HTMLElement;
        expect(root.classList.contains('constrain-width')).toBe(false);

        const frame = target.querySelector('.thumb-frame') as HTMLElement;
        expect(getComputedStyle(frame).height).toBe(
            `${getGalleryThumbFrameHeight(120)}px`,
        );
        // The same row the collapsed strip is built around.
        expect(getGalleryThumbItemHeight(120)).toBe(110);
    });

    /**
     * The point of taking the constrained axis from the dock side rather than from
     * the layout: expanded out of a side rail, a thumbnail keeps the rail's WIDTH,
     * so it is exactly the size the rail showed it at. Constraining height here
     * instead would render the same canvas at two different sizes — and a landscape
     * page, which cannot be full height and fit a rail's width at once, at wildly
     * different ones.
     */
    it("keeps a side dock's width constraint when expanded", async () => {
        const props = await mountViewer({ dockPosition: 'left', size: 120 });

        const collapsed = target.querySelector('.gallery-root') as HTMLElement;
        expect(collapsed.classList.contains('constrain-width')).toBe(true);
        const committed = collapsed.style
            .getPropertyValue('--ui-thumb-item-w')
            .trim();
        expect(committed).toBe(`${getGalleryThumbItemWidth(120)}px`);

        props.viewerState?.setGalleryExpanded(true);
        await settle();

        const root = target.querySelector('.gallery-root') as HTMLElement;
        expect(root.classList.contains('expanded')).toBe(true);
        // Same constraint, same width — the overlay is wider, the thumbnail is not.
        expect(root.classList.contains('constrain-width')).toBe(true);
        expect(root.style.getPropertyValue('--ui-thumb-item-w').trim()).toBe(
            committed,
        );

        const item = target.querySelector('.thumb-item') as HTMLElement;
        expect(getComputedStyle(item).width).toBe(
            `${getGalleryThumbItemWidth(120)}px`,
        );
    });

    it('keeps the caret on the same edge across expand, flipping only the glyph', async () => {
        const props = await mountViewer({ dockPosition: 'bottom' });

        // Collapsed at the bottom: the caret rides the edge facing the canvas.
        expect(roots()[0].classList.contains('caret-top')).toBe(true);
        const collapsedGlyph = caret()?.innerHTML;

        props.viewerState?.setGalleryExpanded(true);
        await settle();

        // Expanded: the SAME edge travels to the top of the column and takes the
        // caret with it — it must not jump to the opposite side under the cursor.
        expect(roots()[0].classList.contains('caret-top')).toBe(true);
        expect(roots()[0].classList.contains('caret-bottom')).toBe(false);

        // Only the glyph changes, to keep pointing the way it will travel next.
        expect(caret()?.innerHTML).not.toBe(collapsedGlyph);
    });

    it('keeps the caret on the inboard edge of a side dock across expand', async () => {
        const props = await mountViewer({ dockPosition: 'left' });

        expect(roots()[0].classList.contains('caret-right')).toBe(true);

        props.viewerState?.setGalleryExpanded(true);
        await settle();

        expect(roots()[0].classList.contains('caret-right')).toBe(true);
        expect(roots()[0].classList.contains('caret-left')).toBe(false);
    });

    it('collapses on Escape', async () => {
        const props = await mountViewer({
            dockPosition: 'bottom',
            expanded: true,
        });
        expect(overlay()).not.toBeNull();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await settle();

        expect(props.viewerState?.galleryExpanded).toBe(false);
        expect(overlay()).toBeNull();
        // Escape collapses; it does not close the gallery.
        expect(props.viewerState?.showThumbnailGallery).toBe(true);
    });

    it('selects the canvas and collapses when a thumbnail is clicked', async () => {
        const props = await mountViewer({
            dockPosition: 'bottom',
            expanded: true,
        });

        const thumbs = target.querySelectorAll(
            '.gallery-expanded .thumb-item',
        ) as NodeListOf<HTMLButtonElement>;
        expect(thumbs.length).toBe(3);

        thumbs[2].click();
        await settle();

        expect(props.viewerState?.canvasId).toBe(CANVAS('page-3'));
        expect(props.viewerState?.galleryExpanded).toBe(false);
        expect(overlay()).toBeNull();
    });

    it('offers maximize/restore instead of a caret when floating', async () => {
        const props = await mountViewer({ dockPosition: 'none' });

        // No dock edge to travel from, so no edge caret.
        expect(roots()[0].className).not.toContain('caret-');
        const toggle = caret();
        expect(toggle?.classList.contains('toggle-inline')).toBe(true);

        toggle?.click();
        await settle();

        expect(props.viewerState?.galleryExpanded).toBe(true);
        expect(overlay()).not.toBeNull();
        expect(roots()).toHaveLength(1);
    });

    it('drops the expanded state when the gallery is closed', async () => {
        const props = await mountViewer({
            dockPosition: 'bottom',
            expanded: true,
        });

        props.viewerState?.toggleThumbnailGallery();
        await settle();

        expect(overlay()).toBeNull();
        expect(roots()).toHaveLength(0);

        // Re-opening returns the strip, not the full-column grid.
        props.viewerState?.toggleThumbnailGallery();
        await settle();

        expect(props.viewerState?.galleryExpanded).toBe(false);
        expect(band()).not.toBeNull();
        expect(overlay()).toBeNull();
    });
});
