import { describe, expect, it, vi } from 'vitest';

import type { PluginError } from '@triiiceratops/plugin-sdk';

import { reportPdfExportError } from './reportError';

describe('reportPdfExportError', () => {
    it('surfaces an export failure on the bubbling, composed `pluginerror` channel', () => {
        // Mirror the runtime shape: a panel node nested inside the viewer root,
        // with the host listening on the root (as core wires `onpluginerror`).
        const root = document.createElement('div');
        const panel = document.createElement('div');
        root.appendChild(panel);
        document.body.appendChild(root);

        const received: PluginError[] = [];
        let bubbled = false;
        let composed = false;
        root.addEventListener('pluginerror', (event) => {
            const custom = event as CustomEvent<PluginError>;
            received.push(custom.detail);
            bubbled = custom.bubbles;
            composed = custom.composed;
        });

        const cause = new Error('boom');
        const retry = vi.fn();
        reportPdfExportError(panel, cause, retry);

        expect(received).toHaveLength(1);
        const detail = received[0];
        if (!detail) throw new Error('expected a pluginerror payload');
        expect(detail.pluginName).toBe('@triiiceratops/plugin-pdf-export');
        expect(detail.phase).toBe('command');
        expect(detail.error).toBe(cause);
        expect(bubbled).toBe(true);
        expect(composed).toBe(true);

        // The retry handle re-runs the failed operation on demand.
        detail.retry();
        expect(retry).toHaveBeenCalledTimes(1);

        document.body.removeChild(root);
    });
});
