/**
 * The `ViewerConfig.debug` bridge: how a framework consumer's `debug` flag
 * reaches the WRAPPER-side logger.
 *
 * ## Why a bridge is needed at all
 *
 * `configureLogging` has exactly one product call site — `TriiiceratopsViewer`
 * — and that component ships inside `dist/triiiceratops-element.js`, a fully
 * self-contained bundle with no static imports that inlines its own copy of
 * `logging/logger.js`. The framework substrate, the React and Vue wrappers, and
 * the selector runtime are a DIFFERENT module graph (`dist/framework/*.js`,
 * `dist/react.js`, `dist/vue.js`, `dist/state/selectors/*.js`) importing
 * `dist/logging/logger.js` — a second logger instance whose `debugEnabled`
 * nothing in the published package ever writes.
 *
 * So `config: { debug: true }` used to configure the element's logger and leave
 * the wrapper's at `false` forever. Every wrapper-side development warning —
 * the unbound handle, the unmemoized property-tier prop, the second
 * availability event, the `state`-cadence projection reading through `osd` —
 * was unreachable in the published package while passing its unit test, because
 * under vitest the two "instances" are one module.
 *
 * Bridging here rather than exporting `configureLogging` from `./react` and
 * `./vue` keeps the public API unchanged and keeps the switch where the guides
 * already say it is: `ViewerConfig.debug`.
 *
 * ## The rule
 *
 * When the applier WRITES the `config` property-tier value, resolve that value
 * the way the element does (object, or JSON string) and, **if it carries a
 * `debug` key**, set the wrapper-side logger to `Boolean(config.debug)`.
 *
 * The cases that rule has to cover, and what it does with each:
 *
 * - **`config` supplied as a JSON string.** Parsed here exactly as the element
 *   parses it. A string that does not parse, or parses to something that is not
 *   an object, is not an opinion: the element ignores it too, so the flag is
 *   left alone rather than guessed at.
 * - **`config` absent entirely.** The applier never writes an input that has
 *   never been supplied, so this function is never called and the flag keeps
 *   its default (`false`) — or whatever another viewer on the page set.
 * - **`config` present but with no `debug` key.** Not an opinion either. This
 *   is the one place the bridge deliberately differs from the element, which
 *   collapses a missing key to `false` (`config?.debug ?? false`): a second
 *   viewer configured `{ locale: 'fr' }` must not silently switch off the
 *   diagnostics a first viewer asked for. Write `debug: false` to turn them
 *   off.
 * - **`config` changing after mount.** The applier is edge-triggered, so every
 *   genuine change re-runs this, including `{ debug: true }` → `{ debug: false }`
 *   and `{ debug: true }` → cleared. (Clearing the input writes `undefined`,
 *   which resolves to no opinion, so it leaves the flag on; supply
 *   `{ debug: false }` to turn it off.)
 * - **More than one wrapper on a page disagreeing.** Debug mode is a
 *   page-level developer diagnostic with ONE flag per module instance, so the
 *   most recently applied opinion wins — the same rule `configureLogging`
 *   already documents and the same rule the element bundle's own copy follows.
 *
 * The flag is one-way, wrapper-side only. It never reads back, never fights the
 * element bundle's own copy, and is not a public API.
 */

import { configureLogging } from '../logging/logger.js';

/**
 * The `debug` opinion carried by a `config` property-tier value, or `undefined`
 * when the value states none. Exported for tests; the applier uses
 * {@link bridgeViewerDebugFlag}.
 */
export function viewerConfigDebugFlag(value: unknown): boolean | undefined {
    const config = resolveConfigObject(value);
    if (!config) return undefined;
    if (!('debug' in config)) return undefined;
    return Boolean(config.debug);
}

/**
 * Apply a `config` value's `debug` opinion, if it has one, to the wrapper-side
 * logger. A no-op when it has none.
 */
export function bridgeViewerDebugFlag(value: unknown): void {
    const debug = viewerConfigDebugFlag(value);
    if (debug === undefined) return;
    configureLogging({ debug });
}

/**
 * Resolve a `config` input to the object the element would see: an object is
 * itself, a JSON string is parsed, and everything else — including a string
 * that fails to parse or parses to a non-object — is no config at all.
 */
function resolveConfigObject(
    value: unknown,
): Record<string, unknown> | undefined {
    if (typeof value === 'string') {
        if (value === '') return undefined;
        let parsed: unknown;
        try {
            parsed = JSON.parse(value);
        } catch {
            return undefined;
        }
        return isObject(parsed) ? parsed : undefined;
    }
    return isObject(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
