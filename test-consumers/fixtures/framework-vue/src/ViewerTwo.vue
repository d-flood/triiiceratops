<script setup>
// The second viewer: same page, same shared custom-element registration, and
// completely separate viewer state, selectors, commands, emits, and handle.
import { useTemplateRef } from 'vue';
import { TriiiceratopsViewer, useViewerSelector } from 'triiiceratops/vue';

import * as F from './fixtures.js';
import { onFrameworkEvent } from './events.js';
import { live, selectCanvasId } from './store.js';

const viewer2 = useTemplateRef('viewer2');
live.viewer2 = viewer2;

const canvasId = useViewerSelector(viewer2, selectCanvasId);
const toolbar = useViewerSelector(viewer2, (state) =>
    state.toolbarOpen ? 'open' : 'closed',
);
</script>

<template>
    <section>
        <div id="viewer-2-host">
            <TriiiceratopsViewer
                ref="viewer2"
                :id="F.HOST_ID_2"
                :manifest-id="F.SECOND_MANIFEST_ID"
                :config="F.CONFIG"
                theme="dark"
                style="display: block; width: 160px; height: 120px"
                @state-change="
                    (d) => onFrameworkEvent(F.HOST_ID_2, 'statechange', d)
                "
                @canvas-change="
                    (d) => onFrameworkEvent(F.HOST_ID_2, 'canvaschange', d)
                "
                @manifest-change="
                    (d) => onFrameworkEvent(F.HOST_ID_2, 'manifestchange', d)
                "
                @choice-change="
                    (d) => onFrameworkEvent(F.HOST_ID_2, 'choicechange', d)
                "
                @plugin-error="
                    (d) => onFrameworkEvent(F.HOST_ID_2, 'pluginerror', d)
                "
                @viewer-error="
                    (d) => onFrameworkEvent(F.HOST_ID_2, 'viewererror', d)
                "
            />
        </div>
        <span data-testid="v2-canvas">{{ canvasId ?? 'none' }}</span>
        <span data-testid="v2-toolbar">{{ toolbar ?? 'none' }}</span>
    </section>
</template>
