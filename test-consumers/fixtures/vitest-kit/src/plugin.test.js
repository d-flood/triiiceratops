// Plain vitest consumer on packed tarballs, no Svelte tooling.
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
            surface: tc.surface,
            reportError: (report) => {
                throw report.error;
            },
        });

        const label = container.querySelector('[data-testid="state"]');
        expect(label.textContent).toBe('closed');

        tc.viewerState.toggleToolbar();
        expect(label.textContent).toBe('closed');

        await flush();
        expect(label.textContent).toBe('open');

        activation.deactivate();
        expect(tc.styles.installed.every((s) => s.released)).toBe(true);
    });
});
