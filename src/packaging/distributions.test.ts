import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * Guards that EVERY published distribution actually ships the design system
 * (tokens + all four built-in themes), and that the Svelte light-DOM stylesheet
 * is scoped so it can't clobber a consumer's page.
 *
 * Regression this locks down: after the Tailwind→vanilla refactor, the Svelte
 * `style.css` shipped only the Annotorious layer — no tokens, themes, reset, or
 * layout — so `import 'triiiceratops/style.css'` produced an unstyled viewer.
 */

// src/build → repo root
const REPO = resolve(__dirname, '..', '..');
const dist = (f: string) => resolve(REPO, 'dist', f);

const THEMES = ['light', 'dark', 'Teal', 'dracula'] as const;

function build(config: string) {
    execSync(`pnpm exec vite build --config ${config}`, {
        cwd: REPO,
        stdio: 'pipe',
    });
}

/** Split a CSS selector list on top-level commas (ignoring () and []). */
function splitTopLevel(selector: string): string[] {
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

function stripAtRuleBlocks(css: string, opener: RegExp): string {
    const re = new RegExp(opener.source + '[^{]*\\{', 'g');
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
        out += css.slice(last, m.index);
        // walk to the matching closing brace
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < css.length && depth; i++) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}') depth--;
        }
        last = i;
        re.lastIndex = i;
    }
    out += css.slice(last);
    return out;
}

/**
 * Return every selector in the sheet that has at least one compound part NOT
 * anchored to `.viewer-root` — i.e. a rule that would leak onto the host page.
 * @keyframes step selectors (0%, to, …) are excluded.
 */
function findUnscopedSelectors(css: string): string[] {
    css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
    css = stripAtRuleBlocks(css, /@[\w-]*keyframes/);
    const leaks: string[] = [];
    const ruleRe = /([^{}]+)\{/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css))) {
        const sel = m[1].trim();
        if (!sel || sel.startsWith('@')) continue;
        for (const part of splitTopLevel(sel)) {
            if (part && !part.includes('.viewer-root')) leaks.push(part);
        }
    }
    return [...new Set(leaks)];
}

beforeAll(() => {
    // Build the theme-bearing artifacts. The lib build also emits
    // dist/triiiceratops.css (unscoped) which the styles build overwrites, so
    // styles MUST run last — the same order as the `build:lib` script.
    build('vite.config.lib.ts');
    build('vite.config.element.ts');
    build('vite.config.styles.ts');
}, 240_000);

describe('published distributions ship styles + themes', () => {
    describe("Svelte package — 'triiiceratops/style.css' (dist/triiiceratops.css)", () => {
        let css = '';
        beforeAll(() => {
            expect(
                existsSync(dist('triiiceratops.css')),
                'dist/triiiceratops.css must exist',
            ).toBe(true);
            css = readFileSync(dist('triiiceratops.css'), 'utf8');
        });

        it('includes the design tokens', () => {
            expect(css).toContain('--color-primary');
            expect(css).toContain('--viewer-bg');
            expect(css).toContain('--content');
        });

        it('includes all four built-in themes, scoped to the viewer root', () => {
            for (const theme of THEMES) {
                // minifier may drop the quotes: [data-theme=dark] or ='dark'
                const re = new RegExp(
                    `\\.viewer-root\\[data-theme=['"]?${theme}['"]?\\]`,
                );
                expect(css, `theme "${theme}" missing`).toMatch(re);
            }
        });

        it('includes the element reset and layout vars', () => {
            expect(css, 'reset').toContain('.viewer-root *');
            expect(css, 'layout --ui- vars').toContain('--ui-');
        });

        it('does NOT bundle plugin CSS — core has no Annotorious layer', () => {
            // The annotation layer ships with the annotation-editor plugin, not
            // core. A consumer without that plugin must not pay for it.
            expect(css, 'no a9s classes').not.toContain('a9s-');
            expect(css, 'no annotorious').not.toContain('annotorious');
        });

        it('is fully scoped — no rule can leak onto the host page', () => {
            const leaks = findUnscopedSelectors(css);
            expect(
                leaks,
                `unscoped selectors would style the host page:\n${leaks.join('\n')}`,
            ).toEqual([]);
        });
    });

    describe('bundle — dist/triiiceratops-bundle.js', () => {
        it('inlines tokens + all four themes', () => {
            const js = readFileSync(dist('triiiceratops-bundle.js'), 'utf8');
            expect(js).toContain('--color-primary');
            expect(js).toContain('data-theme');
            for (const theme of THEMES) {
                expect(js, `theme "${theme}" missing`).toContain(theme);
            }
        });
    });

    describe('web component — dist/triiiceratops-element.iife.js', () => {
        it('inlines tokens + all four themes (for the shadow root)', () => {
            const js = readFileSync(
                dist('triiiceratops-element.iife.js'),
                'utf8',
            );
            expect(js).toContain('--color-primary');
            expect(js).toContain('data-theme');
            for (const theme of THEMES) {
                expect(js, `theme "${theme}" missing`).toContain(theme);
            }
        });
    });

    describe('annotation-editor plugin owns the Annotorious CSS', () => {
        it('the manager imports the Annotorious stylesheet as the single source (F23)', () => {
            // The manager injects `?inline` CSS into the viewer's root node
            // (shadow-root aware). svelte-package ships this .svelte.ts verbatim,
            // so the consumer's bundler pulls the Annotorious CSS only when they
            // use the plugin — one path, tracked against the installed version.
            const manager = readFileSync(
                resolve(
                    REPO,
                    'src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts',
                ),
                'utf8',
            );
            expect(manager).toContain(
                'annotorious-openseadragon.css?inline',
            );
        });

        it('the plugin panel no longer side-effect-imports the stylesheet (single source)', () => {
            // A light-DOM CSS import never reaches the element build's shadow
            // root; the manager's injection is the only path (F23).
            const panel = readFileSync(
                resolve(
                    REPO,
                    'src/lib/plugins/annotation-editor/AnnotationEditorPanel.svelte',
                ),
                'utf8',
            );
            expect(panel).not.toContain(
                "import '@annotorious/openseadragon/annotorious-openseadragon.css'",
            );
        });
    });
});
