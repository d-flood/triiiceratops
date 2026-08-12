/**
 * **Overlay layers**: a DOM container a plugin registers, placed in the viewer's
 * stage beside the renderer, which the plugin renders into and owns.
 *
 * These claims can only be made in a browser:
 *
 * - **The container is in the stage, and its origin is `canvasToScreen`'s.** A
 *   child positioned straight from a projected point is measured against the
 *   surface and compared with the coordinate model's prediction, within a pixel —
 *   the same gate every other geometric claim in this suite goes through. A
 *   container placed against the wrong ancestor lands somewhere else.
 * - **The same DOM node before and after a manifest change.** The highest-risk
 *   fact in the spec: a manifest change unmounts and remounts the renderer, and
 *   the render site is deliberately OUTSIDE the gate that does it. Grouping the
 *   layers with the renderer instead would look tidier, keep every unit test
 *   green, and destroy every plugin's DOM on each manifest change.
 * - **Registering a second layer does not re-associate the first.** The same
 *   guarantee through the other mechanism: unkeyed, node reuse is positional, and
 *   the mount host remounts when its node is recreated.
 * - **Pointer events pass through, and children opt in.** A drag in the empty
 *   space of a layer still pans the image; a click on a `pointer-events: auto`
 *   child reaches that child.
 * - **Unregistering the plugin really removes the DOM.** The ownership backstop
 *   for a plugin whose own teardown misses its dispose: the container goes and the
 *   layer's cleanup runs, once, whichever order the two paths arrive in.
 *
 * Reached through `el.viewerState` on the custom element — the real public
 * surface. Deliberately NOT the renderer's `__triiiceratopsRenderer` test handle
 * that the paint-hook spec uses: that handle lives on the renderer's surface
 * canvas and is destroyed by a manifest change, which is the very event these
 * tests must survive.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    findFeature,
    getView,
    GRID_FEATURES,
    predictScreenPoint,
    TILED_MANIFEST,
} from './helpers/numberedGrid';

const FIXTURE = '/e2e/canvas-renderer-wc.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const WRAPPER = '.plugin-overlay-layer';
const LAYER_ID = 'e2e:markers';
const SECOND_LAYER_ID = 'e2e:second';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer specs are Chromium-only.',
);

/** What the page-side harness records about one layer's mount lifecycle. */
interface LayerReport {
    /** How many times the mount thunk ran. More than one is a remount. */
    mounts: number;
    /** Whether the node handed to the LAST mount is the one handed to the first. */
    sameNode: boolean;
    /** How many times the layer's own mount cleanup ran. */
    cleanups: number;
    /** How many pointer events the opted-in child received. */
    childClicks: number;
}

/**
 * Open the fixture and wait until the grid is genuinely painted.
 *
 * The shadow-DOM fixture rather than the demo app: it loads the custom element
 * from source through the dev server, so `el.viewerState` is reachable with no
 * build step.
 */
async function openFixture(page: Page): Promise<void> {
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    await expect
        .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
        .not.toBeNull();
}

/**
 * Register an overlay layer whose only child is a marker positioned from
 * `canvasToScreen`.
 *
 * The marker does no coordinate maths of its own beyond the projection — that is
 * the point. If the container's origin is not `canvasToScreen`'s origin, this
 * lands in the wrong place.
 */
async function registerMarkerLayer(
    page: Page,
    spec: { id: string; at: { x: number; y: number } },
): Promise<void> {
    await page.evaluate((layer: { id: string; at: typeof spec.at }) => {
        interface Harness {
            dispose: Record<string, () => void>;
            report: Record<string, LayerHarnessReport>;
        }
        interface LayerHarnessReport {
            mounts: number;
            firstNode: HTMLElement | null;
            lastNode: HTMLElement | null;
            childClicks: number;
            cleanups: number;
        }

        const host = document.getElementById('v') as unknown as {
            viewerState: {
                ensurePluginUiState(pluginId: string): void;
                registerOverlayLayer(input: {
                    id: string;
                    mount: (container: HTMLElement) => () => void;
                }): () => void;
                unregisterPlugin(pluginId: string): void;
                canvasToScreen(point: {
                    x: number;
                    y: number;
                }): { x: number; y: number } | null;
                subscribeFrame(listener: () => void): () => void;
            };
        };
        const state = host.viewerState;
        if (!state) throw new Error('the element exposed no viewerState');

        // A layer id must name a plugin the viewer knows. A real plugin's
        // activation seeds this before its `view.mount` runs, so this harness
        // stands in for that — and it is what makes `unregisterPlugin('e2e')`
        // below able to release the layer.
        state.ensurePluginUiState(layer.id.split(':')[0]);

        const harness = ((
            window as unknown as { __overlayHarness?: Harness }
        ).__overlayHarness ??= { dispose: {}, report: {} });
        const report = (harness.report[layer.id] ??= {
            mounts: 0,
            firstNode: null,
            lastNode: null,
            childClicks: 0,
            cleanups: 0,
        });

        harness.dispose[layer.id] = state.registerOverlayLayer({
            id: layer.id,
            mount: (container: HTMLElement) => {
                report.mounts += 1;
                report.firstNode ??= container;
                report.lastNode = container;
                container.dataset.testLayer = layer.id;

                const marker = document.createElement('button');
                marker.type = 'button';
                marker.dataset.testMarker = layer.id;
                marker.textContent = 'marker';
                // 24px square centred on the projected point, and opted IN to
                // pointer events — the documented pattern.
                marker.style.cssText = [
                    'position:absolute',
                    'pointer-events:auto',
                    'width:24px',
                    'height:24px',
                    'margin:-12px 0 0 -12px',
                    'padding:0',
                    'border:0',
                    'background:magenta',
                ].join(';');
                marker.addEventListener('click', () => {
                    report.childClicks += 1;
                });
                container.append(marker);

                const place = () => {
                    const point = state.canvasToScreen(layer.at);
                    marker.hidden = point === null;
                    if (point) {
                        marker.style.left = `${point.x}px`;
                        marker.style.top = `${point.y}px`;
                    }
                };

                place();
                const stop = state.subscribeFrame(place);

                return () => {
                    report.cleanups += 1;
                    stop();
                    marker.remove();
                };
            },
        });
    }, spec);
}

async function readReport(page: Page, id: string): Promise<LayerReport> {
    return page.evaluate((layerId: string) => {
        const harness = (
            window as unknown as {
                __overlayHarness?: {
                    report: Record<
                        string,
                        {
                            mounts: number;
                            firstNode: HTMLElement | null;
                            lastNode: HTMLElement | null;
                            childClicks: number;
                            cleanups: number;
                        }
                    >;
                };
            }
        ).__overlayHarness;
        const report = harness?.report[layerId];
        if (!report) throw new Error(`no harness report for "${layerId}"`);
        return {
            mounts: report.mounts,
            sameNode: report.firstNode === report.lastNode,
            childClicks: report.childClicks,
            cleanups: report.cleanups,
        };
    }, id);
}

async function disposeLayer(page: Page, id: string): Promise<void> {
    await page.evaluate((layerId: string) => {
        (
            window as unknown as {
                __overlayHarness?: { dispose: Record<string, () => void> };
            }
        ).__overlayHarness?.dispose[layerId]?.();
    }, id);
}

test('a layer’s container is in the stage, and a child positioned from canvasToScreen lands where the model says', async ({
    page,
}) => {
    await openFixture(page);

    const at = { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y };
    await registerMarkerLayer(page, { id: LAYER_ID, at });

    // The wrapper is in the stage, and it is a SIBLING of the renderer root
    // rather than a child of it: the renderer root is `role="application"`, whose
    // subtree suppresses browse mode and would hide a plugin's labels.
    const placement = await page.evaluate(() => {
        const wrapper = document
            .getElementById('v')!
            .shadowRoot!.querySelector('.plugin-overlay-layer');
        if (!wrapper) return null;
        return {
            parentIsStage:
                wrapper.parentElement?.classList.contains('viewer-area'),
            insideRendererRoot: !!wrapper.closest('.renderer-root'),
            afterRenderer: !!wrapper.parentElement?.querySelector(
                '.renderer-root ~ .plugin-overlay-layer',
            ),
            pointerEvents: getComputedStyle(wrapper).pointerEvents,
        };
    });
    expect(placement, 'no overlay layer container was placed').not.toBeNull();
    expect(placement!.parentIsStage).toBe(true);
    expect(placement!.insideRendererRoot).toBe(false);
    expect(placement!.afterRenderer).toBe(true);
    // Transparent by default, so adding a layer cannot cost the reader panning.
    expect(placement!.pointerEvents).toBe('none');

    // The geometric gate: the marker's centre against the coordinate model's
    // prediction, both in surface-local CSS pixels.
    const view = await getView(page);
    const expected = predictScreenPoint(at, view);
    const surfaceBox = (await page.locator(SURFACE).boundingBox())!;
    const markerBox = (await page
        .locator(`[data-test-marker="${LAYER_ID}"]`)
        .boundingBox())!;
    const actual = {
        x: markerBox.x + markerBox.width / 2 - surfaceBox.x,
        y: markerBox.y + markerBox.height / 2 - surfaceBox.y,
    };

    expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
});

test('the container is the same DOM node across a manifest change', async ({
    page,
}) => {
    await openFixture(page);
    await registerMarkerLayer(page, {
        id: LAYER_ID,
        at: { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y },
    });
    expect((await readReport(page, LAYER_ID)).mounts).toBe(1);

    // A manifest change, which is what remounts the renderer. The layer's render
    // site sits outside the gate that does it, so nothing here should touch the
    // container.
    await page.evaluate((manifest: string) => {
        document.getElementById('v')!.setAttribute('manifest-id', manifest);
    }, TILED_MANIFEST);

    // Wait for the NEW manifest to be genuinely painted — the renderer really
    // did go away and come back, rather than the assertion racing the change.
    await expect
        .poll(() => findFeature(page, 'bravo'), { timeout: 30_000 })
        .not.toBeNull();

    const report = await readReport(page, LAYER_ID);
    expect(
        report.mounts,
        'the mount thunk ran again — the node was recreated',
    ).toBe(1);
    expect(report.sameNode).toBe(true);
    await expect(page.locator(`[data-test-marker="${LAYER_ID}"]`)).toHaveCount(
        1,
    );
});

test('registering a second layer does not re-associate the first with a different node', async ({
    page,
}) => {
    await openFixture(page);
    await registerMarkerLayer(page, {
        id: LAYER_ID,
        at: { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y },
    });
    await registerMarkerLayer(page, {
        id: SECOND_LAYER_ID,
        at: { x: GRID_FEATURES.alpha.x, y: GRID_FEATURES.alpha.y },
    });
    await expect(page.locator(WRAPPER)).toHaveCount(2);

    expect((await readReport(page, LAYER_ID)).mounts).toBe(1);

    // And disposing the FIRST must not hand the survivor a different node, which
    // is what positional reuse in an unkeyed `{#each}` would do.
    await disposeLayer(page, LAYER_ID);
    await expect(page.locator(WRAPPER)).toHaveCount(1);

    const survivor = await readReport(page, SECOND_LAYER_ID);
    expect(survivor.mounts).toBe(1);
    expect(survivor.sameNode).toBe(true);
});

test('dispose removes the container, and the plugin’s cleanup ran', async ({
    page,
}) => {
    await openFixture(page);
    await registerMarkerLayer(page, {
        id: LAYER_ID,
        at: { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y },
    });
    await expect(page.locator(WRAPPER)).toHaveCount(1);

    await disposeLayer(page, LAYER_ID);

    await expect(page.locator(WRAPPER)).toHaveCount(0);
    await expect(page.locator(`[data-test-marker="${LAYER_ID}"]`)).toHaveCount(
        0,
    );

    expect((await readReport(page, LAYER_ID)).cleanups).toBe(1);

    // Idempotent: a plugin releasing from both its own cleanup and a teardown
    // path must not throw.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await disposeLayer(page, LAYER_ID);
    expect(pageErrors).toEqual([]);
    // And the cleanup did not run a second time.
    expect((await readReport(page, LAYER_ID)).cleanups).toBe(1);
});

test('unregistering the plugin removes the container and runs the layer’s cleanup', async ({
    page,
}) => {
    await openFixture(page);
    await registerMarkerLayer(page, {
        id: LAYER_ID,
        at: { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y },
    });
    await expect(page.locator(WRAPPER)).toHaveCount(1);

    // The backstop, in a real tree: a plugin whose teardown never calls its
    // dispose must not leave DOM on the image. `e2e` is the plugin id the layer's
    // own id names, which is what makes this attributable at all.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.evaluate(() => {
        (
            document.getElementById('v') as unknown as {
                viewerState: { unregisterPlugin(pluginId: string): void };
            }
        ).viewerState.unregisterPlugin('e2e');
    });

    await expect(page.locator(WRAPPER)).toHaveCount(0);
    await expect(page.locator(`[data-test-marker="${LAYER_ID}"]`)).toHaveCount(
        0,
    );
    // Removing the container alone would take the marker with it, so the marker's
    // absence proves nothing on its own: the cleanup COUNT is the claim.
    expect((await readReport(page, LAYER_ID)).cleanups).toBe(1);

    // And the plugin's own dispose arriving late is a no-op, not a second
    // teardown.
    await disposeLayer(page, LAYER_ID);
    expect(pageErrors).toEqual([]);
});

test('a drag in a layer’s empty space still pans the image', async ({
    page,
}) => {
    await openFixture(page);

    // The marker sits on `bravo`, the canvas centre, so it projects near the
    // middle of the surface and the drag below can pick a point comfortably clear
    // of it that is still inside the surface.
    await registerMarkerLayer(page, {
        id: LAYER_ID,
        at: { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y },
    });

    const box = (await page.locator(SURFACE).boundingBox())!;
    // A quarter of the way in from the top-left: over the layer (it spans the
    // whole surface) and nowhere near the 24px marker at the centre.
    const empty = { x: box.x + box.width / 4, y: box.y + box.height / 4 };

    const before = await getView(page);
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x - 50, empty.y);
    const during = await getView(page);
    await page.mouse.up();

    // The layer covers the whole surface, so this drag went THROUGH it — which is
    // what `pointer-events: none` on the container buys the reader.
    expect(during.centre.x).toBeCloseTo(before.centre.x + 50 / before.scale, 5);
});

test('a pointer event on a child that opted in reaches that child', async ({
    page,
}) => {
    await openFixture(page);
    await registerMarkerLayer(page, {
        id: LAYER_ID,
        at: { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y },
    });

    // Deliberately no pan first: a released drag carries momentum for several
    // frames, so the marker would still be travelling and the click would land on
    // empty layer space next to it. The claim here is about hit-testing, not
    // about timing.
    const before = await getView(page);
    const markerBox = (await page
        .locator(`[data-test-marker="${LAYER_ID}"]`)
        .boundingBox())!;
    // `mouse.click` at the measured centre rather than `locator.click`: the marker
    // is re-placed on every frame, so Playwright's actionability check can see a
    // moving target and wait for a stability that never arrives.
    await page.mouse.click(
        markerBox.x + markerBox.width / 2,
        markerBox.y + markerBox.height / 2,
    );

    expect((await readReport(page, LAYER_ID)).childClicks).toBe(1);

    // And the renderer did not also treat it as a gesture: events on layer
    // content never traverse the renderer's own root.
    const after = await getView(page);
    expect(after.centre.x).toBeCloseTo(before.centre.x, 5);
    expect(after.centre.y).toBeCloseTo(before.centre.y, 5);
});
