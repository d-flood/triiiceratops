// GENERATED from apps/site/content/docs/plugins.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { ImageDownloadPlugin } from '@triiiceratops/plugin-image-export';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

viewer.plugins = [ImageDownloadPlugin, createPdfExportPlugin()];
