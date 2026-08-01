// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewer,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const state = useViewer(viewer);

// Commands: correct — read at the moment the user clicks.
const zoomIn = (): void => state.value?.zoomIn();
const search = (query: string): void => void state.value?.search(query);
