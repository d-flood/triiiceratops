/**
 * Plugin conformance suite.
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

import { describe, expect, it } from 'vitest';

import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';

import { catalog } from './catalog';

import { createPdfExportPlugin } from './plugin';

runPluginConformance(() => createPdfExportPlugin());

// Chrome-title drift guard. `title` is key-or-literal, so a typo'd key renders
// verbatim in the toolbar — the exact cosmetic bug `title` exists to fix. Pin
// that the declared key really is in this package's catalog.
describe('chrome title', () => {
    it('declares a title that resolves against this plugin catalog', () => {
        const plugin = createPdfExportPlugin();
        expect(plugin.title).toBeTruthy();
        expect(catalog.en?.[plugin.title!]).toBeTruthy();
    });
});
