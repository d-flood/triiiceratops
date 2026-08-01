// Framework-neutral fixture data shared by all three routes.
//
// Everything here is a hoisted module constant so the wrapper's edge-triggered
// property tier can be asserted by IDENTITY: `element.manifestJson` must be the
// very object below, never a stringified attribute.

function svgImage(fill) {
    return (
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
        "width='1600' height='1200' viewBox='0 0 1600 1200'%3E%3Crect " +
        "width='1600' height='1200' fill='%23" +
        fill +
        "'/%3E%3C/svg%3E"
    );
}

function canvas(id, fill) {
    return {
        id,
        type: 'Canvas',
        height: 1200,
        width: 1600,
        items: [
            {
                id: id + '/page',
                type: 'AnnotationPage',
                items: [
                    {
                        id: id + '/anno',
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: svgImage(fill),
                            type: 'Image',
                            format: 'image/svg+xml',
                            height: 1200,
                            width: 1600,
                        },
                        target: id,
                    },
                ],
            },
        ],
    };
}

/** Viewer 1's manifest, supplied through the PROPERTY tier (`manifestJson`). */
export const MANIFEST_ID = 'local://primary';
export const CANVAS_1 = 'primary/c1';
export const CANVAS_2 = 'primary/c2';
export const CANVAS_3 = 'primary/c3';
export const MANIFEST_JSON = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: MANIFEST_ID,
    type: 'Manifest',
    label: { en: ['Framework wrapper fixture'] },
    items: [
        canvas(CANVAS_1, '2563eb'),
        canvas(CANVAS_2, '16a34a'),
        canvas(CANVAS_3, 'dc2626'),
    ],
};

/**
 * Viewer 2 loads a DIFFERENT manifest over HTTP (`manifest-id` alone), which is
 * both the isolation proof and the only path that dispatches `manifestchange`
 * (`setManifestData`, viewer 1's path, deliberately does not).
 */
export const SECOND_MANIFEST_ID = '/manifest.json';
export const SECOND_CANVAS = 'canvas/p1';

/** Property tier: a plain config object, compared by identity. */
export const CONFIG = { showThumbnailGallery: false };

/**
 * Property tier, post-mount: a genuinely conflicting configuration. The viewer
 * reports `nav.edge: 'top'` against a top-anchored split toolbar through the
 * structured `viewererror` channel, which is how this fixture drives it.
 */
export const CONFLICT_CONFIG = {
    showThumbnailGallery: false,
    controls: 'split',
    toolbar: { anchor: 'top' },
    nav: { edge: 'top' },
};

/** Property tier: typed theme-token overrides. */
export const THEME_CONFIG = { cssVars: { '--tri-fixture-token': '#123456' } };

/** Property tier, FUNCTION-valued: it must arrive as a property, never as an
 * attribute, whether or not lazy registration has finished. */
export const searchProvider = async (query) => [
    {
        canvasIndex: 0,
        canvasLabel: 'Fixture result',
        hits: [{ type: 'hit', match: String(query) }],
    },
];

const ICON = {
    kind: 'svg',
    inner: '<circle cx="8" cy="8" r="6"></circle>',
    viewBox: '0 0 16 16',
};

/**
 * A hand-authored SDK plugin. The plugin SDK is deliberately NOT a dependency
 * of this fixture: `SdkPlugin` is a structural, framework-neutral seam owned by
 * core, so a consumer can hand core a plain object that satisfies it.
 *
 * `failures` makes `activate` throw that many times before succeeding, which is
 * how the fixture drives the `pluginerror` channel and proves the delivered
 * `PluginError.retry()` really re-activates.
 */
export function createFixturePlugin(name, failures = 0) {
    const stats = {
        activations: 0,
        mounts: 0,
        cleanups: 0,
        remaining: failures,
    };
    const plugin = {
        kind: 'triiiceratops-plugin',
        name,
        version: '1.0.0',
        uiId: name.replace(/[^A-Za-z0-9_-]+/g, '-'),
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: ICON,
        target: 'panel',
        view: {
            mount(container) {
                stats.mounts++;
                container.textContent = name;
                return () => {
                    container.textContent = '';
                };
            },
        },
        activate(host) {
            stats.activations++;
            if (stats.remaining > 0) {
                stats.remaining--;
                throw new Error('fixture plugin setup failure: ' + name);
            }
            const cleanup = plugin.view.mount(host.container, host);
            return {
                deactivate() {
                    stats.cleanups++;
                    cleanup();
                },
            };
        },
    };
    return { plugin, stats };
}

export const stable = createFixturePlugin('@fixture/stable-plugin', 0);
export const flaky = createFixturePlugin('@fixture/flaky-plugin', 1);

/** A NEW array every render, holding the SAME plugin objects: the realistic
 * hazard the wrapper's shallow equality and core's identity-keyed activation
 * diff must both absorb without restarting a running plugin. */
export function pluginList() {
    return [stable.plugin, flaky.plugin];
}

export function pluginStats() {
    return {
        stable: { ...stable.stats },
        flaky: { ...flaky.stats },
    };
}

/** Host attributes forwarded to the viewer-1 element (id, data-*, aria-*). */
export const HOST_ID_1 = 'viewer-1';
export const HOST_ID_2 = 'viewer-2';
