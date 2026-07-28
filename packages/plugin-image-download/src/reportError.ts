import { dispatchPluginCommandError } from '@triiiceratops/plugin-sdk';

export function reportImageDownloadError(
    node: EventTarget,
    error: unknown,
    retry: () => void,
): void {
    dispatchPluginCommandError(
        node,
        '@triiiceratops/plugin-image-download',
        '1.0.0-rc.0',
        error,
        retry,
    );
}
