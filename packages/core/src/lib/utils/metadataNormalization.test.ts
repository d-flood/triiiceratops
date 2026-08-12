import { describe, expect, it } from 'vitest';

import {
    normalizeDescriptiveMetadata,
    normalizeIiifLinks,
    normalizeMetadataEntries,
} from './metadataNormalization';

describe('normalizeDescriptiveMetadata — IIIF v3', () => {
    const v3 = {
        id: 'https://ex/manifest',
        type: 'Manifest',
        label: { en: ['A Manifest'] },
        summary: { en: ['A summary.'] },
        metadata: [{ label: { en: ['Date'] }, value: { en: ['1503'] } }],
        requiredStatement: {
            label: { en: ['Held by'] },
            value: { en: ['A Library'] },
        },
        rights: 'https://creativecommons.org/licenses/by/4.0/',
        provider: [
            {
                id: 'https://ex/provider',
                label: { en: ['A Library'] },
                homepage: [{ id: 'https://ex/home', label: { en: ['Home'] } }],
                logo: [{ id: 'https://ex/logo.png' }],
            },
        ],
        homepage: [{ id: 'https://ex/page', label: { en: ['Page'] } }],
        rendering: [{ id: 'https://ex/f.pdf', label: { en: ['PDF'] } }],
        seeAlso: [{ id: 'https://ex/data.json', label: { en: ['Data'] } }],
    };

    it('reads every field', () => {
        const d = normalizeDescriptiveMetadata(v3, 'en');

        expect(d.title).toBe('A Manifest');
        expect(d.summary).toBe('A summary.');
        expect(d.metadata).toEqual([{ label: 'Date', value: '1503' }]);
        expect(d.attributionLabel).toBe('Held by');
        expect(d.attribution).toBe('A Library');
        expect(d.license).toBe('https://creativecommons.org/licenses/by/4.0/');
        expect(d.providers).toHaveLength(1);
        expect(d.providers[0].label).toBe('A Library');
        expect(d.providers[0].logos).toEqual(['https://ex/logo.png']);
        expect(d.providers[0].links[0].id).toBe('https://ex/home');
        expect(d.homepages[0].label).toBe('Page');
        expect(d.rendering[0].label).toBe('PDF');
        expect(d.seeAlso[0].label).toBe('Data');
    });
});

describe('normalizeDescriptiveMetadata — IIIF v2', () => {
    // The v2 spellings that had no reader once the manifest library was
    // removed: `description`, bare `attribution`, `license`, `@id` logos.
    const v2 = {
        '@id': 'https://ex/manifest',
        '@type': 'sc:Manifest',
        label: 'A Manifest',
        description: 'A summary.',
        metadata: [{ label: 'Date', value: '1503' }],
        attribution: 'Provided by A Library',
        license: 'https://rightsstatements.org/vocab/NoC-US/1.0/',
    };

    it('reads description as the summary', () => {
        expect(normalizeDescriptiveMetadata(v2).summary).toBe('A summary.');
    });

    it('reads a bare attribution, which carries no label of its own', () => {
        const d = normalizeDescriptiveMetadata(v2);
        expect(d.attribution).toBe('Provided by A Library');
        expect(d.attributionLabel).toBe('');
    });

    it('reads license where v3 spells it rights', () => {
        expect(normalizeDescriptiveMetadata(v2).license).toBe(
            'https://rightsstatements.org/vocab/NoC-US/1.0/',
        );
    });

    it('takes the first of several v2 licenses', () => {
        const d = normalizeDescriptiveMetadata({
            license: ['https://ex/first', 'https://ex/second'],
        });
        expect(d.license).toBe('https://ex/first');
    });

    it('drops a non-URI license rather than rendering an object', () => {
        expect(
            normalizeDescriptiveMetadata({ license: { '@id': 'https://ex/x' } })
                .license,
        ).toBe('');
    });

    it('reads a bare-object provider and an @id logo', () => {
        const d = normalizeDescriptiveMetadata({
            provider: {
                '@id': 'https://ex/provider',
                label: 'A Library',
                logo: 'https://ex/logo.png',
            },
        });
        expect(d.providers).toHaveLength(1);
        expect(d.providers[0].logos).toEqual(['https://ex/logo.png']);

        const objectLogo = normalizeDescriptiveMetadata({
            provider: { label: 'L', logo: { '@id': 'https://ex/l.png' } },
        });
        expect(objectLogo.providers[0].logos).toEqual(['https://ex/l.png']);
    });
});

describe('normalizeDescriptiveMetadata — absent and malformed input', () => {
    it('returns empties for no resource', () => {
        const d = normalizeDescriptiveMetadata(null);
        expect(d).toEqual({
            title: '',
            summary: '',
            metadata: [],
            attributionLabel: '',
            attribution: '',
            license: '',
            providers: [],
            homepages: [],
            rendering: [],
            seeAlso: [],
        });
    });

    it('applies no display fallback — that is the reader"s choice', () => {
        expect(normalizeDescriptiveMetadata({}).title).toBe('');
    });

    it('ignores a non-array metadata property', () => {
        expect(
            normalizeDescriptiveMetadata({ metadata: { label: 'x' } }).metadata,
        ).toEqual([]);
    });
});

describe('normalizeIiifLinks', () => {
    it('reads a bare string, a bare object and an array', () => {
        expect(normalizeIiifLinks('https://ex/a')).toEqual([
            { id: 'https://ex/a', label: 'https://ex/a' },
        ]);
        expect(
            normalizeIiifLinks({ '@id': 'https://ex/b', label: 'B' }),
        ).toMatchObject([{ id: 'https://ex/b', label: 'B' }]);
        expect(normalizeIiifLinks([])).toEqual([]);
        expect(normalizeIiifLinks(undefined)).toEqual([]);
    });

    it('falls back from label to format to id', () => {
        expect(
            normalizeIiifLinks({
                id: 'https://ex/f',
                format: 'application/pdf',
            }),
        ).toMatchObject([{ label: 'application/pdf' }]);
        expect(normalizeIiifLinks({ id: 'https://ex/f' })).toMatchObject([
            { label: 'https://ex/f' },
        ]);
    });

    it('drops entries with no id', () => {
        expect(normalizeIiifLinks([{ label: 'no id' }])).toEqual([]);
    });
});

describe('normalizeMetadataEntries', () => {
    it('reads label/value in both versions', () => {
        expect(
            normalizeMetadataEntries([
                { label: 'Date', value: '1503' },
                { label: { en: ['Author'] }, value: { en: ['Anon'] } },
            ]),
        ).toEqual([
            { label: 'Date', value: '1503' },
            { label: 'Author', value: 'Anon' },
        ]);
    });

    it('joins several values for one entry', () => {
        expect(
            normalizeMetadataEntries([
                { label: 'Subject', value: { en: ['One', 'Two'] } },
            ])[0].value,
        ).toBe('One<br />Two');
    });

    it('returns empty for absent or non-array input', () => {
        expect(normalizeMetadataEntries(undefined)).toEqual([]);
        expect(normalizeMetadataEntries({})).toEqual([]);
    });
});
