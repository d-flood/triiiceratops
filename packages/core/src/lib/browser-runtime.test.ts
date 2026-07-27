import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    BROWSER_RUNTIME_KEY,
    TriiiceratopsCoreConflictError,
    ensureBrowserRuntime,
    installBrowserRuntime,
    type TriiiceratopsBrowserRuntime,
} from './browser-runtime';
import type { SdkPlugin } from './types/plugin';

/**
 * Minimal SdkPlugin stub. The registry only reads `name` and `version`; the rest
 * of the fields are present to satisfy the type without pulling in the SDK.
 */
function makePlugin(name: string, version: string): SdkPlugin {
    return {
        kind: 'triiiceratops-plugin',
        name,
        version,
        coreRange: '*',
        pluginApiRange: '*',
        requiredCapabilities: [],
        icon: {
            kind: 'svg',
            inner: '',
            viewBox: '0 0 24 24',
        } as SdkPlugin['icon'],
        target: 'panel',
        view: { mount: () => () => {} },
        activate: () => ({ deactivate() {} }),
    };
}

/**
 * A distinct custom-element ctor per test. happy-dom's CustomElementRegistry
 * persists across tests and cannot un-define a tag, so each test uses a unique
 * tag to stay isolated.
 */
function makeElementCtor(): CustomElementConstructor {
    return class extends HTMLElement {};
}

let tagCounter = 0;
function uniqueTag(): string {
    return `test-el-${tagCounter++}`;
}

const CORE = {
    coreVersion: '1.0.0',
    pluginApiVersion: '1.0.0',
    capabilities: ['osd@5'] as const,
};

beforeEach(() => {
    delete (window as { Triiiceratops?: unknown }).Triiiceratops;
});

afterEach(() => {
    delete (window as { Triiiceratops?: unknown }).Triiiceratops;
    vi.restoreAllMocks();
});

describe('bootstrap', () => {
    it('creates the namespace on the global under the documented key', () => {
        expect(window.Triiiceratops).toBeUndefined();
        const runtime = ensureBrowserRuntime();
        expect(runtime).toBe(
            (window as { Triiiceratops?: TriiiceratopsBrowserRuntime })
                .Triiiceratops,
        );
        expect(BROWSER_RUNTIME_KEY).toBe('Triiiceratops');
    });

    it('is idempotent — repeated bootstrap returns the same registry', () => {
        const a = ensureBrowserRuntime();
        const b = ensureBrowserRuntime();
        expect(a).toBe(b);
        expect(a.plugins).toBe(b.plugins);
    });

    it('starts with empty core fields and an empty registry before core loads', () => {
        const runtime = ensureBrowserRuntime();
        expect(runtime.coreVersion).toBe('');
        expect(runtime.pluginApiVersion).toBe('');
        expect(runtime.capabilities).toEqual([]);
        expect(runtime.plugins.list()).toEqual([]);
    });
});

describe('order-independence', () => {
    it('plugin registers before core, then core completes the namespace', () => {
        // A plugin IIFE bootstraps and registers first.
        const runtime = ensureBrowserRuntime();
        runtime.plugins.register(
            makePlugin('@triiiceratops/plugin-x', '2.0.0'),
        );

        // Core loads afterward.
        installBrowserRuntime({
            ...CORE,
            elementCtor: makeElementCtor(),
            tag: uniqueTag(),
        });

        expect(window.Triiiceratops?.coreVersion).toBe('1.0.0');
        expect(window.Triiiceratops?.pluginApiVersion).toBe('1.0.0');
        expect(window.Triiiceratops?.capabilities).toEqual(['osd@5']);
        // The pre-registered factory is still retrievable.
        expect(
            window.Triiiceratops?.plugins.get('@triiiceratops/plugin-x')
                ?.version,
        ).toBe('2.0.0');
    });

    it('core loads before plugin, then plugin registers into the same namespace', () => {
        installBrowserRuntime({
            ...CORE,
            elementCtor: makeElementCtor(),
            tag: uniqueTag(),
        });

        window.Triiiceratops?.plugins.register(
            makePlugin('@triiiceratops/plugin-y', '3.1.0'),
        );

        expect(window.Triiiceratops?.coreVersion).toBe('1.0.0');
        expect(
            window.Triiiceratops?.plugins.get('@triiiceratops/plugin-y')
                ?.version,
        ).toBe('3.1.0');
    });
});

describe('one core per page, first wins', () => {
    it('same-version double-load is a harmless no-op (no throw, no duplicate define crash)', () => {
        const tag = uniqueTag();
        installBrowserRuntime({
            ...CORE,
            elementCtor: makeElementCtor(),
            tag,
        });
        const firstCtor = customElements.get(tag);

        expect(() =>
            installBrowserRuntime({
                ...CORE,
                elementCtor: makeElementCtor(),
                tag,
            }),
        ).not.toThrow();

        // Element registration untouched (first ctor still owns the tag).
        expect(customElements.get(tag)).toBe(firstCtor);
        expect(window.Triiiceratops?.coreVersion).toBe('1.0.0');
    });

    it('different-version second core throws a structured conflict error and touches nothing', () => {
        const tag = uniqueTag();
        installBrowserRuntime({
            ...CORE,
            elementCtor: makeElementCtor(),
            tag,
        });
        const firstCtor = customElements.get(tag);

        let thrown: unknown;
        try {
            installBrowserRuntime({
                coreVersion: '1.1.0',
                pluginApiVersion: '1.1.0',
                capabilities: ['osd@6'],
                elementCtor: makeElementCtor(),
                tag,
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(TriiiceratopsCoreConflictError);
        const conflict = thrown as TriiiceratopsCoreConflictError;
        expect(conflict.code).toBe('CORE_VERSION_CONFLICT');
        expect(conflict.existingVersion).toBe('1.0.0');
        expect(conflict.attemptedVersion).toBe('1.1.0');
        expect(conflict.message).toContain('1.1.0');
        expect(conflict.message).toContain('1.0.0');

        // Namespace and custom element left untouched (first wins).
        expect(window.Triiiceratops?.coreVersion).toBe('1.0.0');
        expect(window.Triiiceratops?.pluginApiVersion).toBe('1.0.0');
        expect(window.Triiiceratops?.capabilities).toEqual(['osd@5']);
        expect(customElements.get(tag)).toBe(firstCtor);
    });
});

describe('plugin registry', () => {
    it('re-registering the same name + version is a silent no-op', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const runtime = ensureBrowserRuntime();

        const first = makePlugin('@triiiceratops/plugin-z', '1.0.0');
        const second = makePlugin('@triiiceratops/plugin-z', '1.0.0');
        runtime.plugins.register(first);
        runtime.plugins.register(second);

        expect(warn).not.toHaveBeenCalled();
        expect(runtime.plugins.list()).toHaveLength(1);
        // First registration wins the slot.
        expect(runtime.plugins.get('@triiiceratops/plugin-z')).toBe(first);
    });

    it('a different version of an already-registered plugin is ignored with a structured warning (first wins)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const runtime = ensureBrowserRuntime();

        const first = makePlugin('@triiiceratops/plugin-z', '1.0.0');
        runtime.plugins.register(first);
        runtime.plugins.register(
            makePlugin('@triiiceratops/plugin-z', '2.0.0'),
        );

        expect(warn).toHaveBeenCalledTimes(1);
        const [, detail] = warn.mock.calls[0];
        expect(detail).toMatchObject({
            name: '@triiiceratops/plugin-z',
            registeredVersion: '1.0.0',
            ignoredVersion: '2.0.0',
        });
        // First version still wins and is retrievable.
        expect(runtime.plugins.get('@triiiceratops/plugin-z')).toBe(first);
        expect(runtime.plugins.list()).toHaveLength(1);
    });

    it('registers distinct plugins independently and reports membership', () => {
        const runtime = ensureBrowserRuntime();
        runtime.plugins.register(
            makePlugin('@triiiceratops/plugin-a', '1.0.0'),
        );
        runtime.plugins.register(
            makePlugin('@triiiceratops/plugin-b', '1.0.0'),
        );

        expect(runtime.plugins.has('@triiiceratops/plugin-a')).toBe(true);
        expect(runtime.plugins.has('@triiiceratops/plugin-b')).toBe(true);
        expect(runtime.plugins.has('@triiiceratops/plugin-c')).toBe(false);
        expect(runtime.plugins.list().map((p) => p.name)).toEqual([
            '@triiiceratops/plugin-a',
            '@triiiceratops/plugin-b',
        ]);
    });
});
