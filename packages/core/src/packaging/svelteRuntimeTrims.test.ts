import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import {
    FLATTEN_TRIM,
    SSR_HYDRATION_TRIMS,
    applyTrim,
    svelteRuntimeTrims,
} from './svelteRuntimeTrims';

const require = createRequire(import.meta.url);
const svelteRoot = dirname(require.resolve('svelte/package.json'));
const { version } = require('svelte/package.json') as { version: string };

function source(file: string): string {
    return readFileSync(join(svelteRoot, file.slice('svelte/'.length)), 'utf8');
}

type Blocker = { settled: boolean };
type Flatten = (
    blockers: Blocker[],
    sync: Array<() => unknown>,
    async: Array<() => Promise<unknown>>,
    fn: (values: unknown[]) => void,
) => void;

function patchedFlatten(): Flatten {
    const code = applyTrim(FLATTEN_TRIM, source(FLATTEN_TRIM.file));
    const start = code.indexOf('export function flatten(');
    const body = code
        .slice(start, code.indexOf('\n}', start) + 2)
        .replace('export ', '');
    return new Function(
        'is_runes',
        'derived',
        'derived_safe_equal',
        `${body}\nreturn flatten;`,
    )(
        () => true,
        (f: () => unknown) => ({ derived: f }),
        (f: () => unknown) => ({ safe: f }),
    ) as Flatten;
}

describe('SSR hydration trims', () => {
    it('fixes the SSR hydration flag off in the installed Svelte', () => {
        const [flag, entry] = SSR_HYDRATION_TRIMS;
        const code = applyTrim(flag, source(flag.file));
        expect(code).toContain('export const hydrating = false;');
        expect(code).toContain('export function set_hydrating(value) {}');
        expect(code).not.toContain('export let hydrating');

        const legacy = applyTrim(entry, source(entry.file));
        expect(legacy).toContain('this.#instance = mount(options.component, {');
        expect(legacy).not.toContain('options.hydrate ? hydrate : mount');
    });
});

describe('flatten trim', () => {
    it('replaces the whole of flatten in the installed Svelte', () => {
        const code = applyTrim(FLATTEN_TRIM, source(FLATTEN_TRIM.file));
        expect(code).not.toContain('async_derived(expression)');
        expect(code).toContain('export function run_after_blockers(');
    });

    it('passes settled blockers and sync values straight to fn', () => {
        const fn = vi.fn();
        const sync = [() => 1, () => 2];
        patchedFlatten()([{ settled: true }], sync, [], fn);
        expect(fn).toHaveBeenCalledWith([
            { derived: sync[0] },
            { derived: sync[1] },
        ]);
    });

    it('throws on an unsettled blocker', () => {
        const fn = vi.fn();
        expect(() =>
            patchedFlatten()(
                [{ settled: true }, { settled: false }],
                [],
                [],
                fn,
            ),
        ).toThrow(
            'triiiceratops: async template effects are not supported in the element build',
        );
        expect(fn).not.toHaveBeenCalled();
    });

    it('throws on an async expression', () => {
        expect(() =>
            patchedFlatten()([], [], [() => Promise.resolve(1)], vi.fn()),
        ).toThrow(/async template effects are not supported/);
    });
});

describe('applyTrim', () => {
    it('throws naming the file, Svelte version and expected text', () => {
        for (const trim of [...SSR_HYDRATION_TRIMS, FLATTEN_TRIM]) {
            const error = (() => {
                try {
                    applyTrim(trim, 'export const unrelated = 1;\n');
                } catch (e) {
                    return (e as Error).message;
                }
            })();
            expect(error).toContain(trim.file);
            expect(error).toContain(`svelte@${version}`);
            expect(error).toContain(trim.expected);
        }
    });

    it('throws when flatten has no closing brace after its sync path', () => {
        expect(() =>
            applyTrim(FLATTEN_TRIM, FLATTEN_TRIM.expected + '\n\t// …'),
        ).toThrow(FLATTEN_TRIM.file);
    });
});

describe('svelteRuntimeTrims', () => {
    type Hooks = {
        transform: (code: string, id: string) => { code: string } | null;
        buildEnd: (error?: Error) => void;
    };

    it('refuses a config with experimental.async on', () => {
        expect(() =>
            svelteRuntimeTrims({ experimental: { async: true } }),
        ).toThrow(/experimental\.async/);
    });

    it('fails the build when a trimmed module never reached it', () => {
        const plugin = svelteRuntimeTrims({}) as unknown as Hooks;
        const flag = SSR_HYDRATION_TRIMS[0];
        plugin.transform(source(flag.file), `/x/node_modules/${flag.file}`);
        expect(() => plugin.buildEnd()).toThrow(FLATTEN_TRIM.file);
        expect(() => plugin.buildEnd(new Error('earlier'))).not.toThrow();
    });

    it('leaves other modules alone', () => {
        const plugin = svelteRuntimeTrims({}) as unknown as Hooks;
        expect(plugin.transform('x', '/x/src/lib/hydration.js')).toBeNull();
    });
});
