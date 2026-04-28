import { describe, expect, it, vi } from 'vitest';

import { parseJsonProp } from './jsonProp';

describe('parseJsonProp', () => {
    it('parses valid JSON values', () => {
        expect(
            parseJsonProp<{ enabled: boolean }>('{"enabled":true}', {
                fallback: { enabled: false },
                label: 'config',
            }),
        ).toEqual({ enabled: true });
    });

    it('returns the fallback and reports errors for invalid JSON', () => {
        const onError = vi.fn();

        expect(
            parseJsonProp<{ enabled: boolean }>('not-json', {
                fallback: { enabled: false },
                label: 'config',
                onError,
            }),
        ).toEqual({ enabled: false });
        expect(onError).toHaveBeenCalledWith(
            'Invalid config JSON: "not-json". Ignoring.',
        );
    });
});
