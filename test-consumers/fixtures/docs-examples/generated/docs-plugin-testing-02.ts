// GENERATED from apps/site/content/docs/plugin-testing.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { describe, it, expect } from 'vitest';
import { activatePlugin } from '@triiiceratops/plugin-sdk';
import { createTestViewerContext, flush } from '@triiiceratops/plugin-sdk/testing';
import {
    CORE_VERSION,
    pluginApiVersion,
    capabilities,
} from 'triiiceratops/testing';
import { createExamplePlugin } from './my-plugin';

describe('example plugin', () => {
    it('reacts to a command and cleans up', async () => {
        const tc = createTestViewerContext();
        const container = document.createElement('div');
        const activation = activatePlugin(createExamplePlugin(), {
            container,
            viewerState: tc.viewerState,
            coreVersion: CORE_VERSION,
            pluginApiVersion,
            capabilities,
            styles: tc.styles,
            locale: tc.locale,
            ui: tc.ui,
            // The REAL surface over the real state — see the trap below.
            surface: tc.surface,
            // Every guarded phase failure lands here. Rethrowing turns a broken
            // activation into a failing test instead of a silent one.
            reportError: (report) => {
                throw report.error;
            },
        });

        const label = container.querySelector('span');
        expect(label?.textContent).toBe('closed');

        tc.viewerState.toggleToolbar();
        await flush();
        expect(label?.textContent).toBe('open');

        activation.deactivate();
        expect(tc.styles.installed.every((s) => s.released)).toBe(true);
    });
});
