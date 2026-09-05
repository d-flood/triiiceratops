<script setup>
// The client-contract route, written the way the Vue guide documents it:
// single-file components, `useTemplateRef` as the handle, `provideViewer` for
// the deep tree, kebab-cased emits, and `<KeepAlive>`.
//
// Note what is NOT here: no `svelte`, no Svelte Vite plugin, no plugin SDK, and
// no `compilerOptions` of any kind in the project — the raw custom-element tag
// never reaches Vue's template compiler, because `<TriiiceratopsViewer>` is a
// Vue component.
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    provideViewer,
    useViewerSelector,
} from 'triiiceratops/vue';

import * as F from './fixtures.js';
import { onFrameworkEvent } from './events.js';
import {
    configRef,
    live,
    selectCanvasId,
    selectZoomThousandths,
    store,
} from './store.js';
import Boundary from './Boundary.vue';
import DeepLabel from './DeepLabel.vue';
import FragileReadout from './FragileReadout.vue';
import GatedReadout from './GatedReadout.vue';
import KitReadout from './KitReadout.vue';
import ViewerTwo from './ViewerTwo.vue';

const viewer1 = useTemplateRef('viewer1');
live.viewer1 = viewer1;
// Publish this viewer to the subtree. A component's own `provide()` is not
// visible to its own `inject()`, so the composables below still take `viewer1`
// explicitly; only the descendants resolve it by injection.
provideViewer(viewer1);

const canvasId = useViewerSelector(viewer1, selectCanvasId);
const toolbar = useViewerSelector(viewer1, (state) =>
    state.toolbarOpen ? 'open' : 'closed',
);
// `frame` cadence: per-frame viewport values are woken by the renderer's own
// animation events, not by the batched state watcher.
const zoom = useViewerSelector(viewer1, selectZoomThousandths, {
    cadence: 'frame',
});
// The SAME projection at the default `state` cadence, as the contrast.
const zoomAtStateCadence = useViewerSelector(viewer1, selectZoomThousandths);
// A projection that reads a changing VUE REACTIVE DEPENDENCY. It is tracked
// automatically: no manual watcher, and no re-created composable.
const dynamic = useViewerSelector(
    viewer1,
    (state) => store.dynamicSeed + ':' + (state.canvasId ?? 'none'),
);
</script>

<template>
    <main>
        <span hidden data-testid="render-tick">{{ store.renderTick }}</span>
        <div v-if="store.viewer1Mounted" id="viewer-1-host">
            <KeepAlive>
                <TriiiceratopsViewer
                    v-if="store.keepAliveActive"
                    ref="viewer1"
                    :id="F.HOST_ID_1"
                    :manifest-id="F.MANIFEST_ID"
                    :canvas-id="store.canvasProp"
                    :theme="store.theme"
                    :manifest-json="F.MANIFEST_JSON"
                    :config="configRef"
                    :theme-config="F.THEME_CONFIG"
                    :search-provider="F.searchProvider"
                    :plugins="F.pluginList()"
                    class="fixture-viewer"
                    style="display: block; width: 320px; height: 240px"
                    data-fixture="primary"
                    aria-label="Primary fixture viewer"
                    @state-change="
                        (d) => onFrameworkEvent(F.HOST_ID_1, 'statechange', d)
                    "
                    @canvas-change="
                        (d) => onFrameworkEvent(F.HOST_ID_1, 'canvaschange', d)
                    "
                    @manifest-change="
                        (d) =>
                            onFrameworkEvent(F.HOST_ID_1, 'manifestchange', d)
                    "
                    @choice-change="
                        (d) => onFrameworkEvent(F.HOST_ID_1, 'choicechange', d)
                    "
                    @plugin-error="
                        (d) => onFrameworkEvent(F.HOST_ID_1, 'pluginerror', d)
                    "
                    @viewer-error="
                        (d) => onFrameworkEvent(F.HOST_ID_1, 'viewererror', d)
                    "
                />
            </KeepAlive>
        </div>
        <span data-testid="v1-canvas">{{ canvasId ?? 'none' }}</span>
        <span data-testid="v1-toolbar">{{ toolbar ?? 'none' }}</span>
        <span data-testid="v1-zoom">{{ zoom ?? -1 }}</span>
        <span data-testid="v1-zoom-state">{{ zoomAtStateCadence ?? -1 }}</span>
        <span data-testid="v1-dynamic">{{ dynamic ?? 'none' }}</span>
        <DeepLabel />
        <Boundary :key="store.fragileKey">
            <FragileReadout />
        </Boundary>
        <GatedReadout />
        <ViewerTwo />
        <KitReadout />
    </main>
</template>
