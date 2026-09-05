import type { PluginError } from 'triiiceratops';

/**
 * Bind {@link dispatchPluginCommandError} to one plugin's identity.
 *
 * Every plugin that reports command failures had its own copy of the same
 * thirteen lines, differing only in the name and version literals it passed —
 * and because the version was written out a second time there, it drifted from
 * the one the plugin declares to `definePlugin`. Pass the same meta object to
 * both and there is one place the identity can be wrong.
 */
export function createCommandErrorReporter(meta: {
    name: string;
    version: string;
}): (node: EventTarget, error: unknown, retry: () => void) => void {
    return (node, error, retry) =>
        dispatchPluginCommandError(node, meta.name, meta.version, error, retry);
}

/** Dispatch an actionable plugin command failure on the host error channel. */
export function dispatchPluginCommandError(
    node: EventTarget,
    pluginName: string,
    pluginVersion: string,
    error: unknown,
    retry: () => void,
): void {
    const detail: PluginError = {
        pluginName,
        pluginVersion,
        phase: 'command',
        error,
        retry,
    };
    node.dispatchEvent(
        new CustomEvent('pluginerror', {
            detail,
            bubbles: true,
            composed: true,
        }),
    );
}
