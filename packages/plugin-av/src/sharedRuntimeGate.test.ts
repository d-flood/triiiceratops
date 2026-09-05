/**
 * The version-skew gate, driven the way the built IIFE runs it: as the first
 * statements of a function body, against a page that may or may not carry a core.
 *
 * The generated source is what the bundle actually ships (`output.intro` in
 * vite.config.ts), so it is evaluated here rather than paraphrased. The cases
 * are the ones a host can be in: no core, a core whose namespace exists but
 * shares nothing, a core sharing a Svelte runtime this plugin cannot use, and a
 * core publishing an absent or incomplete set of curated utilities.
 */

import { describe, expect, it } from 'vitest';

import { PLUGIN_META } from './identity';
import {
    REQUIRED_CORE_UTILS,
    REQUIRED_SVELTE_EXPORTS,
    REQUIRED_SVELTE_INTERNALS,
    sharedRuntimeGateSource,
} from './sharedRuntimeGate';

/**
 * The shared remedy both skew refusals end their name list with.
 *
 * Included in the list assertions below so they pin the list as EXACTLY the
 * names given: `toContain('… helpers: from_html')` alone also passes for
 * `… helpers: from_html, anything, else`.
 */
const AFTER_NAMES = '; load matching versions of core and this plugin';

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
    const core: Record<string, unknown> = {};
    for (const name of REQUIRED_CORE_UTILS) core[name] = () => {};
    return {
        coreVersion: '1.0.0-rc.36',
        svelte,
        svelteInternal,
        core,
        ...overrides,
    };
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
        expect(run.errors[0]).toContain('no window.Triiiceratops');
        expect(run.errors[0]).toContain('triiiceratops-element.iife.js');
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
        // Every required name, since the page shares none of them.
        expect(run.errors[0]).toContain(
            `Missing shared Svelte helpers: ${[
                ...REQUIRED_SVELTE_EXPORTS,
                ...REQUIRED_SVELTE_INTERNALS,
            ].join(', ')}${AFTER_NAMES}`,
        );
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
        expect(run.errors[0]).toContain(
            `Missing shared Svelte helpers: from_html${AFTER_NAMES}`,
        );
    });

    it('names the version when a core publishes no core utilities', () => {
        const run = runGate(
            sharedRuntime({ coreVersion: '1.0.0-rc.30', core: undefined }),
        );

        expect(run.registered).toBe(false);
        expect(run.errors).toHaveLength(1);
        expect(run.errors[0]).toContain('core 1.0.0-rc.30');
        expect(run.errors[0]).toContain(
            `Missing core utilities: ${REQUIRED_CORE_UTILS.join(', ')}${AFTER_NAMES}`,
        );
    });

    it('names the missing utility when a core publishes an incomplete set', () => {
        const runtime = sharedRuntime({ coreVersion: '2.0.0' });
        delete (runtime.core as Record<string, unknown>).isUnsupportedCanvasFor;

        const run = runGate(runtime);

        expect(run.registered).toBe(false);
        expect(run.errors).toHaveLength(1);
        expect(run.errors[0]).toContain(
            `Missing core utilities: isUnsupportedCanvasFor${AFTER_NAMES}`,
        );
    });

    /*
        The three refusals share a prefix and a docs pointer, so what tells them
        apart is the cause line between them. Asserted as a property over the
        whole set rather than case by case: no refusal may be a substring of
        another, and each must carry the one pointer.
    */
    it('keeps every refusal distinguishable, and each pointed at the docs', () => {
        const noHelpers = sharedRuntime({ coreVersion: '2.0.0' });
        delete (noHelpers.svelteInternal as Record<string, unknown>).from_html;
        const noUtils = sharedRuntime({ coreVersion: '2.0.0' });
        delete (noUtils.core as Record<string, unknown>).isUnsupportedCanvasFor;

        const refusals = [
            runGate(undefined),
            runGate(noHelpers),
            runGate(noUtils),
        ].map((run) => {
            expect(run.errors).toHaveLength(1);
            return run.errors[0] as string;
        });

        for (const refusal of refusals) {
            expect(refusal).toContain(PLUGIN_META.docs);
        }
        expect(new Set(refusals).size).toBe(refusals.length);
        for (const one of refusals) {
            for (const other of refusals) {
                if (one === other) continue;
                expect(other).not.toContain(one);
            }
        }
    });

    it('emits exactly one diagnostic, never a bare throw', () => {
        expect(() => runGate(undefined)).not.toThrow();
        expect(() => runGate({ svelte: {}, svelteInternal: {} })).not.toThrow();
    });
});
