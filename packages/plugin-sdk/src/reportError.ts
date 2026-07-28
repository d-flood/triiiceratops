import type { PluginError } from 'triiiceratops';

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
