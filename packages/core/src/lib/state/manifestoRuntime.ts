export type ManifestoModule = typeof import('manifesto.js');

let manifestoModulePromise: Promise<ManifestoModule> | null = null;

export async function loadManifestoModule(): Promise<ManifestoModule> {
    if (typeof window === 'undefined') {
        return import('manifesto.js');
    }

    manifestoModulePromise ??= import('./manifestoRuntime.browser').then(
        ({ manifestoModule }) => manifestoModule,
    );

    return manifestoModulePromise;
}
