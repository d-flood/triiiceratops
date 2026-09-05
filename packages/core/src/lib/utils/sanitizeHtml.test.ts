// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { isSafeUrl, renderIiifRichText } from './sanitizeHtml';

/**
 * These assert on the returned fragment's structure, never on a serialized
 * string. Serializing would test the DOM implementation's `innerHTML` as much as
 * the renderer, and the whole point of returning a fragment is that no string
 * round-trip happens.
 */

/** The fragment's children as `tag[attr=value,…]`, in document order. */
function shape(fragment: DocumentFragment): string[] {
    return Array.from(fragment.querySelectorAll('*')).map((element) => {
        const attributes = Array.from(element.attributes)
            .map((attribute) => `${attribute.name}=${attribute.value}`)
            .join(',');
        return attributes
            ? `${element.localName}[${attributes}]`
            : element.localName;
    });
}

describe('renderIiifRichText', () => {
    it('returns a DocumentFragment', () => {
        const fragment = renderIiifRichText('<p>hello</p>');

        expect(fragment).toBeInstanceOf(DocumentFragment);
        expect(fragment.textContent).toBe('hello');
    });

    it('keeps every element IIIF permits', () => {
        const fragment = renderIiifRichText(
            '<p>a<br><b>b</b><i>i</i><small>s</small>' +
                '<span>n</span><sub>sub</sub><sup>sup</sup>' +
                '<a href="https://example.org/">link</a>' +
                '<img src="https://example.org/i.png"></p>',
        );

        expect(shape(fragment)).toEqual([
            'p',
            'br',
            'b',
            'i',
            'small',
            'span',
            'sub',
            'sup',
            'a[href=https://example.org/]',
            'img[src=https://example.org/i.png]',
        ]);
    });

    it('keeps every attribute IIIF permits', () => {
        const fragment = renderIiifRichText(
            '<a href="https://example.org/" title="A title">x</a>' +
                '<img src="https://example.org/i.png" alt="Alt text">',
        );

        const anchor = fragment.querySelector('a');
        expect(anchor?.getAttribute('href')).toBe('https://example.org/');
        expect(anchor?.getAttribute('title')).toBe('A title');

        const image = fragment.querySelector('img');
        expect(image?.getAttribute('src')).toBe('https://example.org/i.png');
        expect(image?.getAttribute('alt')).toBe('Alt text');
    });

    it('drops a disallowed element but keeps its text', () => {
        const fragment = renderIiifRichText(
            '<div>outer <strong>bold</strong> <p>kept</p></div>',
        );

        // `div` and `strong` are gone; the `p` inside them survived, and no
        // character a reader was meant to see was lost.
        expect(shape(fragment)).toEqual(['p']);
        expect(fragment.textContent).toBe('outer bold kept');
    });

    it('drops a script element without executing or reproducing it', () => {
        // The leading character matters: with nothing before it a bare
        // `<script>` is parsed into `<head>`, which this renderer never walks,
        // and the test would pass without the raw-text rule doing any work.
        const fragment = renderIiifRichText(
            'before <script>globalThis.__pwned = true;</script>',
        );

        expect(shape(fragment)).toEqual([]);
        expect(fragment.textContent).toBe('before ');
        expect(
            (globalThis as unknown as Record<string, unknown>).__pwned,
        ).toBeUndefined();
    });

    it.each([
        ['<script>window.__x.push(1)</script>'],
        ['<style>body{display:none}</style>'],
        ['<noscript>noscript-source</noscript>'],
        ['<iframe>frame-source</iframe>'],
        ['<title>title-source</title>'],
        ['<textarea>textarea-source</textarea>'],
        ['<template>template-source</template>'],
        ['<svg><script>alert(1)</script></svg>'],
    ])('drops %s together with its contents', (payload) => {
        // Flattening these to text would paint attacker-chosen strings into
        // publisher-trusted chrome — source code read as prose. Nothing is
        // executed either way, so the hazard is spoofing, not XSS.
        const fragment = renderIiifRichText(`legit ${payload}`);

        expect(fragment.textContent).toBe('legit ');
    });

    it('drops raw text nested past the depth limit too', () => {
        const fragment = renderIiifRichText(
            `${'<span>'.repeat(500)}deep<script>window.__x.push(1)</script>${'</span>'.repeat(500)}`,
        );

        expect(fragment.textContent).toBe('deep');
    });

    it('drops disallowed attributes, event handlers included', () => {
        const fragment = renderIiifRichText(
            '<img src="https://example.org/i.png" onerror="globalThis.__pwned = true" id="x">' +
                '<a href="https://example.org/" target="_blank" onclick="alert(1)">x</a>',
        );

        expect(shape(fragment)).toEqual([
            'img[src=https://example.org/i.png]',
            'a[href=https://example.org/]',
        ]);
    });

    it.each([
        ['javascript:alert(1)'],
        ['JaVaScRiPt:alert(1)'],
        ['  javascript:alert(1)'],
        ['java\nscript:alert(1)'],
        ['data:text/html,<script>alert(1)</script>'],
        ['vbscript:msgbox(1)'],
        ['file:///etc/passwd'],
    ])('drops %s from href and src', (url) => {
        const anchor = renderIiifRichText(
            `<a href="${url}">text</a>`,
        ).querySelector('a');
        expect(anchor?.hasAttribute('href')).toBe(false);
        // A refused href leaves the anchor and its text in place.
        expect(anchor?.textContent).toBe('text');

        const image = renderIiifRichText(`<img src="${url}">`).querySelector(
            'img',
        );
        expect(image?.hasAttribute('src')).toBe(false);
    });

    it('keeps relative and protocol-relative URLs', () => {
        expect(
            renderIiifRichText('<a href="/page">x</a>')
                .querySelector('a')
                ?.getAttribute('href'),
        ).toBe('/page');

        expect(
            renderIiifRichText('<a href="//example.org/page">x</a>')
                .querySelector('a')
                ?.getAttribute('href'),
        ).toBe('//example.org/page');
    });

    it('never emits a style attribute, and never reads one', () => {
        const fragment = renderIiifRichText(
            '<p style="position:fixed;inset:0">' +
                '<a href="https://example.org/" style="background:url(javascript:1)">x</a>' +
                '<img src="https://example.org/i.png" style="width:100vw">' +
                '</p>',
        );

        expect(
            Array.from(fragment.querySelectorAll('*')).every(
                (element) => !element.hasAttribute('style'),
            ),
        ).toBe(true);
    });

    it.each([
        ['', 0],
        ['   ', 0],
        ['<p><b>unclosed', 2],
        ['<<<>>>', 0],
        ['</p></div>', 0],
    ])('renders %o without throwing', (input, elementCount) => {
        const fragment = renderIiifRichText(input);

        expect(fragment).toBeInstanceOf(DocumentFragment);
        expect(fragment.querySelectorAll('*').length).toBe(elementCount);
    });

    it('flattens pathologically deep nesting to text instead of overflowing', () => {
        const fragment = renderIiifRichText(
            `${'<span>'.repeat(500)}deep${'</span>'.repeat(500)}`,
        );

        expect(fragment.textContent).toBe('deep');
    });
});

describe('isSafeUrl', () => {
    it.each([
        'https://example.org/',
        'http://example.org/',
        'HTTPS://example.org/',
        'mailto:curator@example.org',
        '//example.org/page',
        '/page',
        'page',
        '#anchor',
        '?q=1',
        'path/with:colon',
    ])('accepts %s', (url) => {
        expect(isSafeUrl(url)).toBe(true);
    });

    it.each([
        'javascript:alert(1)',
        'JAVASCRIPT:alert(1)',
        'data:text/html,x',
        'vbscript:x',
        'file:///etc/passwd',
        'blob:https://example.org/x',
        '',
    ])('refuses %s', (url) => {
        expect(isSafeUrl(url)).toBe(false);
    });

    /*
     * A leading NUL is refused here, where the string reaches `isSafeUrl`
     * verbatim. It is deliberately *not* asserted through `renderIiifRichText`:
     * per the HTML spec the tokenizer replaces NUL in an attribute value with
     * U+FFFD, so what a real browser hands the renderer is `�javascript:…`,
     * whose leading character is not a C0 control and so survives the strip and
     * keeps its `href`. That is still safe — `new URL('�javascript:x', base)`
     * resolves as a relative path because U+FFFD is not an ASCII alpha, so the
     * URL parser never enters scheme state — but the DOM-level assertion would
     * be testing which substitution the environment performs, not this function.
     */
    it('refuses a URL hidden behind a leading NUL', () => {
        expect(isSafeUrl('\u0000javascript:alert(1)')).toBe(false);
    });

    it('refuses a nullish URL', () => {
        expect(isSafeUrl(null)).toBe(false);
        expect(isSafeUrl(undefined)).toBe(false);
    });
});
