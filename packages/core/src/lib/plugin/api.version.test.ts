import { describe, expect, it } from 'vitest';

// Importing the manifest is safe HERE and not in `api.ts`: a test is never
// bundled, so the element artifact still carries no JSON module.
import pkg from '../../../package.json';
import { CORE_VERSION } from './api';

describe('the declared core version', () => {
    it('matches the version the package actually publishes', () => {
        // `CORE_VERSION` is the value a plugin's `coreRange` is negotiated
        // against and the one quoted back in `PluginCompatibilityError`. When it
        // runs ahead of `package.json`, a plugin pinned to the published version
        // is refused with a message naming a version nobody can install.
        expect(CORE_VERSION).toBe(pkg.version);
    });
});
