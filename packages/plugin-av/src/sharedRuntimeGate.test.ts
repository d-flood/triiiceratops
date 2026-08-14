/**
 * The version-skew gate, driven the way the built IIFE runs it: as the first
 * statements of a function body, against a page that may or may not carry a core.
 *
 * The generated source is what the bundle actually ships (`output.intro` in
 * vite.config.ts), so it is evaluated here rather than paraphrased. The three
 * cases are the three a host can be in: no core, a core whose namespace exists
 * but shares no runtime, and a core sharing a runtime this plugin cannot use.
 */

import { describe, expect, it } from 'vitest';

import {
    REQUIRED_SVELTE_EXPORTS,
    REQUIRED_SVELTE_INTERNALS,
    sharedRuntimeGateSource,
} from './sharedRuntimeGate';

interface GateRun {
    /** `true` when the gate let the bundle body run. */
    readonly registered: boolean;
    readonly errors: readonly string[];
}

/**
 * Run the gate with `window` bound to `namespace`, standing in for the bundle
 * body with a single sentinel statement the gate's `return` must skip.
 */
function runGate(triiiceratops: unknown): GateRun {
    const errors: string[] = [];
    const gate = new Function(
        'window',
        'console',
        `${sharedRuntimeGateSource()}\nreturn true;`,
    ) as (window: unknown, console: unknown) => boolean | undefined;

    const registered = gate(
        triiiceratops === undefined ? {} : { Triiiceratops: triiiceratops },
        { error: (message: string) => errors.push(message) },
    );

    return { registered: registered === true, errors };
}

function sharedRuntime(overrides: Record<string, unknown> = {}) {
    const svelte: Record<string, unknown> = {};
    for (const name of REQUIRED_SVELTE_EXPORTS) svelte[name] = () => {};
    const svelteInternal: Record<string, unknown> = {};
    for (const name of REQUIRED_SVELTE_INTERNALS)
        svelteInternal[name] = () => {};
    return { coreVersion: '1.0.0-rc.36', svelte, svelteInternal, ...overrides };
}

describe('the shared-runtime skew gate', () => {
    it('lets the bundle run against a core that shares the whole runtime', () => {
        const run = runGate(sharedRuntime());

        expect(run.registered).toBe(true);
        expect(run.errors).toEqual([]);
    });

    it('names the load order when there is no core on the page', () => {
        const run = runGate(undefined);

        expect(run.registered).toBe(false);
        expect(run.errors).toHaveLength(1);
        expect(run.errors[0]).toContain(
            'window.Triiiceratops is not on this page',
        );
        expect(run.errors[0]).toContain('must load BEFORE it');
    });

    it('names the version when a core shares no runtime at all', () => {
        const run = runGate({
            coreVersion: '1.0.0-rc.30',
            svelte: {},
            svelteInternal: {},
        });

        expect(run.registered).toBe(false);
        expect(run.errors).toHaveLength(1);
        expect(run.errors[0]).toContain('core 1.0.0-rc.30');
        expect(run.errors[0]).toContain('does not share the Svelte runtime');
    });

    it('names the missing helper when a newer core renamed one', () => {
        // The skew this gate exists for: a core on a later Svelte whose internals
        // moved. Everything else is present, so only the renamed helper is named.
        const runtime = sharedRuntime({ coreVersion: '2.0.0' });
        delete (runtime.svelteInternal as Record<string, unknown>).from_html;
        (runtime.svelteInternal as Record<string, unknown>).fromHtml = () => {};

        const run = runGate(runtime);

        expect(run.registered).toBe(false);
        expect(run.errors).toHaveLength(1);
        expect(run.errors[0]).toContain('core 2.0.0');
        expect(run.errors[0]).toContain('Missing helpers: from_html.');
    });

    it('emits exactly one diagnostic, never a bare throw', () => {
        expect(() => runGate(undefined)).not.toThrow();
        expect(() => runGate({ svelte: {}, svelteInternal: {} })).not.toThrow();
    });
});
