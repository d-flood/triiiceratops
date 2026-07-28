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

/**
 * The expanded gallery — a thumbnail grid filling the viewer's center column.
 *
 * The contract these tests hold down:
 *
 * - The gallery renders in exactly ONE place at a time. Expanding moves it from
 *   its docked band/rail into the `.gallery-expanded` overlay; two mounted
 *   instances would both run the dockSide sync effects and fight over them.
 * - Expanding leaves `dockSide` alone, so collapsing puts the gallery back
 *   exactly where it was without any saved-state bookkeeping.
 * - The caret points the way the gallery will travel (up out of a bottom dock,
 *   back down to collapse), which is what makes it readable as an affordance.
 * - The overlay covers the center column only: side panels stay usable.
 */

vi.mock('openseadragon', () => ({
    default: Object.assign(
        vi.fn(() => ({
            addHandler: vi.fn(),
            removeHandler: vi.fn(),
            removeAllHandlers: vi.fn(),
            destroy: vi.fn(),
            open: vi.fn(),
            close: vi.fn(),
            forceRedraw: vi.fn(),
            setMouseNavEnabled: vi.fn(),
            addOverlay: vi.fn(),
            removeOverlay: vi.fn(),
            clearOverlays: vi.fn(),
            viewport: {
                getZoom: vi.fn(() => 1),
                getMaxZoom: vi.fn(() => 10),
                getMinZoom: vi.fn(() => 0.1),
                zoomTo: vi.fn(),
                zoomBy: vi.fn(),
                panTo: vi.fn(),
                goHome: vi.fn(),
                fitBounds: vi.fn(),
                imageToViewportCoordinates: vi.fn(),
                imageToViewportRectangle: vi.fn(),
                viewportToImageCoordinates: vi.fn(),
                getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
            },
            world: {
                getItemCount: vi.fn(() => 0),
                getItemAt: vi.fn(),
                addHandler: vi.fn(),
                removeHandler: vi.fn(),
            },
            drawer: { canvas: null },
            container: null,
            element: null,
        })),
        { Rect: vi.fn(), Point: vi.fn(), ControlAnchor: {} },
    ),
}));

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
// transitions call `element.animate()`; a no-op keeps them inert so the effects
// scheduled after them are observed deterministically.
beforeAll(() => {
    Element.prototype.animate = function () {
        return {
            onfinish: null,
            oncancel: null,
            cancel() {},
            finish() {},
            play() {},
            pause() {},
            addEventListener() {},
            removeEventListener() {},
            finished: Promise.resolve(),
            currentTime: 0,
            playState: 'finished',
        } as unknown as Animation;
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

    it('renders as a grid, not a strip, when expanded from a horizontal dock', async () => {
        await mountViewer({ dockPosition: 'bottom', expanded: true });

        const track = target.querySelector('.gallery-track');
        expect(track?.classList.contains('track-vertical')).toBe(true);
        expect(track?.classList.contains('track-horizontal')).toBe(false);
        // Expanded cells use the gallery's own size knob (default 160), not the
        // 75px strip height.
        expect(track?.getAttribute('style')).toContain('minmax(160px');
    });

    it('honors the thumbnailSize config in the expanded grid', async () => {
        await mountViewer({
            dockPosition: 'bottom',
            expanded: true,
            thumbnailSize: 240,
        });

        const track = target.querySelector('.gallery-track');
        expect(track?.getAttribute('style')).toContain('minmax(240px');
    });

    it('points the caret along the direction of travel', async () => {
        const props = await mountViewer({ dockPosition: 'bottom' });

        // Collapsed at the bottom: the gallery grows upward, and the caret rides
        // the edge facing the canvas.
        expect(roots()[0].classList.contains('caret-top')).toBe(true);

        props.viewerState?.setGalleryExpanded(true);
        await settle();

        // Expanded: it shrinks back down, so the caret moves to the dock edge.
        expect(roots()[0].classList.contains('caret-bottom')).toBe(true);
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
