// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
// iife.ts — your plugin's IIFE entry point, bundled standalone
import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register';
import { createExamplePlugin } from './my-plugin';

registerBrowserPlugin(createExamplePlugin());
