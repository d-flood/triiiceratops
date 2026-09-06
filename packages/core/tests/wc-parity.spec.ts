import { test, expect, type Page } from '@playwright/test';

/**
 * Web Component ESM/IIFE parity.
 *
 * Two fixture pages (public/e2e/wc-iife.html and public/e2e/wc-esm.html) load
 * the two built Web Component entries — the self-contained IIFE and the
 * standards-based ESM registration entry. Both must register the same tag and
 * expose identical documented behavior: the same browser-runtime descriptor, the
 * same element properties, a rendered manifest, and the same cross-shadow
 * viewer change events (e.g. `manifestchange`). Requires `pnpm build:element`
 * (or build:all) to have produced dist/ first.
 */

interface RuntimeShape {
    coreVersion: string;
    pluginApiVersion: string;
    capabilities: string[];
    hasRegistry: boolean;
}

interface ElementProps {
    entry: string | undefined;
    manifestId: unknown;
    theme: unknown;
}

/**
 * The custom element's state bridge and its property-only `searchProvider`
 * input, observed through the BUILT element rather than a native Svelte
 * component.
 */
interface StateBridge {
    availabilityEvents: Array<{
        targetIsHost: boolean;
        detailIsProperty: boolean;
        bubbles: boolean;
        composed: boolean;
    }>;
    getterOnlyOnPrototype: boolean;
    noOwnProperty: boolean;
    searchCalls: Array<{ query: string; manifestId: string }>;
    searchResultCount: number;
    searchProviderAttribute: string | null;
}

async function drive(
    page: Page,
    path: string,
    expectedEntry: string,
): Promise<{
    runtime: RuntimeShape;
    props: ElementProps;
    bridge: StateBridge;
}> {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(path, { waitUntil: 'domcontentloaded' });

    // The entry registered the custom element.
    await page.waitForFunction(
        () => !!customElements.get('triiiceratops-viewer'),
        undefined,
        { timeout: 20000 },
    );

    // The window.Triiiceratops namespace is bootstrapped and core-filled.
    const runtime = await page.evaluate((): RuntimeShape | null => {
        const t = (window as unknown as { Triiiceratops?: any }).Triiiceratops;
        if (!t) return null;
        return {
            coreVersion: t.coreVersion,
            pluginApiVersion: t.pluginApiVersion,
            capabilities: [...t.capabilities],
            hasRegistry: typeof t.plugins?.register === 'function',
        };
    });
    expect(runtime, 'window.Triiiceratops should exist').not.toBeNull();
    expect(runtime!.coreVersion).not.toBe('');
    expect(runtime!.pluginApiVersion).not.toBe('');
    // Present and enumerable, NOT non-empty: core's 1.0 line declares no
    // capabilities at all. The one that ever existed named a bundled
    // third-party major and was retired with no successor, so what the runtime
    // has to keep promising is that the list exists and can be read — the
    // parity assertion below (`esm` equals `iife`) is what this really guards.
    expect(Array.isArray(runtime!.capabilities)).toBe(true);
    expect(runtime!.hasRegistry).toBe(true);

    // Documented element properties are readable off the custom element.
    const props = await page.evaluate((): ElementProps => {
        const el = document.getElementById('v') as unknown as {
            manifestId: unknown;
            theme: unknown;
        };
        return {
            entry: (window as unknown as { __wcEntry?: string }).__wcEntry,
            manifestId: el.manifestId,
            theme: el.theme,
        };
    });
    expect(props.entry).toBe(expectedEntry);
    expect(props.manifestId).toBe('/demo-manifests/e2e/manifest.json');
    expect(props.theme).toBe('dark');

    // Renders a manifest: the renderer's canvas appears inside the (open) shadow root.
    const canvas = page.locator('triiiceratops-viewer canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20000 });

    // A documented viewer change event crosses the (composed) shadow boundary.
    await page.waitForFunction(
        () =>
            ((window as unknown as { __statechangeCount?: number })
                .__statechangeCount ?? 0) > 0,
        undefined,
        { timeout: 20000 },
    );

    // The state bridge announced the element's own ViewerState.
    await page.waitForFunction(
        () =>
            ((window as unknown as { __viewerStateEvents?: unknown[] })
                .__viewerStateEvents?.length ?? 0) > 0,
        undefined,
        { timeout: 20000 },
    );

    const bridge = await page.evaluate(async (): Promise<StateBridge> => {
        const el = document.getElementById('v') as unknown as {
            viewerState: any;
            getAttribute(name: string): string | null;
        };
        const ctor = customElements.get('triiiceratops-viewer')!;
        const descriptor = Object.getOwnPropertyDescriptor(
            ctor.prototype,
            'viewerState',
        );
        const w = window as unknown as {
            __viewerStateEvents: StateBridge['availabilityEvents'];
            __searchCalls: StateBridge['searchCalls'];
        };
        // Drive the real search path through the property-assigned provider.
        await el.viewerState.search('parity');
        return {
            availabilityEvents: w.__viewerStateEvents,
            getterOnlyOnPrototype:
                typeof descriptor?.get === 'function' &&
                descriptor?.set === undefined,
            noOwnProperty:
                Object.getOwnPropertyDescriptor(el, 'viewerState') ===
                undefined,
            searchCalls: w.__searchCalls,
            searchResultCount: el.viewerState.searchResults.length,
            searchProviderAttribute: el.getAttribute('searchprovider'),
        };
    });

    // Exactly one availability event for the one mounted state instance, and
    // the detail is the very object the getter returns.
    expect(bridge.availabilityEvents).toEqual([
        {
            targetIsHost: true,
            detailIsProperty: true,
            bubbles: true,
            composed: true,
        },
    ]);
    // Getter-only, on the prototype — the wrappers' version handshake.
    expect(bridge.getterOnlyOnPrototype).toBe(true);
    expect(bridge.noOwnProperty).toBe(true);
    // The provider assigned as a property (never as an attribute) ran.
    expect(bridge.searchCalls).toHaveLength(1);
    expect(bridge.searchCalls[0].query).toBe('parity');
    expect(bridge.searchCalls[0].manifestId).toBeTruthy();
    expect(bridge.searchResultCount).toBe(1);
    expect(bridge.searchProviderAttribute).toBeNull();

    expect(pageErrors, 'no uncaught page errors').toEqual([]);

    return { runtime: runtime!, props, bridge };
}

test.describe('Web Component ESM/IIFE parity', () => {
    test('both entries register the same tag and expose identical documented behavior', async ({
        page,
    }) => {
        const iife = await drive(page, '/e2e/wc-iife.html', 'iife');
        const esm = await drive(page, '/e2e/wc-esm.html', 'esm');

        // Identical browser-runtime descriptor across entries.
        expect(esm.runtime.coreVersion).toBe(iife.runtime.coreVersion);
        expect(esm.runtime.pluginApiVersion).toBe(
            iife.runtime.pluginApiVersion,
        );
        expect(esm.runtime.capabilities).toEqual(iife.runtime.capabilities);

        // Identical documented element properties across entries.
        expect(esm.props.manifestId).toBe(iife.props.manifestId);
        expect(esm.props.theme).toBe(iife.props.theme);

        // Identical state bridge across entries, including for the ESM fixture
        // where `searchProvider` was assigned before the tag was even defined.
        expect(esm.bridge.availabilityEvents).toEqual(
            iife.bridge.availabilityEvents,
        );
        expect(esm.bridge.searchCalls).toEqual(iife.bridge.searchCalls);
    });
});

/*
 * The other half of parity, and the half no source-loaded test can reach: what
 * the MINIFIER did to each artifact.
 *
 * `CanvasHost.svelte`'s refit effect names its dependency as a read of
 * `renderer.paintedGeometry`, and the overlay/paint render sites name theirs as
 * a read of a revision counter. Both are expression statements whose value is
 * discarded, so a minifier told that property reads are pure deletes them — and
 * the effect goes on compiling, registering and never running again for that
 * dependency, in the shipped file only. `pure_getters` is off for that reason
 * (`src/packaging/terserElement.ts`), and the ESM artifact additionally gets
 * `module: true`, which turns on cross-statement compression the IIFE does not
 * have. That extra licence applies to ONE of the two artifacts, so the two must
 * be shown to survive it separately rather than by tag-and-property parity,
 * which stays green through both deletions.
 *
 * The manifest is the companion shape `av-audio.spec.ts` drives, minus the
 * plugin: a claimed canvas whose accompanying canvas has a different rect, so
 * that the phase arriving after the world is laid out is a geometry change the
 * viewer must refit for. Core's claim and companion-phase commands are the
 * generic contract AV happens to use, and reaching them straight through
 * `el.viewerState` keeps this on core's own artifacts.
 */

/** A solid rectangle as a data URL, so painted pixels are cheap to find. */
function solidImage(width: number, height: number, fill: string): string {
    return (
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' ` +
        `width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'` +
        `%3E%3Crect width='${width}' height='${height}' fill='%23${fill}'/%3E%3C/svg%3E`
    );
}

const COMPANION_MANIFEST_URL = '/demo-manifests/e2e/wc-companion.json';
const COMPANION_CANVAS = `${COMPANION_MANIFEST_URL}/canvas/recording`;

/** A companion Canvas painting one solid image, as `av-audio.spec.ts` builds one. */
function companionCanvas(
    id: string,
    width: number,
    height: number,
    fill: string,
) {
    return {
        id,
        type: 'Canvas',
        width,
        height,
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${id}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: solidImage(width, height, fill),
                            type: 'Image',
                            format: 'image/svg+xml',
                            width,
                            height,
                        },
                        target: id,
                    },
                ],
            },
        ],
    };
}

/*
 * A duration-only canvas carrying a 4:1 accompanying canvas — the audio shape,
 * with no plugin and no media. Duration-only is what makes the geometry LATE:
 * the canvas declares no rect of its own, so until a claimant asks for the
 * companion there is nothing to lay it out from, and the rect that finally
 * arrives is the companion's. The sound body is never fetched by core; it is
 * here so the canvas is the unsupported one a claimant takes over, exactly as
 * a real recording is.
 */
const COMPANION_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: COMPANION_MANIFEST_URL,
    type: 'Manifest',
    label: { en: ['Late companion geometry'] },
    items: [
        {
            id: COMPANION_CANVAS,
            type: 'Canvas',
            duration: 2,
            accompanyingCanvas: companionCanvas(
                `${COMPANION_CANVAS}/score`,
                400,
                100,
                '2563eb',
            ),
            items: [
                {
                    id: `${COMPANION_CANVAS}/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${COMPANION_CANVAS}/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: '/media/tone.mp3',
                                type: 'Sound',
                                format: 'audio/mpeg',
                                duration: 2,
                            },
                            target: COMPANION_CANVAS,
                        },
                    ],
                },
            ],
        },
    ],
};

/** The painted content's box on the render surface, in fractions of the surface. */
interface PaintedBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
    found: boolean;
}

/**
 * Where the blue accompanying canvas is on the surface, measured from the
 * surface's own pixels.
 *
 * Pixels rather than a DOM box because core paints the companion into its
 * rendering surface — there is no element around it to measure, and the whole
 * point is what the renderer drew. `getImageData` over the 2D surface is the
 * same instrument `canvas-renderer-tiles.spec.ts` and the paint-hook spec use.
 */
async function bluePaintedBox(page: Page): Promise<PaintedBox> {
    return page
        .locator('[data-testid="canvas-renderer-surface"]')
        .evaluate((element) => {
            const surface = element as HTMLCanvasElement;
            const context = surface.getContext('2d');
            if (!context) throw new Error('no 2D context on the surface');
            const { width, height } = surface;
            const { data } = context.getImageData(0, 0, width, height);
            let left = width;
            let right = -1;
            let top = height;
            let bottom = -1;
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const i = (y * width + x) * 4;
                    // Blue-dominant and opaque: the companion, not the red
                    // canvas it replaced and not the viewer's ground.
                    if (
                        data[i + 3] > 200 &&
                        data[i + 2] > 120 &&
                        data[i + 2] > data[i] + 60 &&
                        data[i + 2] > data[i + 1] + 60
                    ) {
                        if (x < left) left = x;
                        if (x > right) right = x;
                        if (y < top) top = y;
                        if (y > bottom) bottom = y;
                    }
                }
            }
            if (right < 0) {
                return {
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    found: false,
                };
            }
            return {
                left: left / width,
                right: (right + 1) / width,
                top: top / height,
                bottom: (bottom + 1) / height,
                found: true,
            };
        });
}

/**
 * Load one built entry, let it settle on the red portrait canvas, then claim
 * the canvas and ask for its companion — the late geometry change.
 */
async function refitOnLateCompanion(
    page: Page,
    entry: 'esm' | 'iife',
): Promise<PaintedBox> {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.route(`**${COMPANION_MANIFEST_URL}`, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(COMPANION_MANIFEST),
        }),
    );
    await page.goto(
        `/e2e/wc-companion.html?entry=${entry}` +
            `&manifest=${encodeURIComponent(COMPANION_MANIFEST_URL)}`,
        { waitUntil: 'domcontentloaded' },
    );

    const surface = page.locator('[data-testid="canvas-renderer-surface"]');
    await expect(surface).toBeVisible({ timeout: 30_000 });
    // Settled on the world it opened with — no companion, so no blue — before
    // anything is asked of it.
    await expect
        .poll(async () => (await bluePaintedBox(page)).found, {
            timeout: 20_000,
        })
        .toBe(false);

    await page.evaluate((canvasId) => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                ensurePluginUiState(pluginId: string): void;
                claimCanvas(canvasId: string, pluginId: string): () => void;
                setCompanionPhase(
                    canvasId: string,
                    pluginId: string,
                    phase: string,
                ): void;
            };
        };
        const plugin = 'e2e:companion';
        host.viewerState.ensurePluginUiState(plugin);
        host.viewerState.claimCanvas(canvasId, plugin);
        host.viewerState.setCompanionPhase(canvasId, plugin, 'accompanying');
    }, COMPANION_CANVAS);

    // The companion is painted at all.
    await expect
        .poll(async () => (await bluePaintedBox(page)).found, {
            timeout: 20_000,
        })
        .toBe(true);

    // …and the opening fit animates, so settle before measuring where.
    let box = await bluePaintedBox(page);
    await expect
        .poll(
            async () => {
                const next = await bluePaintedBox(page);
                const settled =
                    Math.abs(next.left - box.left) < 0.002 &&
                    Math.abs(next.right - box.right) < 0.002;
                box = next;
                return settled;
            },
            { timeout: 20_000 },
        )
        .toBe(true);

    expect(pageErrors, 'no uncaught page errors').toEqual([]);
    return box;
}

test.describe('Web Component ESM/IIFE parity', () => {
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'Reads the Canvas2D render surface; the renderer slice is Chromium-only.',
    );

    for (const entry of ['esm', 'iife'] as const) {
        test(`refits for companion geometry that arrives late (${entry})`, async ({
            page,
        }) => {
            const box = await refitOnLateCompanion(page, entry);

            // A 4:1 companion in a 3:2 surface fits to the full width and
            // sits centred. Without the refit the view keeps the scale and
            // centre it held for a canvas that had no rect at all, and the
            // companion is framed against the surface's top-left instead —
            // which is the shipped-artifact framing bug this guard exists
            // for.
            expect(box.right - box.left).toBeGreaterThan(0.9);
            const centreX = (box.left + box.right) / 2;
            const centreY = (box.top + box.bottom) / 2;
            expect(Math.abs(centreX - 0.5)).toBeLessThan(0.05);
            expect(Math.abs(centreY - 0.5)).toBeLessThan(0.05);
        });
    }
});

/**
 * What the state bridge promises a plugin or framework wrapper, observed on the
 * shipped artifacts with TWO viewers on one page (ADRs 0007, 0008, 0011).
 *
 * The source-compiled state suite already pins batching, isolation and teardown.
 * It cannot see a minifier that rewrites the reactive watcher those semantics are
 * built out of, and a single-viewer fixture cannot see two states sharing a page
 * at all — which is what a plugin author actually ships against.
 */
interface TwoViewerReport {
    distinctStates: boolean;
    readsCurrentBeforeDelivery: { toolbarOpen: boolean; delivered: number };
    afterBatch: {
        first: number;
        second: number;
        argumentCounts: number[];
        secondToolbarOpen: boolean;
    };
    afterNoOpCommand: { first: number; second: number };
    afterRemovingFirst: { first: number; second: number };
}

async function twoViewers(
    page: Page,
    entry: 'esm' | 'iife',
): Promise<TwoViewerReport> {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`/e2e/wc-two-viewers.html?entry=${entry}`, {
        waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#a canvas').first()).toBeVisible({
        timeout: 20000,
    });
    await expect(page.locator('#b canvas').first()).toBeVisible({
        timeout: 20000,
    });

    const report = await page.evaluate(async (): Promise<TwoViewerReport> => {
        // Notifications are delivered on the flush after the change; two
        // animation frames is well past it and costs nothing when it is not.
        const settle = () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => setTimeout(resolve, 0)),
                ),
            );

        const first = document.getElementById('a') as unknown as {
            viewerState: any;
            remove(): void;
        };
        const second = document.getElementById('b') as unknown as {
            viewerState: any;
        };

        // Held rather than re-read: the element's getter stops answering once
        // the component is destroyed, and the teardown step below is precisely
        // about the state object a plugin is still holding by then.
        const firstState = first.viewerState;
        const secondState = second.viewerState;

        const firstCalls: number[] = [];
        const secondCalls: number[] = [];
        firstState.subscribe((...args: unknown[]) =>
            firstCalls.push(args.length),
        );
        secondState.subscribe((...args: unknown[]) =>
            secondCalls.push(args.length),
        );

        // Two inventoried members change in one tick.
        firstState.toggleToolbar();
        firstState.toggleMetadataPanel();
        const readsCurrentBeforeDelivery = {
            toolbarOpen: firstState.toolbarOpen,
            delivered: firstCalls.length,
        };
        await settle();
        const afterBatch = {
            first: firstCalls.length,
            second: secondCalls.length,
            argumentCounts: [...firstCalls],
            secondToolbarOpen: secondState.toolbarOpen,
        };

        // A command that lands on the state it already held is not a change.
        firstState.setHoveredAnnotationId(null);
        await settle();
        const afterNoOpCommand = {
            first: firstCalls.length,
            second: secondCalls.length,
        };

        // Unmounting one viewer must not disturb the other's delivery, and must
        // stop the unmounted one's own.
        first.remove();
        await settle();
        firstState.toggleToolbar();
        secondState.toggleToolbar();
        await settle();
        const afterRemovingFirst = {
            first: firstCalls.length,
            second: secondCalls.length,
        };

        return {
            distinctStates: firstState !== secondState,
            readsCurrentBeforeDelivery,
            afterBatch,
            afterNoOpCommand,
            afterRemovingFirst,
        };
    });

    expect(pageErrors, 'no uncaught page errors').toEqual([]);
    return report;
}

test.describe('Web Component ESM/IIFE parity', () => {
    for (const entry of ['esm', 'iife'] as const) {
        test(`keeps two viewers' state, notifications and teardown independent (${entry})`, async ({
            page,
        }) => {
            const report = await twoViewers(page, entry);

            // Each element owns its own ViewerState.
            expect(report.distinctStates).toBe(true);

            // Reads are synchronously current; delivery is not synchronous.
            expect(report.readsCurrentBeforeDelivery).toEqual({
                toolbarOpen: true,
                delivered: 0,
            });

            // Two changes in one tick collapse into one payload-free call, and
            // the other viewer hears nothing and moves nothing.
            expect(report.afterBatch.first).toBe(1);
            expect(report.afterBatch.argumentCounts).toEqual([0]);
            expect(report.afterBatch.second).toBe(0);
            expect(report.afterBatch.secondToolbarOpen).toBe(false);

            // A command resulting in identical state notifies nobody.
            expect(report.afterNoOpCommand).toEqual({ first: 1, second: 0 });

            // The removed viewer's listener stops; the surviving viewer's own
            // change is still delivered, exactly once.
            expect(report.afterRemovingFirst).toEqual({ first: 1, second: 1 });
        });
    }
});
