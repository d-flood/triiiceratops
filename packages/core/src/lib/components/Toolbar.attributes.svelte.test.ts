import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ToolbarTestHost from './ToolbarTestHost.svelte';
import { icons } from '../generated/icons';
import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import type { ViewerConfig } from '../types/config';

/**
 * The toolbar's accessibility attribute matrix, asserted button by button.
 *
 * Every action carries five things a reader depends on and no visual test would
 * catch if they drifted: the hover tooltip (`data-tip`), the accessible name
 * (`aria-label` — often NOT the same string), the pressed state, the
 * `menu-active` styling that must agree with it, and the tooltip placement class
 * that points the bubble away from the viewer's edge. `data-panel-toggle` is a
 * sixth: it is how a closing panel finds the toggle to hand focus back to, so a
 * missing one silently drops focus to `<body>`.
 *
 * The matrix is asserted as one ordered list, so DOM order — which is the visual
 * order of the rail — is pinned along with it.
 */

let manifestCounter = 0;
let mounted: ReturnType<typeof mount> | null = null;
const loadedManifests: string[] = [];

function makeCanvas(manifestId: string, index: number) {
    const id = `${manifestId}/canvas/${index}`;
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label: `Page ${index}`,
        height: 1000,
        width: 800,
        images: [
            {
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
                on: id,
                resource: {
                    '@id': `${id}/image`,
                    '@type': 'dctypes:Image',
                    service: {
                        '@id': `http://example.org/iiif/${index}`,
                        profile: 'http://iiif.io/api/image/2/level1.json',
                    },
                },
            },
        ],
    };
}

/**
 * A manifest that makes every gated toolbar button visible at once: a
 * non-sequence range for the table of contents, and two sequences for the
 * sequence picker.
 */
function makeManifest() {
    const manifestId = `http://example.org/manifest/toolbar-${++manifestCounter}`;
    return {
        manifestId,
        json: {
            '@context': 'http://iiif.io/api/presentation/2/context.json',
            '@id': manifestId,
            '@type': 'sc:Manifest',
            label: 'Toolbar fixture',
            structures: [
                {
                    '@id': `${manifestId}/range/chapter-1`,
                    '@type': 'sc:Range',
                    label: 'Chapter 1',
                    canvases: [`${manifestId}/canvas/1`],
                },
            ],
            sequences: [
                {
                    '@id': `${manifestId}/sequence/1`,
                    '@type': 'sc:Sequence',
                    canvases: [
                        makeCanvas(manifestId, 1),
                        makeCanvas(manifestId, 2),
                    ],
                },
                {
                    '@id': `${manifestId}/sequence/2`,
                    '@type': 'sc:Sequence',
                    canvases: [makeCanvas(manifestId, 3)],
                },
            ],
        },
    };
}

async function mountToolbar(config: ViewerConfig = {}) {
    const { manifestId, json } = makeManifest();
    const viewerState = new ViewerState();
    await viewerState.setManifestData(manifestId, json);
    loadedManifests.push(manifestId);
    viewerState.config = config;
    // The collection button's only gate is a loaded collection, which is a
    // viewer fact rather than a manifest one.
    viewerState.collectionId = `${manifestId}/collection`;
    viewerState.collectionItems = [
        { id: manifestId, type: 'Manifest', label: 'Toolbar fixture' },
    ];
    // ...and the annotations button's only gate is a non-empty annotation list
    // for the current canvas.
    viewerState.setUserAnnotations(manifestId, viewerState.canvasId!, [
        {
            id: `${manifestId}/anno/1`,
            body: { type: 'TextualBody', value: 'A note' },
        },
    ]);
    viewerState.toolbarOpen = true;

    mounted = mount(ToolbarTestHost, {
        target: document.body,
        props: { viewerState },
    });
    flushSync();

    return viewerState;
}

/**
 * The glyph a button renders, by reverse lookup of the generated icon markup —
 * so the expectations below can name the icon instead of quoting SVG paths.
 */
function glyphName(button: Element): string | null {
    // Matched on the path data rather than the whole glyph, because the DOM
    // serializes the rendered `<path>` as `></path>` where the generated markup
    // closes it with `/>`.
    const d = button.querySelector('svg path')?.getAttribute('d');
    if (!d) return null;
    const hit = Object.entries(icons.regular).find(([, markup]) =>
        markup.includes(`d="${d}"`),
    );
    return hit?.[0] ?? 'unknown';
}

/** The core action buttons of the toolbar's own list, in DOM order. */
function actionButtons() {
    return [
        ...document.querySelectorAll<HTMLButtonElement>(
            '.actions > li > button:not([data-plugin-toggle])',
        ),
    ];
}

function matrix() {
    return actionButtons().map((button) => ({
        glyph: glyphName(button),
        tip: button.getAttribute('data-tip'),
        label: button.getAttribute('aria-label'),
        pressed: button.getAttribute('aria-pressed'),
        active: button.classList.contains('menu-active'),
        indicator: button.classList.contains('indicator'),
        placement:
            [...button.classList].find((name) => name.startsWith('place-')) ??
            null,
        panelToggle: button.getAttribute('data-panel-toggle'),
        haspopup: button.getAttribute('aria-haspopup'),
        menu: button.getAttribute('aria-controls'),
        expanded: button.getAttribute('aria-expanded'),
        // How the window-level pointer handler recognises a click on a flyout's
        // own toggle, so it dismisses rather than reopens.
        flyoutToggle: button.hasAttribute('data-flyout-toggle'),
    }));
}

type ButtonRow = ReturnType<typeof matrix>[number];

/**
 * One expected row. Everything a button does NOT carry is defaulted, so each
 * expectation below spells out only the attributes that button is responsible
 * for; the default toolbar sits on the left, hence `place-right`.
 */
function row(fields: Partial<ButtonRow>): ButtonRow {
    return {
        glyph: null,
        tip: null,
        label: null,
        pressed: null,
        active: false,
        indicator: false,
        placement: 'place-right',
        panelToggle: null,
        haspopup: null,
        menu: null,
        expanded: null,
        flyoutToggle: false,
        ...fields,
    };
}

/** The items of a built-in flyout menu, in DOM order. */
function menuItems(flyoutId: string) {
    return [
        ...document.querySelectorAll<HTMLButtonElement>(
            `#${flyoutId} > li > button`,
        ),
    ].map((item) => ({
        role: item.getAttribute('role'),
        text: item.querySelector('span')?.textContent,
        glyph: glyphName(item),
        checked: item.getAttribute('aria-checked'),
        active: item.classList.contains('menu-active'),
        // The trailing check mark, which is the visual half of `aria-checked`.
        check: item.querySelectorAll('svg').length === 2,
    }));
}

describe('Toolbar attribute matrix', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        for (const manifestId of loadedManifests.splice(0)) {
            manifestsState.clearManifest(manifestId);
        }
        document.body.innerHTML = '';
    });

    it('renders every action button with its own tip, name, pressed state and panel id', async () => {
        await mountToolbar();

        expect(matrix()).toEqual([
            row({ glyph: 'X', tip: 'Close Menu', label: 'Close Menu' }),
            row({
                glyph: 'Folder',
                tip: 'Collection',
                label: 'Toggle Collection',
                pressed: 'false',
                indicator: true,
                panelToggle: 'collection',
            }),
            row({
                glyph: 'MagnifyingGlass',
                tip: 'Search',
                label: 'Toggle Search',
                pressed: 'false',
                panelToggle: 'search',
            }),
            row({
                glyph: 'Slideshow',
                tip: 'Show Gallery',
                label: 'Show Gallery',
                pressed: 'false',
            }),
            row({
                glyph: 'ListBullets',
                tip: 'Table of Contents',
                label: 'Toggle Table of Contents',
                pressed: 'false',
                panelToggle: 'structures',
            }),
            row({
                glyph: 'File',
                tip: 'Viewing Mode',
                label: 'Viewing Mode',
                haspopup: 'menu',
                menu: 'tri-flyout-viewing-mode',
                expanded: 'false',
                flyoutToggle: true,
            }),
            row({
                glyph: 'Layout',
                tip: 'Gallery Placement',
                label: 'Gallery Placement',
                haspopup: 'menu',
                menu: 'tri-flyout-gallery-placement',
                expanded: 'false',
                flyoutToggle: true,
            }),
            row({
                glyph: 'Stack',
                tip: 'Sequence',
                label: 'Sequence',
                indicator: true,
                haspopup: 'menu',
                menu: 'tri-flyout-sequence-picker',
                expanded: 'false',
                flyoutToggle: true,
            }),
            row({
                glyph: 'CornersOut',
                tip: 'Enter Full Screen',
                label: 'Enter Full Screen',
                pressed: 'false',
            }),
            row({
                glyph: 'ChatCenteredText',
                tip: 'Show Annotations (1)',
                label: 'Show Annotations (1)',
                pressed: 'false',
                panelToggle: 'annotations',
            }),
            row({
                glyph: 'Info',
                tip: 'Information',
                label: 'Toggle Information',
                pressed: 'false',
                panelToggle: 'metadata',
            }),
        ]);
    });

    /**
     * Every toggle announces itself pressed and styles itself active from the
     * SAME state, and the three buttons whose label is a verb pair say what the
     * next activation will do — a gallery that is open offers to hide it.
     */
    it('flips label, glyph, pressed state and active styling together', async () => {
        const viewerState = await mountToolbar();

        viewerState.showCollectionPanel = true;
        viewerState.showSearchPanel = true;
        viewerState.showThumbnailGallery = true;
        viewerState.showStructuresPanel = true;
        viewerState.viewingMode = 'continuous';
        viewerState.isFullScreen = true;
        viewerState.showAnnotations = true;
        viewerState.showMetadataPanel = true;
        flushSync();

        expect(matrix()).toEqual([
            row({ glyph: 'X', tip: 'Close Menu', label: 'Close Menu' }),
            row({
                glyph: 'Folder',
                tip: 'Collection',
                label: 'Toggle Collection',
                pressed: 'true',
                active: true,
                indicator: true,
                panelToggle: 'collection',
            }),
            row({
                glyph: 'MagnifyingGlass',
                tip: 'Search',
                label: 'Toggle Search',
                pressed: 'true',
                active: true,
                panelToggle: 'search',
            }),
            row({
                glyph: 'Slideshow',
                tip: 'Hide Gallery',
                label: 'Hide Gallery',
                pressed: 'true',
                active: true,
            }),
            row({
                glyph: 'ListBullets',
                tip: 'Table of Contents',
                label: 'Toggle Table of Contents',
                pressed: 'true',
                active: true,
                panelToggle: 'structures',
            }),
            row({
                glyph: 'Scroll',
                tip: 'Viewing Mode',
                label: 'Viewing Mode',
                haspopup: 'menu',
                menu: 'tri-flyout-viewing-mode',
                expanded: 'false',
                flyoutToggle: true,
            }),
            row({
                glyph: 'Layout',
                tip: 'Gallery Placement',
                label: 'Gallery Placement',
                haspopup: 'menu',
                menu: 'tri-flyout-gallery-placement',
                expanded: 'false',
                flyoutToggle: true,
            }),
            row({
                glyph: 'Stack',
                tip: 'Sequence',
                label: 'Sequence',
                indicator: true,
                haspopup: 'menu',
                menu: 'tri-flyout-sequence-picker',
                expanded: 'false',
                flyoutToggle: true,
            }),
            row({
                glyph: 'CornersIn',
                tip: 'Exit Full Screen',
                label: 'Exit Full Screen',
                pressed: 'true',
                active: true,
            }),
            row({
                glyph: 'ChatCenteredText',
                tip: 'Hide Annotations (1)',
                label: 'Hide Annotations (1)',
                pressed: 'true',
                active: true,
                panelToggle: 'annotations',
            }),
            row({
                glyph: 'Info',
                tip: 'Information',
                label: 'Toggle Information',
                pressed: 'true',
                active: true,
                panelToggle: 'metadata',
            }),
        ]);
    });

    /**
     * A button's glyph, labels and handler sit in one descriptor row, paired by
     * position alone — so two rows with their handlers swapped render byte-identical
     * DOM and the matrix above still passes. Clicking each button and naming the one
     * command it may reach is what pins the pairing. The commands are stubbed: this
     * is about which one the button is wired to, not what it then does.
     */
    it('wires each action button to the one command its row names', async () => {
        const viewerState = await mountToolbar();

        const commands = [
            'toggleCollectionPanel',
            'toggleSearchPanel',
            'toggleThumbnailGallery',
            'toggleStructuresPanel',
            'toggleFullScreen',
            'toggleAnnotations',
            'toggleMetadataPanel',
        ] as const;
        const spies = commands.map((name) =>
            vi.spyOn(viewerState, name).mockImplementation(() => {}),
        );

        const wiring: Array<[string, (typeof commands)[number]]> = [
            ['Toggle Collection', 'toggleCollectionPanel'],
            ['Toggle Search', 'toggleSearchPanel'],
            ['Show Gallery', 'toggleThumbnailGallery'],
            ['Toggle Table of Contents', 'toggleStructuresPanel'],
            ['Enter Full Screen', 'toggleFullScreen'],
            ['Show Annotations (1)', 'toggleAnnotations'],
            ['Toggle Information', 'toggleMetadataPanel'],
        ];

        for (const [label, command] of wiring) {
            for (const spy of spies) spy.mockClear();

            const button = actionButtons().find(
                (candidate) => candidate.getAttribute('aria-label') === label,
            );
            expect(button, `no button labelled "${label}"`).toBeDefined();
            button!.click();
            flushSync();

            expect(
                commands.filter((_, i) => spies[i].mock.calls.length > 0),
                `clicking "${label}"`,
            ).toEqual([command]);
        }
    });

    /**
     * A claimant owns its canvas's annotation surface: `AnnotationPanel` and
     * `AnnotationOverlay` both filter by `annotatableCanvasIds`, so a claimed
     * canvas renders neither. The toolbar has to agree, or the button opens a
     * panel that is empty by construction — which is what a manifest carrying
     * timed annotations on a claimed AV canvas produces.
     */
    it('offers no annotations action on a canvas a plugin has claimed', async () => {
        const viewerState = await mountToolbar();

        expect(matrix().map((button) => button.label)).toContain(
            'Show Annotations (1)',
        );

        viewerState.ensurePluginUiState('av');
        viewerState.claimCanvas(viewerState.canvasId!, 'av');
        flushSync();

        expect(matrix().map((button) => button.label)).not.toContain(
            'Show Annotations (1)',
        );
        expect(
            matrix().some((button) => button.panelToggle === 'annotations'),
        ).toBe(false);
    });

    it('hides an action its config switched off, keeping the rest in order', async () => {
        await mountToolbar({
            toolbar: {
                showSearch: false,
                showGallery: false,
                showCollection: false,
                showAnnotations: false,
            },
        });

        expect(matrix().map((button) => button.label)).toEqual([
            'Close Menu',
            'Toggle Table of Contents',
            'Viewing Mode',
            'Sequence',
            'Enter Full Screen',
            'Toggle Information',
        ]);
    });

    /**
     * The tooltip has to open toward the canvas, or it paints off the viewer's
     * edge. One placement class serves every button, so it is asserted across
     * the whole rail rather than per button.
     */
    it('points every tooltip away from the toolbar edge', async () => {
        await mountToolbar({ toolbar: { side: 'right' } });
        expect(new Set(matrix().map((button) => button.placement))).toEqual(
            new Set(['place-left']),
        );

        await unmount(mounted!);
        mounted = null;
        document.body.innerHTML = '';

        await mountToolbar({ toolbar: { anchor: 'top' } });
        expect(new Set(matrix().map((button) => button.placement))).toEqual(
            new Set(['place-bottom']),
        );
    });

    /** A flyout toggle announces and styles its open state from the same source. */
    it('marks a built-in flyout toggle expanded and active while its menu is open', async () => {
        await mountToolbar();

        const toggle = actionButtons().find(
            (button) =>
                button.getAttribute('aria-controls') ===
                'tri-flyout-viewing-mode',
        )!;
        toggle.click();
        flushSync();

        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.classList.contains('menu-active')).toBe(true);
        expect(
            document
                .querySelector('#tri-flyout-viewing-mode')
                ?.classList.contains('open'),
        ).toBe(true);
    });

    it('renders one radio item per viewing mode, checked from the current mode', async () => {
        const viewerState = await mountToolbar();

        expect(menuItems('tri-flyout-viewing-mode')).toEqual([
            {
                role: 'menuitemradio',
                text: 'Individuals',
                glyph: 'File',
                checked: 'true',
                active: true,
                check: true,
            },
            {
                role: 'menuitemradio',
                text: 'Paged',
                glyph: 'BookOpen',
                checked: 'false',
                active: false,
                check: false,
            },
            {
                role: 'menuitemradio',
                text: 'Continuous',
                glyph: 'Scroll',
                checked: 'false',
                active: false,
                check: false,
            },
        ]);

        viewerState.setViewingMode('continuous');
        flushSync();

        expect(
            menuItems('tri-flyout-viewing-mode').map((item) => item.checked),
        ).toEqual(['false', 'false', 'true']);
    });

    /**
     * Shift-pairing belongs to the paged mode alone: it is a checkbox item, not
     * a fourth mode, and it is absent while no pairing exists to shift.
     */
    it('adds the shift-pairing checkbox only in paged mode', async () => {
        const viewerState = await mountToolbar();

        expect(menuItems('tri-flyout-viewing-mode')).toHaveLength(3);

        viewerState.setViewingMode('paged');
        flushSync();

        const items = menuItems('tri-flyout-viewing-mode');
        expect(items).toHaveLength(4);
        expect(items[1].checked).toBe('true');
        expect(items[3]).toEqual({
            role: 'menuitemcheckbox',
            text: 'Shift Page Pairing',
            glyph: 'ArrowsLeftRight',
            checked: 'true',
            active: true,
            check: true,
        });

        viewerState.togglePagedOffset();
        flushSync();

        expect(menuItems('tri-flyout-viewing-mode')[3]).toEqual({
            role: 'menuitemcheckbox',
            text: 'Shift Page Pairing',
            glyph: 'ArrowsLeftRight',
            checked: 'false',
            active: false,
            check: false,
        });
    });

    it('names every sequence in the sequence picker', async () => {
        const viewerState = await mountToolbar();

        expect(menuItems('tri-flyout-sequence-picker')).toEqual([
            {
                role: 'menuitemradio',
                text: 'Sequence 1',
                glyph: 'Stack',
                checked: 'true',
                active: true,
                check: true,
            },
            {
                role: 'menuitemradio',
                text: 'Sequence 2',
                glyph: 'Stack',
                checked: 'false',
                active: false,
                check: false,
            },
        ]);

        viewerState.setSequenceIndex(1);
        flushSync();

        expect(
            menuItems('tri-flyout-sequence-picker').map((item) => item.checked),
        ).toEqual(['false', 'true']);
    });

    /**
     * The gallery-placement picker is the accessible replacement for the deleted
     * drag-to-dock gesture, so its keyboard path is the feature, not a detail:
     * every assertion below is reachable with a keyboard alone, and every
     * activation is a `click` on a `<button>` — which is also what a touch tap
     * dispatches, the case the mouse-only drag never served.
     */
    describe('gallery placement picker', () => {
        /** Let the open-menu effect's `requestAnimationFrame` focus pass run. */
        async function frame() {
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
            });
            flushSync();
        }

        const toggle = () =>
            actionButtons().find(
                (button) =>
                    button.getAttribute('aria-controls') ===
                    'tri-flyout-gallery-placement',
            )!;

        const items = () => [
            ...document.querySelectorAll<HTMLButtonElement>(
                '#tri-flyout-gallery-placement > li > button',
            ),
        ];

        it('renders one radio item per dock side, checked from the current side', async () => {
            const viewerState = await mountToolbar();

            expect(menuItems('tri-flyout-gallery-placement')).toEqual([
                {
                    role: 'menuitemradio',
                    text: 'Top',
                    glyph: 'CaretUp',
                    checked: 'false',
                    active: false,
                    check: false,
                },
                {
                    role: 'menuitemradio',
                    text: 'Bottom',
                    glyph: 'CaretDown',
                    checked: 'true',
                    active: true,
                    check: true,
                },
                {
                    role: 'menuitemradio',
                    text: 'Left',
                    glyph: 'CaretLeft',
                    checked: 'false',
                    active: false,
                    check: false,
                },
                {
                    role: 'menuitemradio',
                    text: 'Right',
                    glyph: 'CaretRight',
                    checked: 'false',
                    active: false,
                    check: false,
                },
            ]);

            viewerState.setDockSide('left');
            flushSync();

            expect(
                menuItems('tri-flyout-gallery-placement').map(
                    (item) => item.checked,
                ),
            ).toEqual(['false', 'false', 'true', 'false']);
        });

        /**
         * The four items are paired to their sides by tuple position alone, so a
         * transposed pair renders identical DOM and the matrix above still passes.
         * Clicking each and naming the side it commits is what pins the pairing.
         */
        it('docks the gallery to the side each item names', async () => {
            const viewerState = await mountToolbar();
            const setDockSide = vi
                .spyOn(viewerState, 'setDockSide')
                .mockImplementation(() => {});

            for (const [index, side] of [
                'top',
                'bottom',
                'left',
                'right',
            ].entries()) {
                setDockSide.mockClear();
                items()[index].click();
                flushSync();
                expect(setDockSide.mock.calls).toEqual([[side]]);
            }
        });

        /** Placement belongs to the gallery, so it follows the gallery's gate. */
        it('is absent when the gallery is switched off', async () => {
            await mountToolbar({ toolbar: { showGallery: false } });

            expect(
                document.querySelector('#tri-flyout-gallery-placement'),
            ).toBeNull();
            expect(matrix().map((button) => button.label)).not.toContain(
                'Gallery Placement',
            );
        });

        it('moves focus into the menu on open and back to the toggle on Escape', async () => {
            await mountToolbar();

            toggle().focus();
            expect(document.activeElement).toBe(toggle());

            toggle().click();
            flushSync();
            await frame();

            expect(toggle().getAttribute('aria-expanded')).toBe('true');
            expect(document.activeElement).toBe(items()[0]);

            window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape' }),
            );
            flushSync();

            expect(toggle().getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(toggle());
        });

        it('roves focus through the four sides with the arrow and Home/End keys', async () => {
            await mountToolbar();

            toggle().click();
            flushSync();
            await frame();

            const menu = document.querySelector(
                '#tri-flyout-gallery-placement',
            )!;
            const press = (key: string) => {
                menu.dispatchEvent(
                    new KeyboardEvent('keydown', { key, bubbles: true }),
                );
                flushSync();
            };

            const at = () =>
                items().indexOf(document.activeElement as HTMLButtonElement);

            expect(at()).toBe(0);
            press('ArrowDown');
            expect(at()).toBe(1);
            press('ArrowUp');
            expect(at()).toBe(0);
            // Wraps, so the last item is one ArrowUp from the first.
            press('ArrowUp');
            expect(at()).toBe(3);
            press('ArrowDown');
            expect(at()).toBe(0);
            press('End');
            expect(at()).toBe(3);
            press('Home');
            expect(at()).toBe(0);
        });
    });

    /**
     * The separator exists to divide the viewer's own actions from the plugins',
     * so it appears only when both groups are on screen — and it is an
     * `<li role="separator">`, because a bare `<div>` child of the list trips
     * the axe "list" rule as soon as a plugin adds a button.
     */
    describe('plugin separator', () => {
        function registerPluginButton(viewerState: ViewerState) {
            viewerState.registerSdkChrome({
                id: 'demo',
                name: 'Demo',
                icon: { kind: 'svg', inner: '<circle />', viewBox: '0 0 1 1' },
                target: 'panel',
                dismiss: 'light',
                mount: () => () => {},
            });
            flushSync();
        }

        const divider = () => document.querySelector('.actions > li.divider');

        it('is absent with no plugin buttons registered', async () => {
            await mountToolbar();

            expect(divider()).toBeNull();
        });

        it('divides the two groups once a plugin registers a button', async () => {
            const viewerState = await mountToolbar();
            registerPluginButton(viewerState);

            const separator = divider();
            expect(separator?.getAttribute('role')).toBe('separator');
            expect(separator?.getAttribute('aria-hidden')).toBe('true');
            // Immediately before the plugin group, immediately after the core one.
            expect(
                separator?.previousElementSibling?.querySelector(
                    '[data-panel-toggle="metadata"]',
                ),
            ).not.toBeNull();
            expect(
                separator?.nextElementSibling?.querySelector(
                    '[data-plugin-toggle="demo"]',
                ),
            ).not.toBeNull();
        });

        /**
         * The sequence picker is not one of the configurable actions the
         * separator counts: with all of those switched off it is the only core
         * button left besides the collapse toggle, and no separator is drawn.
         */
        it('stays absent when only the sequence picker remains', async () => {
            const viewerState = await mountToolbar({
                toolbar: {
                    showSearch: false,
                    showGallery: false,
                    showFullscreen: false,
                    showAnnotations: false,
                    showInfo: false,
                    showViewingMode: false,
                    showStructures: false,
                    showCollection: false,
                },
            });
            registerPluginButton(viewerState);

            expect(matrix().map((button) => button.label)).toEqual([
                'Close Menu',
                'Sequence',
            ]);
            expect(divider()).toBeNull();
        });
    });
});
