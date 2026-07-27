// Structured viewer-failure channel (ticket 18).
//
// Actionable viewer failures must surface as a typed `ViewerError` through the
// host reporter (which the component turns into the `viewererror` DOM event and
// `onviewererror` callback) — NOT only as console output (user stories 12–13).
// This mirrors the ticket 09 `pluginerror` reporter shape.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewerState } from './viewer.svelte';
import type { ViewerError } from '../types/viewerError';

vi.mock('./manifests.svelte', () => ({
    manifestsState: {
        fetchManifest: vi.fn(),
        fetchResource: vi.fn(),
        registerManifest: vi.fn(),
        getManifest: vi.fn(),
        getManifestEntry: vi.fn(),
        getAnnotations: vi.fn(() => []),
        getCanvases: vi.fn(() => []),
        getSequenceCount: vi.fn(() => 0),
    },
}));

describe('ViewerState structured error reporting (ticket 18)', () => {
    let state: ViewerState;

    beforeEach(() => {
        state = new ViewerState();
    });

    afterEach(() => {
        state.destroy();
        vi.restoreAllMocks();
    });

    it('routes an actionable failure to the wired reporter as a typed ViewerError', () => {
        const reported: ViewerError[] = [];
        state.setErrorReporter((e) => reported.push(e));

        // No viewer element is mounted, so toggling fullscreen is an actionable
        // configuration/operation failure.
        state.toggleFullScreen();

        expect(reported).toHaveLength(1);
        const [error] = reported;
        expect(error.code).toBe('fullscreen-element-missing');
        expect(error.scope).toBe('viewport');
        expect(error.severity).toBe('warning');
        expect(typeof error.message).toBe('string');
    });

    it('does not throw and reports nothing when no reporter is wired', () => {
        // Default (direct/test) use: silent, no reporter, no throw.
        expect(() => state.toggleFullScreen()).not.toThrow();
    });

    it('stops reporting once the reporter is cleared', () => {
        const reporter = vi.fn();
        state.setErrorReporter(reporter);
        state.setErrorReporter(null);

        state.toggleFullScreen();

        expect(reporter).not.toHaveBeenCalled();
    });
});
