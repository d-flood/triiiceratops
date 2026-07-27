// Packed vitest-kit consumer: verifies that `@triiiceratops/plugin-sdk/testing`
// and the compiled `triiiceratops/testing` entry import and operate in a plain
// vitest project (jsdom, NO Svelte tooling) that installed only the tarballs.
//
// It runs the full conformance suite against the demo plugin AND asserts the
// real batched-notification timing directly.
import { describe, expect, it } from 'vitest';

import { activatePlugin } from '@triiiceratops/plugin-sdk';
import {
    createTestViewerContext,
    flush,
    runPluginConformance,
} from '@triiiceratops/plugin-sdk/testing';
import {
    CORE_VERSION,
    capabilities,
    pluginApiVersion,
} from 'triiiceratops/testing';

import { createDemoPlugin } from './plugin.js';

// The whole conformance battery, running with no Svelte compiler present.
runPluginConformance(() => createDemoPlugin());

describe('demo plugin against the real compiled headless viewer state', () => {
    it('reacts to a command only on the batched flush, and cleans up', async () => {
        const tc = createTestViewerContext();
        const container = document.createElement('div');
        const activation = activatePlugin(createDemoPlugin(), {
            container,
            viewerState: tc.viewerState,
            coreVersion: CORE_VERSION,
            pluginApiVersion,
            capabilities,
            styles: tc.styles,
            locale: tc.locale,
            ui: tc.ui,
        });

        const label = container.querySelector('[data-testid="state"]');
        expect(label.textContent).toBe('closed');

        tc.viewerState.toggleToolbar();
        // Batched: no synchronous delivery.
        expect(label.textContent).toBe('closed');

        await flush();
        expect(label.textContent).toBe('open');

        activation.deactivate();
        expect(tc.styles.installed.every((s) => s.released)).toBe(true);
    });
});
