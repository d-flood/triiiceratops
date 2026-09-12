// svgIcon validation tests.
//
// Valid SVG is accepted and reduced to { kind, inner, viewBox }; each rejection
// class throws SYNCHRONOUSLY with a message naming the offense.

import { describe, expect, it } from 'vitest';

import { svgIcon, SvgIconError } from './svgIcon.js';

describe('svgIcon — accepts valid SVG', () => {
    it('extracts inner markup and viewBox', () => {
        const icon = svgIcon(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 2"></path></svg>',
        );
        expect(icon.kind).toBe('svg');
        expect(icon.viewBox).toBe('0 0 24 24');
        expect(icon.inner).toBe('<path d="M1 2"></path>');
    });

    it('allows internal #fragment href references', () => {
        expect(() =>
            svgIcon('<svg viewBox="0 0 1 1"><use href="#glyph"></use></svg>'),
        ).not.toThrow();
    });

    it('derives a viewBox from width/height when none is declared', () => {
        const icon = svgIcon('<svg width="16" height="16"><g></g></svg>');
        expect(icon.viewBox).toBe('0 0 16 16');
    });

    it('falls back to a default viewBox when neither viewBox nor size is present', () => {
        const icon = svgIcon('<svg><g></g></svg>');
        expect(icon.viewBox).toBe('0 0 24 24');
    });

    it('handles a self-closing <svg/> (empty inner)', () => {
        const icon = svgIcon('<svg viewBox="0 0 4 4"/>');
        expect(icon.inner).toBe('');
        expect(icon.viewBox).toBe('0 0 4 4');
    });

    it('handles an empty <svg></svg> (empty inner, no stray closing tag)', () => {
        const icon = svgIcon('<svg viewBox="0 0 1 1"></svg>');
        expect(icon.inner).toBe('');
        expect(icon.viewBox).toBe('0 0 1 1');
    });
});

describe('svgIcon — rejects developer errors synchronously', () => {
    it('rejects <script>', () => {
        expect(() =>
            svgIcon('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'),
        ).toThrow(/script/i);
    });

    it('rejects on* event-handler attributes', () => {
        expect(() =>
            svgIcon('<svg viewBox="0 0 1 1" onload="x()"></svg>'),
        ).toThrow(/on\*|onload/i);
    });

    it('rejects external href URLs', () => {
        expect(() =>
            svgIcon(
                '<svg viewBox="0 0 1 1"><image href="https://evil.example/x.png"></image></svg>',
            ),
        ).toThrow(/href/i);
    });

    it('rejects external xlink:href URLs', () => {
        expect(() =>
            svgIcon(
                '<svg viewBox="0 0 1 1"><use xlink:href="http://x/y#a"></use></svg>',
            ),
        ).toThrow(/href/i);
    });

    it('rejects <foreignObject>', () => {
        expect(() =>
            svgIcon(
                '<svg viewBox="0 0 1 1"><foreignObject><div>hi</div></foreignObject></svg>',
            ),
        ).toThrow(/foreignObject/i);
    });

    it('rejects input with no <svg> root', () => {
        expect(() => svgIcon('<div>not an svg</div>')).toThrow(SvgIconError);
    });

    it('rejects an empty string', () => {
        expect(() => svgIcon('   ')).toThrow(SvgIconError);
    });

    it('throws the branded SvgIconError type', () => {
        try {
            svgIcon('<svg><script></script></svg>');
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(SvgIconError);
            expect((e as Error).message).toMatch(/^svgIcon:/);
        }
    });
});
