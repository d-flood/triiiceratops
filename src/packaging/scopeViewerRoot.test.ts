import { describe, it, expect } from 'vitest';
import { scopeSelector } from './scopeViewerRoot';

/**
 * Split a scoped selector on top-level commas (ignoring commas inside () / [])
 * so we can assert per-compound-part invariants.
 */
function parts(selector: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of selector) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur.trim());
            cur = '';
        } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

describe('scopeSelector', () => {
    it('maps :root/:host token blocks onto .viewer-root (zero specificity kept)', () => {
        const r = scopeSelector(':where(:root, :host)');
        expect(r).toContain('.viewer-root');
        expect(r).not.toContain(':root');
        expect(r).not.toContain(':host');
        // still wrapped in :where — preserves the intentional zero specificity
        expect(r).toContain(':where(');
    });

    it('collapses a bare [data-theme] union member to .viewer-root (no page leak)', () => {
        const r = scopeSelector(':where(:root, :host, [data-theme])');
        expect(r).not.toContain(':root');
        expect(r).not.toContain(':host');
        // a bare [data-theme] would otherwise match any element on the host page
        expect(r).not.toMatch(/\[data-theme\]/);
        expect(r).toContain('.viewer-root');
    });

    it('compounds root-level theme blocks onto .viewer-root (no descendant space)', () => {
        expect(scopeSelector("[data-theme='dark']")).toBe(
            ".viewer-root[data-theme='dark']",
        );
        expect(scopeSelector('[data-theme="dark"]')).toBe(
            '.viewer-root[data-theme="dark"]',
        );
    });

    it('compounds root-level layout knobs onto .viewer-root', () => {
        expect(scopeSelector("[data-nav-style='docked']")).toBe(
            ".viewer-root[data-nav-style='docked']",
        );
    });

    it('expands the universal selector to the root itself AND descendants', () => {
        expect(scopeSelector('*')).toBe('.viewer-root, .viewer-root *');
    });

    it('scopes the reset compound (root + descendants + pseudo-elements)', () => {
        const r = scopeSelector(
            '*, ::after, ::before, ::backdrop, ::file-selector-button',
        );
        expect(parts(r)).toEqual([
            '.viewer-root',
            '.viewer-root *',
            '.viewer-root ::after',
            '.viewer-root ::before',
            '.viewer-root ::backdrop',
            '.viewer-root ::file-selector-button',
        ]);
    });

    it('maps html to the viewer root and de-dupes with :host', () => {
        expect(scopeSelector('html, :host')).toBe('.viewer-root');
    });

    it('treats element / pseudo / class selectors as descendants', () => {
        expect(scopeSelector('a')).toBe('.viewer-root a');
        expect(scopeSelector('h1, h2, h3')).toBe(
            '.viewer-root h1, .viewer-root h2, .viewer-root h3',
        );
        expect(scopeSelector('::-webkit-scrollbar')).toBe(
            '.viewer-root ::-webkit-scrollbar',
        );
        expect(scopeSelector('.osd-background .openseadragon-container')).toBe(
            '.viewer-root .osd-background .openseadragon-container',
        );
    });

    it('treats descendant attributes (data-panel-id) as descendants, not root', () => {
        expect(scopeSelector('[data-panel-id]')).toBe(
            '.viewer-root [data-panel-id]',
        );
        expect(scopeSelector("[data-panel-id='metadata']")).toBe(
            ".viewer-root [data-panel-id='metadata']",
        );
    });

    it('does not double-scope selectors that already reference .viewer-root', () => {
        expect(scopeSelector('.viewer-root.opaque')).toBe('.viewer-root.opaque');
    });

    it('handles :where()/:is() groups that are NOT root tokens', () => {
        expect(
            scopeSelector(':where(select:is([multiple], [size])) optgroup'),
        ).toBe('.viewer-root :where(select:is([multiple], [size])) optgroup');
        expect(
            scopeSelector("[hidden]:where(:not([hidden='until-found']))"),
        ).toBe(".viewer-root [hidden]:where(:not([hidden='until-found']))");
    });

    it('INVARIANT: every compound part of a scoped selector references .viewer-root', () => {
        const samples = [
            ':where(:root, :host)',
            ':where(:root, :host, [data-theme])',
            "[data-theme='light']",
            "[data-theme='dracula']",
            '*, ::after, ::before',
            'html, :host',
            'a',
            'img, svg, video, canvas, audio, iframe, embed, object',
            "button, input:where([type='button'], [type='reset'], [type='submit'])",
            '[data-panel-id]',
            "[data-nav-style='floating']",
            '.a9s-annotationlayer ellipse',
            ':where(select:is([multiple], [size])) optgroup option',
        ];
        for (const s of samples) {
            for (const p of parts(scopeSelector(s))) {
                expect(p, `part "${p}" of "${s}" must be scoped`).toContain(
                    '.viewer-root',
                );
            }
        }
    });
});
