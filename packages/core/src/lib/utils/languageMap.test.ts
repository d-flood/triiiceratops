import { describe, expect, it } from 'vitest';

import { resolveAllLanguageValues, resolveLanguageValue } from './languageMap';

describe('resolveLanguageValue', () => {
    it('returns empty for absent values', () => {
        expect(resolveLanguageValue(undefined)).toBe('');
        expect(resolveLanguageValue(null)).toBe('');
        expect(resolveLanguageValue('')).toBe('');
    });

    it('passes a v2 bare string through', () => {
        expect(resolveLanguageValue('Chapter 1')).toBe('Chapter 1');
    });

    describe('v3 language map', () => {
        const map = { en: ['English'], fr: ['Français'], de: ['Deutsch'] };

        it('prefers the requested locale', () => {
            expect(resolveLanguageValue(map, 'fr')).toBe('Français');
        });

        it('falls back to en when the locale is absent', () => {
            expect(resolveLanguageValue(map, 'sv')).toBe('English');
        });

        it('falls back to none, then to the first key', () => {
            expect(resolveLanguageValue({ none: ['Untagged'] }, 'sv')).toBe(
                'Untagged',
            );
            expect(resolveLanguageValue({ sv: ['Bild 6'] }, 'fr')).toBe(
                'Bild 6',
            );
        });

        it('takes the first entry of a multi-value language', () => {
            expect(resolveLanguageValue({ en: ['One', 'Two'] })).toBe('One');
        });

        it('reads a non-array language entry', () => {
            expect(resolveLanguageValue({ en: 'Bare' })).toBe('Bare');
        });

        it('returns empty for an empty map', () => {
            expect(resolveLanguageValue({})).toBe('');
        });
    });

    describe('v2 JSON-LD value object', () => {
        it('reads @value', () => {
            expect(
                resolveLanguageValue({
                    '@value': 'Kapitel 1',
                    '@language': 'de',
                }),
            ).toBe('Kapitel 1');
        });

        it('reads an array @value', () => {
            expect(
                resolveLanguageValue({ '@value': ['First', 'Second'] }),
            ).toBe('First');
        });
    });

    describe('v2 JSON-LD array', () => {
        // The spelling that fell back to "Canvas N" once canvases became raw
        // JSON rather than library objects.
        const items = [
            { '@value': 'Bild 6', '@language': 'sv' },
            { '@value': 'Image 6', '@language': 'en' },
        ];

        it('matches @language against the requested locale', () => {
            expect(resolveLanguageValue(items, 'sv')).toBe('Bild 6');
        });

        it('falls back to the en entry', () => {
            expect(resolveLanguageValue(items, 'fr')).toBe('Image 6');
        });

        it('prefers an untagged entry over an arbitrary one', () => {
            expect(
                resolveLanguageValue(
                    [
                        { '@value': 'Tagged', '@language': 'de' },
                        { '@value': 'Plain' },
                    ],
                    'fr',
                ),
            ).toBe('Plain');
        });

        it('reads a plain string array', () => {
            expect(resolveLanguageValue(['First', 'Second'])).toBe('First');
        });

        it('falls back to the first item when nothing matches', () => {
            expect(
                resolveLanguageValue(
                    [{ '@value': 'Only', '@language': 'de' }],
                    'fr',
                ),
            ).toBe('Only');
        });
    });
});

describe('resolveAllLanguageValues', () => {
    it('returns every value for the chosen language', () => {
        expect(
            resolveAllLanguageValues({ en: ['One', 'Two'], fr: ['Un'] }, 'en'),
        ).toEqual(['One', 'Two']);
    });

    it('falls back through en and none', () => {
        expect(resolveAllLanguageValues({ en: ['One'] }, 'sv')).toEqual([
            'One',
        ]);
        expect(resolveAllLanguageValues({ none: ['Untagged'] }, 'sv')).toEqual([
            'Untagged',
        ]);
    });

    it('returns every matching entry of a v2 array', () => {
        expect(
            resolveAllLanguageValues(
                [
                    { '@value': 'A', '@language': 'en' },
                    { '@value': 'B', '@language': 'en' },
                    { '@value': 'C', '@language': 'de' },
                ],
                'en',
            ),
        ).toEqual(['A', 'B']);
    });

    it('returns empty for absent values', () => {
        expect(resolveAllLanguageValues(undefined)).toEqual([]);
        expect(resolveAllLanguageValues(null)).toEqual([]);
    });

    it('wraps a bare string', () => {
        expect(resolveAllLanguageValues('Plain')).toEqual(['Plain']);
    });
});
