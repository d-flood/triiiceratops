/**
 * Plugin conformance suite.
 *
 * `runPluginConformance` mounts the plugin against a REAL test viewer context
 * (real `ViewerState`, real batched notifications) with recording-double
 * services, and asserts the lifecycle contracts every plugin must honor:
 * mount/cleanup symmetry, subscription disposal, locale-change handling, style
 * cleanup, and error isolation. A passing run reflects production semantics.
 */

import { describe, expect, it } from 'vitest';

// Safe in a test and not in the plugin source: a test is never bundled, so the
// shipped artifact still carries no JSON module.
import pkg from '../package.json';

import { satisfies } from '@triiiceratops/plugin-sdk';
import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';
import { CORE_VERSION } from 'triiiceratops';

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

// Declared-version drift guard. `version` is a hand-written literal (a JSON
// module here would land package.json in the shipped bundle), and it is what
// reaches consumers as `pluginerror.pluginVersion` and as the plugin's declared
// identity. Nothing in the release tooling re-stamps it, so `changeset version`
// would otherwise publish a package whose own metadata names a version that was
// never released. Bump both together.
describe('the declared plugin version', () => {
    it('matches the version the package actually publishes', () => {
        expect(ImageDownloadPlugin.version).toBe(pkg.version);
    });
});

// Core-range guard. A `coreRange` the workspace core does not satisfy fails
// activation, which surfaces through `runPluginConformance` as every lifecycle
// assertion failing at once ("mount() runs exactly once: expected +0 to be 1")
// — true, but it names neither the range nor the version. Assert it directly so
// the range is what the failure talks about. It is also the check that catches a
// range left behind at a core version bump.
describe('the declared core range', () => {
    it('is satisfied by the core version this plugin ships beside', () => {
        expect(satisfies(CORE_VERSION, ImageDownloadPlugin.coreRange)).toBe(
            true,
        );
    });
});
