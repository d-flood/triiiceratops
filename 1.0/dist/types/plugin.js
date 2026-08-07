/** The DOM event name for the structured plugin-failure channel. */
export const PLUGIN_ERROR_EVENT = 'pluginerror';
/**
 * The brand string every SDK plugin object carries under `kind`. Defined as a
 * plain literal (not a shared runtime import) so core detects SDK plugins
 * without importing the SDK at runtime, and the SDK brands plugins without
 * importing core at runtime.
 */
export const SDK_PLUGIN_KIND = 'triiiceratops-plugin';
/** Structural type guard: is this value an SDK plugin? */
export function isSdkPlugin(value) {
    return (typeof value === 'object' &&
        value !== null &&
        value.kind === SDK_PLUGIN_KIND &&
        typeof value.activate === 'function' &&
        typeof value.view === 'object');
}
