// GENERATED from docs/migration-1.0.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
// AFTER (1.0):
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const pdfExportPlugin = createPdfExportPlugin({ coverSheet: { fields: [] } });
viewer.plugins = [ImageManipulationPlugin, pdfExportPlugin];
