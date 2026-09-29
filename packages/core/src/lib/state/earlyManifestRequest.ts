import type { RequestConfig } from '../types/config';
import { manifestsState } from './manifests.svelte';

const requests = new WeakMap<object, { id: string; request: Promise<any> }>();

export function startManifestRequest(
    owner: object,
    manifestId: string,
    requestConfig?: RequestConfig,
): void {
    if (typeof window === 'undefined') return;
    const request = manifestsState.fetchResource(manifestId, requestConfig);
    request.catch(() => {});
    requests.set(owner, { id: manifestId, request });
}

export function takeManifestRequest(
    owner: object,
    manifestId: string,
): Promise<any> | undefined {
    const early = requests.get(owner);
    requests.delete(owner);
    return early?.id === manifestId ? early.request : undefined;
}
