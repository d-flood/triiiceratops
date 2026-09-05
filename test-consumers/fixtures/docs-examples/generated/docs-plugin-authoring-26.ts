// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { definePluginStyles } from '@triiiceratops/plugin-sdk';

// Conventionally in its own styles.ts, imported by name wherever installed.
export const { STYLES, STYLE_ID } = definePluginStyles(
    '.my-plugin-panel { padding: 1rem; }',
    'panel',
);
