export async function fetchJson(url, requestConfig) {
    const response = await fetch(url, {
        headers: requestConfig?.headers,
        credentials: requestConfig?.withCredentials ? 'include' : 'same-origin',
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}
