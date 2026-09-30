import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

const SVELTE_VERSION: string = createRequire(import.meta.url)(
    'svelte/package.json',
).version;

interface Trim {
    file: string;
    expected: string;
    replacement: string;
    through?: string;
}

const SSR_HYDRATION_FILE = 'svelte/src/internal/client/dom/hydration.js';

const SSR_HYDRATION_FLAG = String.raw`export let hydrating = false;

/** @param {boolean} value */
export function set_hydrating(value) {
	hydrating = value;
}`;

const SSR_HYDRATION_OFF =
    'export const hydrating = false;\n\n/** @param {boolean} value */\nexport function set_hydrating(value) {}';

const FLATTEN_FILE = 'svelte/src/internal/client/reactivity/async.js';

const FLATTEN_SYNC_PATH = String.raw`export function flatten(blockers, sync, async, fn) {
	const d = is_runes() ? derived : derived_safe_equal;

	// Filter out already-settled blockers - no need to wait for them
	var pending = blockers.filter((b) => !b.settled);

	var deriveds = sync.map(d);

	if (DEV) {
		deriveds.forEach((d, i) => {
			// TODO this is kinda useful for debugging but a lousy implementation —
			// maybe the compiler could pass through the template string
			d.label = sync[i]
				.toString()
				.replace('() => ', '')
				.replaceAll('$.eager(() => ', '$state.eager(')
				.replace(/\$\.get\((.+?)\)/g, (_, id) => id);
		});
	}

	if (async.length === 0 && pending.length === 0) {
		fn(deriveds);
		return;
	}`;

const FLATTEN_SYNC_ONLY = String.raw`export function flatten(blockers, sync, async, fn) {
	if (async.length > 0 || blockers.some((b) => !b.settled)) {
		throw Error("triiiceratops: async template effects are not supported in the element build");
	}
	fn(sync.map(is_runes() ? derived : derived_safe_equal));
}`;

export const SSR_HYDRATION_TRIMS: Trim[] = [
    {
        file: SSR_HYDRATION_FILE,
        expected: SSR_HYDRATION_FLAG,
        replacement: SSR_HYDRATION_OFF,
    },
    // `hydrate()` is not guarded by the flag. Svelte's internals still import
    // this module, though the element never constructs a legacy component.
    {
        file: 'svelte/src/legacy/legacy-client.js',
        expected:
            'this.#instance = (options.hydrate ? hydrate : mount)(options.component, {',
        replacement: 'this.#instance = mount(options.component, {',
    },
];

// Only the synchronous prefix is matched; the async remainder is dropped up to
// the function's closing column-0 brace.
export const FLATTEN_TRIM: Trim = {
    file: FLATTEN_FILE,
    expected: FLATTEN_SYNC_PATH,
    replacement: FLATTEN_SYNC_ONLY,
    through: '\n}',
};

function unmatched(file: string, expected: string): Error {
    return new Error(
        `${file} in svelte@${SVELTE_VERSION} no longer contains the text this element-build trim patches. ` +
            `Re-derive the trim in src/packaging/svelteRuntimeTrims.ts against the new source. Expected:\n${expected}`,
    );
}

export function applyTrim(trim: Trim, code: string): string {
    const start = code.indexOf(trim.expected);
    if (start === -1 || code.indexOf(trim.expected, start + 1) !== -1) {
        throw unmatched(trim.file, trim.expected);
    }
    let end = start + trim.expected.length;
    if (trim.through) {
        const through = code.indexOf(trim.through, end);
        if (through === -1) throw unmatched(trim.file, trim.through);
        end = through + trim.through.length;
    }
    return code.slice(0, start) + trim.replacement + code.slice(end);
}

export function svelteRuntimeTrims(compilerOptions: {
    experimental?: { async?: boolean };
}): Plugin {
    if (compilerOptions.experimental?.async) {
        throw new Error(
            "The element builds make Svelte's flatten synchronous-only, so compilerOptions.experimental.async must stay off.",
        );
    }
    const trims = [...SSR_HYDRATION_TRIMS, FLATTEN_TRIM];
    const applied = new Set<Trim>();
    return {
        name: 'triiiceratops:svelte-runtime-trims',
        enforce: 'pre',
        transform(code, id) {
            const trim = trims.find((t) => id.endsWith('/' + t.file));
            if (!trim) return null;
            applied.add(trim);
            return { code: applyTrim(trim, code), map: null };
        },
        buildEnd(error) {
            if (error) return;
            const missed = trims.filter((t) => !applied.has(t));
            if (missed.length > 0) {
                throw new Error(
                    `No module ending in ${missed.map((t) => t.file).join(', ')} reached the svelte@${SVELTE_VERSION} element build, so its runtime trim never ran.`,
                );
            }
        },
    };
}
