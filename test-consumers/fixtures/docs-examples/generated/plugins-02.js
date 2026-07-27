// GENERATED from docs/plugins.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

customElements.whenDefined('triiiceratops-viewer').then(() => {
  const viewer = document.querySelector('triiiceratops-viewer');
  viewer.plugins = [ImageManipulationPlugin];
});
