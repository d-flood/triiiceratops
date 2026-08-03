// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useTemplateRef } from 'vue';
import {
    provideViewer,
    TriiiceratopsViewer,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';
import CanvasLabel from './CanvasLabel.vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
provideViewer(viewer);
