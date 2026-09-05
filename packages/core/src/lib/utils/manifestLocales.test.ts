import { describe, expect, it } from 'vitest';

import { collectManifestLocales } from './manifestLocales';

/**
 * The language picker's gate: which languages a document is authored in.
 * Getting this wrong shows a picker on a monolingual manifest (a radio menu
 * with one item) or hides it on a multilingual one.
 */
describe('collectManifestLocales', () => {
    it('collects v3 language-map keys across the descriptive properties', () => {
        expect(
            collectManifestLocales({
                label: { en: ['Book'], fr: ['Livre'] },
                summary: { en: ['A book'], de: ['Ein Buch'] },
                requiredStatement: {
                    label: { en: ['Attribution'] },
                    value: { it: ['Biblioteca'] },
                },
                metadata: [
                    { label: { en: ['Author'] }, value: { es: ['Autor'] } },
                ],
            }),
        ).toEqual(['de', 'en', 'es', 'fr', 'it']);
    });

    it('collects range labels at any depth', () => {
        expect(
            collectManifestLocales({
                label: { en: ['Book'] },
                structures: [
                    {
                        label: { fr: ['Chapitre 1'] },
                        items: [{ label: { cy: ['Pennod'] } }],
                    },
                ],
            }),
        ).toEqual(['cy', 'en', 'fr']);
    });

    it('reads the v2 @language spellings', () => {
        expect(
            collectManifestLocales({
                label: [
                    { '@value': 'Book', '@language': 'en' },
                    { '@value': 'Livre', '@language': 'fr' },
                ],
                description: { '@value': 'Ein Buch', '@language': 'de' },
                attribution: 'Some library',
            }),
        ).toEqual(['de', 'en', 'fr']);
    });

    it("excludes 'none', which names no language a reader could pick", () => {
        // A manifest labelled `en` alongside an unlanguaged value is
        // monolingual: one choice, so the picker must stay hidden.
        expect(
            collectManifestLocales({
                label: { en: ['Book'], none: ['MS 42'] },
                summary: { none: ['Untitled'] },
            }),
        ).toEqual(['en']);
    });

    it('returns nothing for a document with no language-tagged values', () => {
        expect(collectManifestLocales({ label: 'Book' })).toEqual([]);
        expect(collectManifestLocales(null)).toEqual([]);
        expect(collectManifestLocales('not a manifest')).toEqual([]);
    });
});
