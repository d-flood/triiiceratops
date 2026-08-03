// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { ref } from 'vue';
import {
    TriiiceratopsViewer,
    type ViewerStateSnapshot,
} from 'triiiceratops/vue';

const initialCanvasId = 'https://example.org/canvas/1';
const currentCanvasId = ref(initialCanvasId);

function onCanvasChange(snapshot: ViewerStateSnapshot): void {
    if (snapshot.canvasId) currentCanvasId.value = snapshot.canvasId;
}
