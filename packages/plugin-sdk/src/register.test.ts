import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SdkPlugin } from 'triiiceratops';

import { registerBrowserPlugin } from './register';

// The registry only reads `name` and `version`; the rest of `SdkPlugin` is
// irrelevant to registration, so a minimal stub suffices.
function makePlugin(name: string, version: string): SdkPlugin {
    return { name, version } as unknown as SdkPlugin;
}

describe('registerBrowserPlugin (first-registration-wins)', () => {
    beforeEach(() => {
        delete (window as { Triiiceratops?: unknown }).Triiiceratops;
    });

    afterEach(() => {
        delete (window as { Triiiceratops?: unknown }).Triiiceratops;
        vi.restoreAllMocks();
    });

    it('keeps the first registration and warns when a different version double-registers', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        registerBrowserPlugin(makePlugin('@triiiceratops/plugin-x', '1.0.0'));
        registerBrowserPlugin(makePlugin('@triiiceratops/plugin-x', '2.0.0'));

        // First registration wins…
        expect(
            window.Triiiceratops?.plugins.get('@triiiceratops/plugin-x')
                ?.version,
        ).toBe('1.0.0');
        // …and the newcomer is announced on the one sanctioned console site.
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('@triiiceratops/plugin-x');
    });

    it('is a silent no-op when the same version registers twice', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        registerBrowserPlugin(makePlugin('@triiiceratops/plugin-y', '1.2.3'));
        registerBrowserPlugin(makePlugin('@triiiceratops/plugin-y', '1.2.3'));

        expect(
            window.Triiiceratops?.plugins.get('@triiiceratops/plugin-y')
                ?.version,
        ).toBe('1.2.3');
        expect(warn).not.toHaveBeenCalled();
    });
});
