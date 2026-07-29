/**
 * Plugin conformance suite (ticket 14 test kit).
 *
 * `runPluginConformance` mounts the plugin against a REAL test viewer context
 * (real `ViewerState`, real batched notifications) with recording-double
 * services, and asserts the lifecycle contracts every plugin must honor:
 * mount/cleanup symmetry, subscription disposal, locale-change handling, style
 * cleanup, and error isolation. A passing run reflects production semantics.
 */

import { describe, expect, it } from 'vitest';

import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';

import { catalog } from './catalog';

import { ImageDownloadPlugin } from './plugin';

runPluginConformance(() => ImageDownloadPlugin);

// Chrome-title drift guard. `title` is key-or-literal, so a typo'd key renders
// verbatim in the toolbar — the exact cosmetic bug `title` exists to fix. Pin
// that the declared key really is in this package's catalog.
describe('chrome title', () => {
    it('declares a title that resolves against this plugin catalog', () => {
        const plugin = ImageDownloadPlugin;
        expect(plugin.title).toBeTruthy();
        expect(catalog.en?.[plugin.title!]).toBeTruthy();
    });
});
