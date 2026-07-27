import type { RequestConfig } from '../types/config';

export async function fetchJson(url: string, requestConfig?: RequestConfig) {
    const response = await fetch(url, {
        headers: requestConfig?.headers,
        credentials: requestConfig?.withCredentials
            ? 'include'
            : 'same-origin',
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}
