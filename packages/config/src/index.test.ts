import { beforeEach, describe, expect, it } from 'vitest';
import { parseContentState } from 'triiiceratops';

import {
    buildShareUrl,
    clearStoredConfig,
    clonePlain,
    collectPaths,
    CONFIG_STORAGE_KEY,
    createSparseTracker,
    diffSparse,
    mergeSparse,
    readStoredConfig,
    resolveInitialConfig,
    resolveInitialView,
    serializeContentState,
    writeStoredConfig,
} from './index';

const MANIFEST = 'https://example.org/iiif/book1/manifest';
const CANVAS = 'https://example.org/iiif/book1/canvas/p2';

/**
 * A faithful subset of the demo's `defaultConfig`: fully populated, nested, and
 * deliberately carrying no `viewingMode`. That is a key the manifest answers for
 * itself.
 */
const defaults = {
    showToggle: true,
    toolbarOpen: true,
    showCanvasNav: true,
    transparentBackground: false,
    leftPanelWidth: '320px',
    toolbar: { showSearch: true, showGallery: true, showViewingMode: true },
    gallery: { open: false, showCloseButton: true, dockPosition: 'bottom' },
    search: { open: false, showCloseButton: true, query: '' },
    information: { open: false, position: 'right' },
};

function search(params: Record<string, string>): string {
    return new URLSearchParams(params).toString();
}

beforeEach(() => {
    sessionStorage.clear();
});

describe('sparse algebra', () => {
    it('merges plain objects and replaces everything else', () => {
        expect(
            mergeSparse(
                { a: { b: 1, c: 2 }, d: [1, 2] },
                { a: { c: 3 }, d: [9] },
            ),
        ).toEqual({ a: { b: 1, c: 3 }, d: [9] });
    });

    it('diffs only the leaf paths that changed', () => {
        expect(
            diffSparse(
                { showToggle: true, gallery: { open: true, dock: 'bottom' } },
                { showToggle: true, gallery: { open: false, dock: 'bottom' } },
            ),
        ).toEqual({ gallery: { open: true } });
    });

    it('collects leaf paths', () => {
        expect(collectPaths({ a: 1, b: { c: 2 } })).toEqual([
            ['a'],
            ['b', 'c'],
        ]);
    });
});

describe('serializeContentState', () => {
    it('returns null with no manifest', () => {
        expect(serializeContentState({ manifestId: '' })).toBeNull();
    });

    it('emits a bare manifest URI when no canvas is known', () => {
        expect(serializeContentState({ manifestId: MANIFEST })).toBe(MANIFEST);
    });

    it('absolutizes a root-relative manifest id so the bare URI parses', () => {
        // The playground's own sample manifests ship at root-relative paths, and
        // `parseContentState` only accepts an absolute http(s) URI.
        const state = serializeContentState(
            { manifestId: '/demo/demo-manifests/book.json' },
            'https://example.org/demo/index.html',
        )!;

        expect(parseContentState(state)).toEqual({
            manifestId: 'https://example.org/demo/demo-manifests/book.json',
        });
    });

    it('absolutizes a relative canvas id inside the Annotation', () => {
        const state = serializeContentState(
            {
                manifestId: '/demo/demo-manifests/book.json',
                canvasId: 'canvas/p2',
            },
            'https://example.org/demo/index.html',
        )!;

        expect(parseContentState(state)).toEqual({
            manifestId: 'https://example.org/demo/demo-manifests/book.json',
            canvasId: 'https://example.org/demo/canvas/p2',
        });
    });

    it('drops an existing fragment before appending the shared region', () => {
        // `parseIiifXywh` matches the first `xywh=`, so a fragment already on
        // the canvas id would win over the region being shared.
        const state = serializeContentState({
            manifestId: MANIFEST,
            canvasId: `${CANVAS}#xywh=1,2,3,4`,
            region: { x: 10, y: 20, width: 300, height: 400 },
        })!;

        expect(parseContentState(state)).toMatchObject({
            canvasId: CANVAS,
            region: { x: 10, y: 20, width: 300, height: 400 },
        });
    });
});

describe('sharing round-trips through parseContentState', () => {
    it('round-trips a manifest-only view as a bare URI', () => {
        const url = buildShareUrl({
            pathname: '/demo/',
            mode: 'image',
            target: { manifestId: MANIFEST },
            config: {},
        });

        const shared = new URLSearchParams(url.split('?')[1]);
        expect(shared.get('iiif-content')).toBe(MANIFEST);
        expect(parseContentState(shared.get('iiif-content')!)).toEqual({
            manifestId: MANIFEST,
        });
    });

    it('round-trips a canvas and region as an Annotation', () => {
        const url = buildShareUrl({
            pathname: '/demo/',
            mode: 'image',
            target: {
                manifestId: MANIFEST,
                canvasId: CANVAS,
                region: { x: 10, y: 20, width: 300, height: 400 },
            },
            config: {},
        });

        const parsed = parseContentState(
            new URLSearchParams(url.split('?')[1]).get('iiif-content')!,
        );

        expect(parsed).toMatchObject({
            manifestId: MANIFEST,
            canvasId: CANVAS,
            region: { x: 10, y: 20, width: 300, height: 400 },
        });
    });

    it('keeps configuration out of iiif-content and in its own parameter', () => {
        const url = buildShareUrl({
            pathname: '/demo/',
            mode: 'image',
            target: { manifestId: MANIFEST, canvasId: CANVAS },
            config: { gallery: { open: true } },
        });

        const shared = new URLSearchParams(url.split('?')[1]);
        const contentState = shared.get('iiif-content')!;

        expect(shared.get('config')).toBe('{"gallery":{"open":true}}');
        // What the parser reads back is the view and nothing else: no
        // configuration reaches the IIIF payload.
        expect(parseContentState(contentState)).toEqual({
            manifestId: MANIFEST,
            canvasId: CANVAS,
        });
    });

    it('preserves the viewer mode', () => {
        const url = buildShareUrl({
            pathname: '/demo/',
            mode: 'custom-theme',
            target: { manifestId: MANIFEST },
            config: {},
        });

        expect(new URLSearchParams(url.split('?')[1]).get('mode')).toBe(
            'custom-theme',
        );
    });

    it('omits the config parameter when the user set nothing', () => {
        const url = buildShareUrl({
            pathname: '/demo/',
            mode: 'svelte',
            target: { manifestId: MANIFEST },
            config: {},
        });

        expect(new URLSearchParams(url.split('?')[1]).has('config')).toBe(
            false,
        );
    });
});

describe('stored configuration never masks a manifest default', () => {
    it('keeps a viewer-reported viewing mode out of the stored overlay', () => {
        const tracker = createSparseTracker(defaults, {
            gallery: { open: true },
        });
        const config = clonePlain(defaults) as Record<string, unknown>;

        // The viewer reporting the manifest's advertised behavior back to the
        // playground is not a user choice.
        tracker.applyViewerValue(config, ['viewingMode'], 'paged');
        const stored = tracker.record(config);

        /*
         * Absence is the assertion. A stored `viewingMode` of any value would be
         * handed to the viewer on the next load and win over whatever the next
         * manifest advertises, so the only correct overlay is one in which the
         * key does not exist at all.
         */
        expect('viewingMode' in stored).toBe(false);
        expect(config.viewingMode).toBe('paged');
    });

    it("keeps a viewer-reported canvas out of the stored overlay so a manifest's start canvas wins", () => {
        const tracker = createSparseTracker(defaults);
        const config = clonePlain(defaults) as Record<string, unknown>;

        tracker.applyViewerValue(config, ['canvasId'], CANVAS);

        // Nothing the playground would hand the viewer names a canvas, so the
        // manifest's own `start` stays the only answer available.
        expect('canvasId' in tracker.record(config)).toBe(false);

        const resolved = resolveInitialConfig({ search: '', defaults });
        expect('canvasId' in resolved.config).toBe(false);
        expect(resolveInitialView(search({ mode: 'image' })).canvasId).toBe('');
    });

    it("stores the user's value even after the viewer reports its own", () => {
        const tracker = createSparseTracker(defaults);
        const config = clonePlain(defaults) as Record<string, unknown>;

        config.viewingMode = 'paged';
        expect(tracker.record(config)).toEqual({ viewingMode: 'paged' });

        // Loading a manifest that advertises continuous viewing moves the live
        // configuration, but the overlay records intent, not the current value.
        tracker.applyViewerValue(config, ['viewingMode'], 'continuous');

        expect(tracker.record(config)).toEqual({ viewingMode: 'paged' });
    });

    it('records only a preset’s own deltas, not the materialized config it assigns', () => {
        const tracker = createSparseTracker(defaults);

        // A preset reassigns the configuration wholesale from the defaults, so
        // every key it does not change must stay out of the overlay.
        const config = {
            ...(clonePlain(defaults) as Record<string, unknown>),
            toolbarOpen: false,
            gallery: {
                open: true,
                showCloseButton: true,
                dockPosition: 'left',
            },
        };

        expect(tracker.record(config)).toEqual({
            toolbarOpen: false,
            gallery: { open: true, dockPosition: 'left' },
        });
    });

    it('clears the overlay on reset', () => {
        const tracker = createSparseTracker(defaults, { toolbarOpen: false });
        tracker.reset();

        expect(
            tracker.record(clonePlain(defaults) as Record<string, unknown>),
        ).toEqual({});
    });
});

describe('per-tab persistence', () => {
    it('restores stored configuration on reload', () => {
        writeStoredConfig({ toolbarOpen: false });

        const { config, sparse } = resolveInitialConfig({
            search: '',
            defaults,
        });

        expect(sparse).toEqual({ toolbarOpen: false });
        expect(config.toolbarOpen).toBe(false);
        expect(config.showToggle).toBe(true);
    });

    it('resolves to bare defaults in a fresh session', () => {
        const { config, sparse } = resolveInitialConfig({
            search: '',
            defaults,
        });

        expect(sparse).toEqual({});
        expect(config).toEqual(defaults);
    });

    it('prefers a shared config parameter over stored configuration', () => {
        writeStoredConfig({ toolbarOpen: false });

        const { config } = resolveInitialConfig({
            search: search({ config: '{"showToggle":false}' }),
            defaults,
        });

        expect(config.showToggle).toBe(false);
        expect(config.toolbarOpen).toBe(true);
    });

    it('degrades a corrupt stored value to an empty overlay', () => {
        sessionStorage.setItem(CONFIG_STORAGE_KEY, '{not json');

        expect(readStoredConfig()).toEqual({});
        expect(resolveInitialConfig({ search: '', defaults }).config).toEqual(
            defaults,
        );
    });

    it('removes the stored key when nothing is user-set', () => {
        writeStoredConfig({ toolbarOpen: false });
        writeStoredConfig({});

        expect(sessionStorage.getItem(CONFIG_STORAGE_KEY)).toBeNull();
    });
});

describe('escapes from stored configuration', () => {
    it('clears stored configuration on reset', () => {
        writeStoredConfig({ toolbarOpen: false });
        clearStoredConfig();

        expect(sessionStorage.getItem(CONFIG_STORAGE_KEY)).toBeNull();
        expect(resolveInitialConfig({ search: '', defaults }).config).toEqual(
            defaults,
        );
    });

    it('loads defaults with clean-config and leaves storage intact', () => {
        writeStoredConfig({ toolbarOpen: false });

        const { config, sparse } = resolveInitialConfig({
            search: search({ 'clean-config': '' }),
            defaults,
        });

        expect(sparse).toEqual({});
        expect(config).toEqual(defaults);
        expect(readStoredConfig()).toEqual({ toolbarOpen: false });
    });

    it('lets clean-config win over a shared config parameter', () => {
        const { config, clean } = resolveInitialConfig({
            search: search({
                'clean-config': '',
                config: '{"showToggle":false}',
            }),
            defaults,
        });

        expect(clean).toBe(true);
        expect(config).toEqual(defaults);
    });

    it('treats an empty config parameter as absent', () => {
        writeStoredConfig({ toolbarOpen: false });

        const { config, clean } = resolveInitialConfig({
            search: search({ config: '' }),
            defaults,
        });

        // An empty `config=` must not act as a second clean-defaults switch.
        expect(clean).toBe(false);
        expect(config.toolbarOpen).toBe(false);
    });
});

describe('legacy view parameters', () => {
    it('resolves ?manifest= and ?canvas=', () => {
        expect(
            resolveInitialView(search({ manifest: MANIFEST, canvas: CANVAS })),
        ).toEqual({ manifestUrl: MANIFEST, canvasId: CANVAS, region: null });
    });

    it('lets ?manifest= win over iiif-content', () => {
        const other = 'https://example.org/iiif/book2/manifest';

        expect(
            resolveInitialView(
                search({ manifest: MANIFEST, 'iiif-content': other }),
            ).manifestUrl,
        ).toBe(MANIFEST);
    });

    it('consults iiif-content only when no manifest is given', () => {
        const contentState = serializeContentState({
            manifestId: MANIFEST,
            canvasId: CANVAS,
        })!;

        expect(
            resolveInitialView(search({ 'iiif-content': contentState })),
        ).toEqual({
            manifestUrl: MANIFEST,
            canvasId: CANVAS,
            region: null,
        });
    });
});
