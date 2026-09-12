// GENERATED from apps/site/content/docs/plugin-testing.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { describe, it, expect } from 'vitest';
import { createTestViewerContext, flush } from '@triiiceratops/plugin-sdk/testing';

describe('viewer state notifications', () => {
    it('delivers on the flush, not synchronously', async () => {
        const { context } = createTestViewerContext();
        const open = context.selectors.select((s) => s.toolbarOpen);

        let seen = open.get();
        open.subscribe((v) => {
            seen = v;
        });

        context.viewerState.toggleToolbar();
        // Batched: no synchronous delivery yet.
        expect(seen).toBe(false);

        await flush();
        expect(seen).toBe(true);
    });
});
