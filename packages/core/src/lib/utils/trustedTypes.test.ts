// Trusted Types default-policy installer tests (ticket 24).
//
// `installTrustedTypesPolicy` must: no-op without Trusted Types, install a
// pass-through `default` policy when Trusted Types is present and no default
// exists, never clobber a host's existing default policy, and swallow a throwing
// createPolicy (host CSP that disallows the `default` name).

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installTrustedTypesPolicy } from './trustedTypes';

type MutableWindow = { trustedTypes?: unknown };

function resetModule() {
    // The module tracks "installed" across calls; reset by re-importing fresh.
    vi.resetModules();
}

afterEach(() => {
    delete (window as unknown as MutableWindow).trustedTypes;
    resetModule();
});

describe('installTrustedTypesPolicy', () => {
    it('is a no-op when Trusted Types is unavailable', () => {
        delete (window as unknown as MutableWindow).trustedTypes;
        expect(() => installTrustedTypesPolicy()).not.toThrow();
    });

    it('installs a pass-through default policy when none exists', async () => {
        const createPolicy = vi.fn((_name: string, rules: unknown) => rules);
        (window as unknown as MutableWindow).trustedTypes = {
            defaultPolicy: null,
            createPolicy,
        };

        const { installTrustedTypesPolicy: install } =
            await import('./trustedTypes');
        install();

        expect(createPolicy).toHaveBeenCalledTimes(1);
        const [name, rules] = createPolicy.mock.calls[0];
        expect(name).toBe('default');
        // Pass-through createHTML returns its input verbatim.
        expect(
            (rules as { createHTML: (s: string) => string }).createHTML(
                '<b>x</b>',
            ),
        ).toBe('<b>x</b>');
    });

    it('does not clobber a host-installed default policy', async () => {
        const createPolicy = vi.fn();
        (window as unknown as MutableWindow).trustedTypes = {
            defaultPolicy: { name: 'default' },
            createPolicy,
        };

        const { installTrustedTypesPolicy: install } =
            await import('./trustedTypes');
        install();

        expect(createPolicy).not.toHaveBeenCalled();
    });

    it('swallows a throwing createPolicy (CSP disallows the default name)', async () => {
        const createPolicy = vi.fn(() => {
            throw new Error('disallowed policy name: default');
        });
        (window as unknown as MutableWindow).trustedTypes = {
            defaultPolicy: null,
            createPolicy,
        };

        const { installTrustedTypesPolicy: install } =
            await import('./trustedTypes');
        expect(() => install()).not.toThrow();
    });
});
