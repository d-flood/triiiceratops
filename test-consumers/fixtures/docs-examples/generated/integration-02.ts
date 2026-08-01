// GENERATED from docs/integration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer, type SdkPlugin } from 'triiiceratops/vue';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

const plugins: readonly SdkPlugin[] = [ImageManipulationPlugin];
const config = { toolbar: { side: 'right' as const } };
