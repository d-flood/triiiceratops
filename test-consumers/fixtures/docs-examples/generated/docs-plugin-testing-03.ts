// GENERATED from apps/site/content/docs/plugin-testing.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';
import { createExamplePlugin } from './my-plugin';

runPluginConformance(() => createExamplePlugin());
