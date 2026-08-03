import { afterEach, describe, expect, it } from 'vitest';

import {
    configureLogging,
    isDebugEnabled,
    logger,
    type LogLevel,
} from '../logging/logger.js';
import { bridgeViewerDebugFlag, viewerConfigDebugFlag } from './debugFlag.js';

/**
 * The `ViewerConfig.debug` bridge, at the seam.
 *
 * These are unit tests of the RULE — which `config` values carry a `debug`
 * opinion and which do not. They deliberately cannot prove the thing the bridge
 * exists for, because under vitest the wrapper's logger module and the element
 * bundle's inlined copy are the same instance; that is exactly the blind spot
 * that let the dead-warning defect ship. The artifact-level proof lives in the
 * `framework-react` and `framework-vue` packed fixtures, whose `debug.html`
 * route observes a real `console.warn` from a real installed tarball.
 */

afterEach(() => {
    configureLogging({ debug: false, sink: null });
});

describe('viewerConfigDebugFlag', () => {
    it('reads the flag from an object config', () => {
        expect(viewerConfigDebugFlag({ debug: true })).toBe(true);
        expect(viewerConfigDebugFlag({ debug: false })).toBe(false);
    });

    it('coerces a truthy or falsy debug value', () => {
        expect(viewerConfigDebugFlag({ debug: 1 })).toBe(true);
        expect(viewerConfigDebugFlag({ debug: '' })).toBe(false);
        // Present but undefined is still an opinion, and the element resolves
        // it the same way (`config?.debug ?? false`).
        expect(viewerConfigDebugFlag({ debug: undefined })).toBe(false);
    });

    it('parses a JSON-string config exactly as the element does', () => {
        expect(viewerConfigDebugFlag('{"debug":true}')).toBe(true);
        expect(viewerConfigDebugFlag('{"debug":false}')).toBe(false);
        expect(viewerConfigDebugFlag('{"locale":"fr"}')).toBeUndefined();
    });

    it('states no opinion for a string that is not a JSON object', () => {
        expect(viewerConfigDebugFlag('')).toBeUndefined();
        expect(viewerConfigDebugFlag('{oops')).toBeUndefined();
        expect(viewerConfigDebugFlag('"debug"')).toBeUndefined();
        expect(viewerConfigDebugFlag('[{"debug":true}]')).toBeUndefined();
    });

    it('states no opinion for an absent, cleared, or non-object config', () => {
        expect(viewerConfigDebugFlag(undefined)).toBeUndefined();
        expect(viewerConfigDebugFlag(null)).toBeUndefined();
        expect(viewerConfigDebugFlag(42)).toBeUndefined();
        expect(viewerConfigDebugFlag([{ debug: true }])).toBeUndefined();
    });

    it('states no opinion for a config with no debug key', () => {
        expect(viewerConfigDebugFlag({})).toBeUndefined();
        expect(viewerConfigDebugFlag({ locale: 'fr' })).toBeUndefined();
    });
});

describe('bridgeViewerDebugFlag', () => {
    it('turns wrapper-side debug logging on and off', () => {
        bridgeViewerDebugFlag({ debug: true });
        expect(isDebugEnabled()).toBe(true);
        bridgeViewerDebugFlag({ debug: false });
        expect(isDebugEnabled()).toBe(false);
    });

    it('leaves the flag alone when the config states no opinion', () => {
        bridgeViewerDebugFlag({ debug: true });
        // A second viewer configured with something unrelated must not switch
        // off the diagnostics the first one asked for.
        bridgeViewerDebugFlag({ locale: 'fr' });
        bridgeViewerDebugFlag(undefined);
        bridgeViewerDebugFlag('{oops');
        expect(isDebugEnabled()).toBe(true);
    });

    it('never replaces an injected sink', () => {
        const records: LogLevel[] = [];
        configureLogging({
            debug: false,
            sink: (level) => records.push(level),
        });
        bridgeViewerDebugFlag({ debug: true });
        logger.warn('after the bridge');

        expect(isDebugEnabled()).toBe(true);
        expect(records).toEqual(['warn']);
    });
});
