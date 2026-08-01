// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer, type SdkPlugin } from 'triiiceratops/vue';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

// Created once, outside any reactive re-evaluation.
const plugins: readonly SdkPlugin[] = [
    ImageManipulationPlugin,
    createPdfExportPlugin(),
];
