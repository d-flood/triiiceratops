import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchJson } from './fetchJson';

describe('fetchJson', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('passes through request config and returns parsed json', async () => {
        const payload = { ok: true };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => payload,
        } as Response);

        await expect(
            fetchJson('https://example.org/manifest', {
                headers: { Authorization: 'Bearer token' },
                withCredentials: true,
            }),
        ).resolves.toEqual(payload);

        expect(mockFetch).toHaveBeenCalledWith('https://example.org/manifest', {
            headers: { Authorization: 'Bearer token' },
            credentials: 'include',
        });
    });

    it('throws the same HTTP status error shape used by manifest loading', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
        } as Response);

        await expect(fetchJson('https://example.org/manifest')).rejects.toThrow(
            'HTTP error! status: 403',
        );
    });
});
