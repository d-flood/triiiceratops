/**
 * Plugin conformance suite (ticket 14 test kit).
 *
 * `runPluginConformance` mounts the plugin against a REAL test viewer context
 * (real `ViewerState`, real batched notifications) with recording-double
 * services, and asserts the lifecycle contracts every plugin must honor:
 * mount/cleanup symmetry, subscription disposal, locale-change handling, style
 * cleanup, and error isolation. A passing run reflects production semantics.
 *
 * The panel (and its Annotorious-backed manager) stays closed by default, so this
 * unit-level run needs no OSD; OSD/Annotorious-dependent editing behavior is
 * validated at the browser (packed-fixture) seam.
 */

import { describe, expect, it } from 'vitest';

import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';

import { catalog } from './catalog';

import { createAnnotationEditorPlugin } from './plugin';

runPluginConformance(() => createAnnotationEditorPlugin());

// Chrome-title drift guard. `title` is key-or-literal, so a typo'd key renders
// verbatim in the toolbar — the exact cosmetic bug `title` exists to fix. Pin
// that the declared key really is in this package's catalog.
describe('chrome title', () => {
    it('declares a title that resolves against this plugin catalog', () => {
        const plugin = createAnnotationEditorPlugin();
        expect(plugin.title).toBeTruthy();
        expect(catalog.en?.[plugin.title!]).toBeTruthy();
    });
});
