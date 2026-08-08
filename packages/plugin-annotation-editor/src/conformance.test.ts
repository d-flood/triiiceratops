/**
 * The retired plugin's one remaining behavioural claim: **it fails activation,
 * loudly, and says why.**
 *
 * `runPluginConformance` used to run here. It cannot any more, and that is the
 * point rather than an obstacle: the suite mounts a plugin against a real
 * viewer, and this plugin declares `osd@5` — a capability core retired with no
 * successor when the renderer became first-party (SPEC.md §Public API). Every
 * lifecycle contract conformance asserts is downstream of an activation that
 * now correctly never happens.
 *
 * The alternative — dropping the declaration so the suite goes green — would
 * make a consumer's viewer install a toolbar button and a panel whose "Edit"
 * does nothing at all, with no error anywhere. A structured
 * `PluginCompatibilityError` naming the missing capability is the honest
 * report, and this file pins it. **Ticket 15** owns the rest of the
 * disposition: the changeset, the README pointer, pinning/unpublishing, and
 * removing the package from the aggregate build/test/lint scripts.
 */

import { describe, expect, it } from 'vitest';

import { capabilities } from 'triiiceratops/testing';

import { catalog } from './catalog';

import { createAnnotationEditorPlugin } from './plugin';

describe('retired plugin', () => {
    it('declares a capability this core does not provide, so activation fails', () => {
        const plugin = createAnnotationEditorPlugin();

        expect(plugin.requiredCapabilities).toEqual(['osd@5']);
        expect(capabilities).not.toContain('osd@5');
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
