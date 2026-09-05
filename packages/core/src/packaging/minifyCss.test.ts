import { describe, it, expect } from 'vitest';

import { minifyCss, minifyCssPreprocessor } from './minifyCss';

describe('minifyCss', () => {
    it('strips comments', () => {
        expect(minifyCss('/* a note */\n.a {\n color: red;\n}')).toBe(
            '.a{color: red;}',
        );
    });

    it('keeps the space a descendant combinator before a pseudo-class needs', () => {
        expect(minifyCss('.menu-item :global(svg) {\n fill: red;\n}')).toBe(
            '.menu-item :global(svg){fill: red;}',
        );
    });

    it('keeps calc() operators separated', () => {
        expect(minifyCss('.a {\n --tt-off: calc(100% + 0.5rem);\n}')).toBe(
            '.a{--tt-off: calc(100% + 0.5rem);}',
        );
    });

    it('leaves a space where a comment separated two tokens', () => {
        expect(minifyCss('.a/* between */.b { color: red; }')).toBe(
            '.a .b{color: red;}',
        );
        expect(minifyCss('.a { margin: 0/* between */auto; }')).toBe(
            '.a{margin: 0 auto;}',
        );
    });

    it('copies string literals verbatim, including ones containing /*', () => {
        expect(
            minifyCss('.a::before { content: "/* not a comment */"; }'),
        ).toBe('.a::before{content: "/* not a comment */";}');
        expect(minifyCss(".a::before { content: '  two  spaces  '; }")).toBe(
            ".a::before{content: '  two  spaces  ';}",
        );
    });

    it('does not treat an escaped quote as the end of a string', () => {
        expect(minifyCss('.a::before { content: "a\\"/* x */b"; }')).toBe(
            '.a::before{content: "a\\"/* x */b";}',
        );
    });

    it('copies url() arguments verbatim', () => {
        expect(
            minifyCss(
                '.a { background: url(data:image/svg+xml;base64,AA==); }',
            ),
        ).toBe('.a{background: url(data:image/svg+xml;base64,AA==);}');
    });

    it('copies url() arguments verbatim after an identifier, not only after a colon', () => {
        // The whitespace before `url(` is pending, not yet emitted, when the
        // scanner decides whether this is a url token. Reading the last emitted
        // character would see the `d` of `red` and treat it as `…durl(`.
        expect(
            minifyCss('.a { background: red url(http://x/a/*b*/c.png); }'),
        ).toBe('.a{background: red url(http://x/a/*b*/c.png);}');
        expect(
            minifyCss('.a { background: #fff url(a  b.png) no-repeat; }'),
        ).toBe('.a{background: #fff url(a  b.png) no-repeat;}');
    });

    it('recognises url() in any case', () => {
        expect(minifyCss('.a{ background: red URL(a/*b*/c.png) }')).toBe(
            '.a{background: red URL(a/*b*/c.png)}',
        );
    });

    it('does not treat the tail of a longer function name as url()', () => {
        // `myurl(` is not a URL token, so its argument is ordinary CSS: the
        // comment goes, and the whitespace inside collapses.
        expect(minifyCss('.a { background: myurl(a/*b*/c   d); }')).toBe(
            '.a{background: myurl(a c d);}',
        );
        expect(minifyCss('.a { background: -my-url(a/*b*/c); }')).toBe(
            '.a{background: -my-url(a c);}',
        );
    });

    it('collapses runs of whitespace to a single space', () => {
        expect(minifyCss('.a   >   .b { margin: 0    auto; }')).toBe(
            '.a > .b{margin: 0 auto;}',
        );
    });

    it('drops whitespace only next to {, } and ;', () => {
        expect(minifyCss('.a {\n color : red ;\n width: 1px;\n}\n.b {}')).toBe(
            '.a{color : red;width: 1px;}.b{}',
        );
    });

    it('preserves at-rules and nested blocks', () => {
        expect(
            minifyCss(
                '@media (min-width: 40rem) {\n  /* wide */\n  .a { color: red; }\n}',
            ),
        ).toBe('@media (min-width: 40rem){.a{color: red;}}');
    });

    it('returns an empty string for a stylesheet that is only comments', () => {
        expect(minifyCss('/* just a note */\n\n')).toBe('');
    });

    it('leaves an unterminated comment out rather than throwing', () => {
        expect(minifyCss('.a { color: red; } /* unterminated')).toBe(
            '.a{color: red;}',
        );
    });
});

describe('minifyCssPreprocessor', () => {
    it('minifies a style block', () => {
        const preprocessor = minifyCssPreprocessor();
        expect(
            preprocessor.style?.({
                content: '/* note */ .a { color: red; }',
                attributes: {},
                markup: '',
                filename: 'Fake.svelte',
            }),
        ).toEqual({ code: '.a{color: red;}' });
    });

    it('leaves a style block in another language alone', () => {
        const preprocessor = minifyCssPreprocessor();
        expect(
            preprocessor.style?.({
                content: '/* note */ .a { color: red; }',
                attributes: { lang: 'scss' },
                markup: '',
                filename: 'Fake.svelte',
            }),
        ).toBeUndefined();
    });
});
