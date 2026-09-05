// GENERATED from docs/plugin-testing.md — do not edit by hand.
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
            // Pass the real surface. Omit it and the plugin gets an always-open
            // stub whose `id` names no plugin of this viewer — see the trap below.
            surface: tc.surface,
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
