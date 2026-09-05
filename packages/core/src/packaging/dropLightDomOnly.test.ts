import { describe, it, expect } from 'vitest';
import dropLightDomOnly, { type CssComment } from './dropLightDomOnly';

/**
 * Stand-ins for the PostCSS shapes this plugin touches. Same reason
 * `scopeViewerRoot` uses structural types: the plugin needs no `postcss`
 * dependency, so neither does its test.
 *
 * `next()` is modelled the way PostCSS implements it — the next SIBLING node of
 * any type, not the next rule — because every way this plugin can misfire is a
 * marker whose sibling turns out to be something other than a rule.
 */
function marked(text: string, nextType = 'rule') {
    const removed = { marker: false, next: false };
    const next = {
        type: nextType,
        remove: () => {
            removed.next = true;
        },
    };
    const comment: CssComment = {
        type: 'comment',
        text,
        source: {
            input: { from: '/src/styles/preflight.css' },
            start: { line: 60, column: 1 },
        },
        next: () => next,
        remove: () => {
            removed.marker = true;
        },
    };
    return { removed, comment };
}

describe('dropLightDomOnly', () => {
    it('removes a light-dom-only marker and the rule after it', () => {
        const { removed, comment } = marked('light-dom-only');
        dropLightDomOnly().Comment(comment);
        expect(removed).toEqual({ marker: true, next: true });
    });

    it('removes a marked at-rule as readily as a marked rule', () => {
        const { removed, comment } = marked('light-dom-only', 'atrule');
        dropLightDomOnly().Comment(comment);
        expect(removed).toEqual({ marker: true, next: true });
    });

    it('tolerates the whitespace a CSS author writes inside the comment', () => {
        const { removed, comment } = marked(' light-dom-only ');
        dropLightDomOnly().Comment(comment);
        expect(removed).toEqual({ marker: true, next: true });
    });

    it('leaves every other comment, and the rule after it, alone', () => {
        for (const text of [
            'light-dom-only rules follow',
            'lightdom-only',
            '1. Prevent padding and border from affecting element width.',
        ]) {
            const { removed, comment } = marked(text);
            dropLightDomOnly().Comment(comment);
            expect(removed, text).toEqual({ marker: false, next: false });
        }
    });

    it('fails the build on a marker with no rule after it', () => {
        const comment: CssComment = {
            type: 'comment',
            text: 'light-dom-only',
            next: () => undefined,
            remove: () => {},
        };
        expect(() => dropLightDomOnly().Comment(comment)).toThrow(
            /no rule after it/,
        );
    });

    /**
     * `decl` is the case that fails UNSAFE without the type assertion: a marker
     * misplaced inside a rule body would delete the declaration below it and
     * leave the rule itself shipping. The two `comment` cases — a doubled
     * marker, and prose written between a marker and its rule — fail safe but
     * silently, dropping nothing while the build reports success.
     */
    it.each([
        ['a second marker', 'comment'],
        ['an explanatory comment', 'comment'],
        ['a declaration inside a rule body', 'decl'],
    ])('fails the build when a marker is followed by %s', (_, nextType) => {
        const { removed, comment } = marked('light-dom-only', nextType);
        expect(() => dropLightDomOnly().Comment(comment)).toThrow(
            new RegExp(`followed by a ${nextType}, not a rule`),
        );
        expect(removed).toEqual({ marker: false, next: false });
    });

    it('names the file and position of the offending marker', () => {
        const { comment } = marked('light-dom-only', 'decl');
        expect(() => dropLightDomOnly().Comment(comment)).toThrow(
            '/src/styles/preflight.css:60:1',
        );
    });
});
