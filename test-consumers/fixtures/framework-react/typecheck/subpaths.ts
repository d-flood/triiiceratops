/**
 * The other two Svelte-free subpaths a React consumer reaches for:
 * `triiiceratops/selectors` (the framework-neutral runtime) and
 * `triiiceratops/testing` (the headless test kit). Same rules as `react.tsx` —
 * no Svelte installed, `skipLibCheck: false`, `types: []` — so a Svelte type in
 * either declaration graph fails this fixture's build.
 *
 * Together with the Vue fixture's `typecheck/`, all four subpaths named by the
 * promise (`./react`, `./vue`, `./selectors`, `./testing`) are covered.
 */

import {
    createSelectorRuntime,
    type SelectorCadence,
    type SelectorProjection,
    type SelectorProjectionOptions,
    type SelectorRuntime,
    type SelectorRuntimeOptions,
} from 'triiiceratops/selectors';
import {
    createHeadlessViewerState,
    createTestViewerHandle,
    ViewerState,
    type HeadlessViewerFixtures,
    type ReadonlyViewerState,
    type TestViewerHandle,
    type ViewerHandle,
    type ViewerStateSnapshot,
} from 'triiiceratops/testing';

const fixtures: HeadlessViewerFixtures = {
    activeLocale: 'en',
    config: { debug: false },
};

/** A real headless state, and a real runtime over it. */
export function driveHeadlessViewer(): string | null {
    const state: ViewerState = createHeadlessViewerState(fixtures);

    const options: SelectorRuntimeOptions = {};
    const runtime: SelectorRuntime = createSelectorRuntime(state, options);

    const cadence: SelectorCadence = 'state';
    const projectionOptions: SelectorProjectionOptions<string | null> = {
        cadence,
        equals: (a, b) => a === b,
    };
    const canvasId: SelectorProjection<string | null> =
        runtime.createProjection(
            (viewer: ReadonlyViewerState) => viewer.canvasId,
            projectionOptions,
        );

    const stop = canvasId.subscribe(() => {});
    const selected = canvasId.read();
    void canvasId.recompute();
    void canvasId.version;
    stop();
    runtime.dispose();
    return selected;
}

/** The test kit's handle: the same two-member shape the wrappers publish. */
export function driveTestHandle(): ViewerStateSnapshot {
    const handle: TestViewerHandle = createTestViewerHandle({ fixtures });
    const asViewerHandle: ViewerHandle = handle;
    void asViewerHandle.element;

    handle.state.setCanvas('local://canvas/1');
    const snapshot: ViewerStateSnapshot = handle.state.getSnapshot();
    handle.dispose();
    return snapshot;
}
