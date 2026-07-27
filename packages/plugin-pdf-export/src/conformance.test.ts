/**
 * Plugin conformance suite (ticket 14 test kit).
 *
 * `runPluginConformance` mounts the plugin against a REAL test viewer context
 * (real `ViewerState`, real batched notifications) with recording-double
 * services, and asserts the lifecycle contracts every plugin must honor:
 * mount/cleanup symmetry, subscription disposal, locale-change handling, style
 * cleanup, and error isolation. A passing run reflects production semantics.
 *
 * The factory is exercised through `createPdfExportPlugin()` so the conformance
 * run covers the factory-with-config authoring path (its default, no-config
 * form).
 */

import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';

import { createPdfExportPlugin } from './plugin';

runPluginConformance(() => createPdfExportPlugin());
