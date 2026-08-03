import { describe, expect, it, vi } from 'vitest';

import { TriiiceratopsCoreConflictError } from '../browser-runtime.js';
import {
    assertViewerElementCompatible,
    createViewerElementRegistrar,
} from './registration.js';

/**
 * Lazy shared registration and deterministic version-conflict detection.
 *
 * The registrar is exercised through its injected seams — an explicit registry
 * and an explicit loader — because the two behaviors that matter (memoizing
 * BOTH outcomes, and diagnosing a tag owned by a foreign constructor) are about
 * what the registrar does with a registry, not about which registry it found.
 * A fake constructor is the one legitimate double in this ticket: an element
 * WITHOUT the `viewerState` getter cannot be produced from the real one.
 */

const TAG = 'triiiceratops-viewer';

/** A minimal, isolated custom-element registry. */
function fakeRegistry(): CustomElementRegistry & {
    defineCount: number;
} {
    const defined = new Map<string, CustomElementConstructor>();
    return {
        defineCount: 0,
        define(name: string, ctor: CustomElementConstructor) {
            defined.set(name, ctor);
            (this as { defineCount: number }).defineCount++;
        },
        get: (name: string) => defined.get(name),
        getName: () => null,
        upgrade: () => {},
        whenDefined: () =>
            Promise.reject(new Error('whenDefined must not be used')),
    } as unknown as CustomElementRegistry & { defineCount: number };
}

/** A compatible constructor: it carries the `viewerState` state bridge. */
function bridgedCtor(): CustomElementConstructor {
    class Bridged {
        get viewerState(): undefined {
            return undefined;
        }
    }
    return Bridged as unknown as CustomElementConstructor;
}

/** An incompatible constructor: an older core, or somebody else's element. */
function foreignCtor(): CustomElementConstructor {
    class Foreign {}
    return Foreign as unknown as CustomElementConstructor;
}

describe('ensureViewerElementRegistered', () => {
    it('loads the element bundle once and probes the tag owner', async () => {
        const registry = fakeRegistry();
        const load = vi.fn(async () => {
            registry.define(TAG, bridgedCtor());
        });
        const ensure = createViewerElementRegistrar({
            load,
            getRegistry: () => registry,
        });

        await expect(ensure()).resolves.toBeUndefined();
        expect(load).toHaveBeenCalledTimes(1);
        expect(registry.get(TAG)).toBeDefined();
    });

    it('shares one operation across concurrent callers', async () => {
        const registry = fakeRegistry();
        let release: (() => void) | undefined;
        const load = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    release = () => {
                        registry.define(TAG, bridgedCtor());
                        resolve();
                    };
                }),
        );
        const ensure = createViewerElementRegistrar({
            load,
            getRegistry: () => registry,
        });

        // Five wrapper instances mounting in the same commit.
        const all = [ensure(), ensure(), ensure(), ensure(), ensure()];
        // They are literally the same promise, not five equivalent ones.
        for (const promise of all) expect(promise).toBe(all[0]);
        release?.();
        await Promise.all(all);

        expect(load).toHaveBeenCalledTimes(1);
        expect(registry.defineCount).toBe(1);
    });

    it('memoizes a FAILED registration so the next caller fails without re-importing', async () => {
        const registry = fakeRegistry();
        const failure = new Error('network is down');
        const load = vi.fn(async () => {
            throw failure;
        });
        const ensure = createViewerElementRegistrar({
            load,
            getRegistry: () => registry,
        });

        await expect(ensure()).rejects.toBe(failure);
        await expect(ensure()).rejects.toBe(failure);
        await expect(ensure()).rejects.toBe(failure);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('surfaces TriiiceratopsCoreConflictError unmodified', async () => {
        const registry = fakeRegistry();
        const conflict = new TriiiceratopsCoreConflictError('1.0.0', '2.0.0');
        const ensure = createViewerElementRegistrar({
            load: async () => {
                throw conflict;
            },
            getRegistry: () => registry,
        });

        const rejection = await ensure().catch((error: unknown) => error);
        // The exact object, with its message and structured fields intact —
        // its diagnostic is already the right one, so nothing reformats it.
        expect(rejection).toBe(conflict);
        expect((rejection as TriiiceratopsCoreConflictError).code).toBe(
            'CORE_VERSION_CONFLICT',
        );
        expect((rejection as Error).message).toBe(conflict.message);
    });

    it('rejects a pre-registered element with no viewerState getter, using no timers', async () => {
        vi.useFakeTimers();
        try {
            const registry = fakeRegistry();
            // Somebody else owns the tag before any wrapper mounts. This is the
            // silent `false` from `defineViewerElement`, made loud.
            registry.define(TAG, foreignCtor());
            const load = vi.fn(async () => {});
            const ensure = createViewerElementRegistrar({
                load,
                getRegistry: () => registry,
            });

            // No timer is ever advanced: if detection depended on a timeout,
            // deadline, retry, or `whenDefined`, this would hang or reject with
            // the `whenDefined must not be used` error above.
            const rejection = await ensure().catch((error: unknown) => error);

            expect(rejection).toMatchObject({
                name: 'TriiiceratopsElementVersionError',
                code: 'ELEMENT_VERSION_CONFLICT',
                tag: TAG,
            });
            expect((rejection as Error).message).toContain('viewerState');
            expect((rejection as Error).message).toContain('first-wins');
            // The bundle is not even loaded: the tag was already taken.
            expect(load).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('memoizes the version conflict too', async () => {
        const registry = fakeRegistry();
        registry.define(TAG, foreignCtor());
        const load = vi.fn(async () => {});
        const ensure = createViewerElementRegistrar({
            load,
            getRegistry: () => registry,
        });

        const first = await ensure().catch((error: unknown) => error);
        const second = await ensure().catch((error: unknown) => error);
        expect(second).toBe(first);
        expect(load).not.toHaveBeenCalled();
    });

    it('skips the import when a compatible element already owns the tag', async () => {
        const registry = fakeRegistry();
        registry.define(TAG, bridgedCtor());
        const load = vi.fn(async () => {});
        const ensure = createViewerElementRegistrar({
            load,
            getRegistry: () => registry,
        });

        await expect(ensure()).resolves.toBeUndefined();
        expect(load).not.toHaveBeenCalled();
    });

    it('reports an environment with no custom-element registry', async () => {
        const ensure = createViewerElementRegistrar({
            load: async () => {
                throw new Error('must not load');
            },
            getRegistry: () => undefined,
        });

        await expect(ensure()).rejects.toMatchObject({
            name: 'TriiiceratopsElementRegistrationError',
            code: 'ELEMENT_REGISTRATION_UNAVAILABLE',
        });
    });

    it('reports a load that resolved without defining the tag', async () => {
        const registry = fakeRegistry();
        const ensure = createViewerElementRegistrar({
            load: async () => {},
            getRegistry: () => registry,
        });

        await expect(ensure()).rejects.toMatchObject({
            code: 'ELEMENT_VERSION_CONFLICT',
        });
    });
});

describe('assertViewerElementCompatible', () => {
    it('accepts the real element constructor', async () => {
        const { RealViewerElementCtor } =
            await import('../test/utils/realViewerElement.js');
        const registry = fakeRegistry();
        registry.define(TAG, RealViewerElementCtor);

        // The handshake is the state bridge itself: the getter the Svelte
        // compiler emits for the `viewerState` instance export.
        expect(() =>
            assertViewerElementCompatible(registry, TAG),
        ).not.toThrow();
    });

    it('rejects a constructor without the bridge', () => {
        const registry = fakeRegistry();
        registry.define(TAG, foreignCtor());
        expect(() => assertViewerElementCompatible(registry, TAG)).toThrow(
            /viewerState/,
        );
    });
});
