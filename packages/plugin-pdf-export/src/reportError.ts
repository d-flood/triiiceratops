import { dispatchPluginCommandError } from '@triiiceratops/plugin-sdk';

export function reportPdfExportError(
    node: EventTarget,
    error: unknown,
    retry: () => void,
): void {
    dispatchPluginCommandError(
        node,
        '@triiiceratops/plugin-pdf-export',
        '1.0.0-rc.0',
        error,
        retry,
    );
}
