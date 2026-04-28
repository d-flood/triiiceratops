import { describe, expect, it, vi } from 'vitest';

import { createPluginId } from './pluginId';

describe('createPluginId', () => {
    it('prefixes explicit seeds', () => {
        expect(createPluginId('custom-seed')).toBe('plugin-custom-seed');
    });

    it('generates the same format as the previous inline fallback', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

        expect(createPluginId()).toMatch(/^plugin-[a-z0-9]+$/);
    });
});
