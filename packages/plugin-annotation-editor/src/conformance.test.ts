/**
 * The plugin's compatibility declaration, checked against the core it is built
 * beside.
 *
 * The whole declaration is `coreRange`: the drawing layer's container comes from
 * `registerOverlayLayer`, which core treats as always present and therefore does
 * not list as a capability, so there is nothing optional left to require. A
 * floor that this core does not satisfy would fail activation for every
 * consumer in the workspace, and nothing else in this package's suite runs
 * against a real viewer to catch it.
 */

import { describe, expect, it } from 'vitest';

// Safe in a test and not in the plugin source: a test is never bundled, so the
// shipped artifact still carries no JSON module.
import pkg from '../package.json';

import { satisfies } from '@triiiceratops/plugin-sdk';
import { CORE_VERSION } from 'triiiceratops/testing';

import { catalog } from './catalog';

import { createAnnotationEditorPlugin } from './plugin';

describe('plugin compatibility', () => {
    it('declares a core floor this core satisfies, and requires no capability', () => {
        const plugin = createAnnotationEditorPlugin();

        expect(plugin.requiredCapabilities).toEqual([]);
        expect(satisfies(CORE_VERSION, plugin.coreRange!)).toBe(true);
    });
});

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

// Declared-version drift guard. `PLUGIN_META.version` is a hand-written literal
// (a JSON module there would land package.json in the shipped bundle), and it is
// what reaches consumers as the plugin's declared identity. Nothing in the
// release tooling re-stamps it, so `changeset version` would otherwise publish a
// package whose own metadata names a version that was never released. Bump both
// together.
describe('the declared plugin version', () => {
    it('matches the version the package actually publishes', () => {
        expect(createAnnotationEditorPlugin().version).toBe(pkg.version);
    });
});
