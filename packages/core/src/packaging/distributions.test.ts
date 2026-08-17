import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_CSS_TOKENS } from '../lib/theme/publicTokens';
import { SKIP_ENV } from './messageCompiler';

/*
 * Guards that EVERY published distribution actually ships the design system
 * (tokens + all four built-in themes), and that the Svelte light-DOM stylesheet
 * is scoped so it can't clobber a consumer's page.
 *
 * Regression this locks down: after the Tailwind→vanilla refactor, the Svelte
 * `style.css` shipped only the Annotorious layer — no tokens, themes, reset, or
 * layout — so `import 'triiiceratops/style.css'` produced an unstyled viewer.
 */

// src/packaging → package root
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const dist = (f: string) => resolve(PACKAGE_ROOT, 'dist', f);

const THEMES = ['light', 'dark', 'teal', 'dracula'] as const;

function build(config: string) {
    execSync(`pnpm exec vite build --config ${config}`, {
        cwd: PACKAGE_ROOT,
        stdio: 'pipe',
        // vitest sets NODE_ENV=test, and vite only defaults NODE_ENV when it is
        // unset — so an inherited environment makes `isProduction` false and
        // vite-plugin-svelte compile `dev: true`. These builds write into the
        // real `dist/` with `emptyOutDir: false`, so that dev artifact would sit
        // there afterwards, in exactly the place `scripts/size-check.mjs` and
        // `pnpm size:baseline` read: running `pnpm test` and then
        // `pnpm size:baseline` would re-record a ~1.4 MB bundle as the budget.
        //
        // SKIP_ENV for the same class of reason, on a different shared file: a
        // build compiles Paraglide's messages into `src/lib/paraglide`, which
        // ~145 other test files are importing from in parallel workers right
        // now. Vitest's own config compiled them before any test file loaded, so
        // there is nothing here to regenerate — see src/packaging/messageCompiler.ts.
        env: {
            ...process.env,
            NODE_ENV: 'production',
            [SKIP_ENV]: '1',
        },
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

/**
 * A selector part that targets the viewer ROOT and nothing else: `.viewer-root`
 * optionally wrapped in `:where()` and optionally compounded with attribute or
 * class selectors. No descendant space, no `>`/`+`/`~`, no `*`.
 */
const ROOT_ONLY = /^(?::where\()?\.viewer-root(?:\[[^\]]*\]|\.[\w-]+)*\)?$/;

/**
 * Return every selector part in the sheet that DECLARES a base `--tri-*` or
 * `--ui-*` custom property while matching something other than the viewer root.
 *
 * Base tokens must land on the root ALONE. Declared on a descendant they beat
 * the root's `[data-theme=…]` block and `themeConfig` inline styles by cascade,
 * so that subtree silently reverts to the stock light theme — the renderer
 * wrapper's `class="viewer-root"` regression, from the other end (see
 * viewerRootUnique.test.ts, which guards the markup side).
 */
function findNonRootTokenDeclarations(css: string): string[] {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    css = stripAtRuleBlocks(css, /@[\w-]*keyframes/);
    const bad: string[] = [];
    const ruleRe = /([^{}]*)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css))) {
        // `[^{}]*` after a nested block can pick up a trailing `}`; keep the
        // text after the last one (the actual selector).
        const sel = m[1].split('}').pop()!.trim();
        if (!sel || sel.startsWith('@')) continue;
        if (!/(?:--tri-|--ui-)[\w-]+\s*:/.test(m[2])) continue;
        for (const part of splitTopLevel(sel)) {
            if (part && !ROOT_ONLY.test(part)) bad.push(part);
        }
    }
    return [...new Set(bad)];
}

beforeAll(() => {
    // Build the theme-bearing artifacts. The lib build also emits
    // dist/triiiceratops.css (unscoped) which the styles build overwrites, so
    // styles MUST run last — the same order as the `build:lib` script.
    build('vite.config.lib.ts');
    build('vite.config.element.ts');
    build('vite.config.element-esm.ts');
    build('vite.config.styles.ts');
}, 300_000);

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
            expect(css).toContain('--tri-color-primary');
            expect(css).toContain('--tri-viewer-bg');
            expect(css).toContain('--tri-content');
        });

        it('ships exactly the documented public --tri-* token set', () => {
            // Every documented public token must be declared in the built sheet.
            const missing = PUBLIC_CSS_TOKENS.filter(
                (t) => !new RegExp(`${t}\\s*:`).test(css),
            );
            expect(missing, `documented tokens absent from CSS`).toEqual([]);

            // Conversely, no --tri-* variable may appear in the sheet without
            // being documented in the public token registry (source of truth).
            const declared = new Set(
                [...css.matchAll(/(--tri-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
            );
            const undocumented = [...declared].filter(
                (t) => !PUBLIC_CSS_TOKENS.includes(t),
            );
            expect(
                undocumented,
                `--tri-* vars in CSS missing from publicTokens.ts`,
            ).toEqual([]);
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

        it('declares base tokens on the viewer root ONLY (never a descendant)', () => {
            const bad = findNonRootTokenDeclarations(css);
            expect(
                bad,
                `these selectors declare base --tri-*/--ui-* tokens on something\n` +
                    `other than the viewer root, shadowing the root's theme for\n` +
                    `that subtree:\n${bad.join('\n')}`,
            ).toEqual([]);
        });
    });

    describe('web component — dist/triiiceratops-element.iife.js', () => {
        it('inlines tokens + all four themes (for the shadow root)', () => {
            const js = readFileSync(
                dist('triiiceratops-element.iife.js'),
                'utf8',
            );
            expect(js).toContain('--tri-color-primary');
            expect(js).toContain('data-theme');
            for (const theme of THEMES) {
                expect(js, `theme "${theme}" missing`).toContain(theme);
            }
        });

        /*
         * The plugin rendering substrate (ADR 0016) is DOM overlay layers plus
         * paint hooks, and both are driven by a revision counter the render site
         * reads to establish a reactive dependency. That read was once a bare
         * `void state.overlayLayerRevision;` expression statement, which this
         * bundle's terser pass deletes as side-effect-free — so in the SHIPPED
         * web component a plugin could register an overlay layer, the registry
         * would accept it, the counter would increment, and no container was
         * ever created. Every overlay and paint test stayed green because they
         * all load the element from source, not from this artifact.
         *
         * Grepping the minified output is the only place that failure is
         * visible, so it is asserted here rather than left to an e2e that would
         * have to drive a real plugin against a real build.
         */
        it('keeps the overlay, paint and transport revision reads through minification', () => {
            const js = readFileSync(
                dist('triiiceratops-element.iife.js'),
                'utf8',
            );

            // Each counter is written in three places the minifier always keeps
            // — the getter, the setter and the `+= 1` bump. A surviving READ is
            // therefore a fourth occurrence, and its absence is the bug.
            for (const revision of [
                'overlayLayerRevision',
                'paintLayerRevision',
                // The control bar's transport chrome is driven by the same
                // idiom, so it is exposed to the same deletion.
                'transportChromeRevision',
            ]) {
                const occurrences = js.split(revision).length - 1;
                expect(
                    occurrences,
                    `${revision} is written 3 times and read at least once; ` +
                        `${occurrences} occurrence(s) means the render site's ` +
                        `read was dropped and the layer will never render`,
                ).toBeGreaterThan(3);
            }
        });

        /*
         * The end of the chain the other guards check in pieces: whatever the
         * compile options did, does loading this file put <triiiceratops-viewer>
         * in the registry, and nothing else?
         *
         * Worth running rather than grepping. The entry point hands
         * `customElements.define` a constructor it read off the compiled
         * component through an `as unknown as { element: … }` cast, so an
         * element that was never generated type-checks exactly like one that
         * was, and reaches `define` as `undefined`. Executing the bundle is also
         * the one assertion no minifier can mislead.
         */
        it('defines exactly the one custom element when loaded', () => {
            const js = readFileSync(
                dist('triiiceratops-element.iife.js'),
                'utf8',
            );
            const defined: string[] = [];
            const define = customElements.define.bind(customElements);
            customElements.define = (tag, ctor, options) => {
                defined.push(tag);
                define(tag, ctor, options);
            };
            try {
                new Function(js)();
            } finally {
                customElements.define = define;
            }

            expect(defined).toEqual(['triiiceratops-viewer']);
            expect(customElements.get('triiiceratops-viewer')).toBeTypeOf(
                'function',
            );
        });
    });

    describe('web component ESM entry — dist/triiiceratops-element.js', () => {
        /*
         * The same end-of-chain check for the OTHER artifact. It needs its own
         * run: the two bundles come out of two different Vite configs and two
         * different esbuild transpile settings (Vite leaves `minifyWhitespace`
         * off for an ES lib build), so "the IIFE executes" says nothing about
         * this one. Nothing else executes it — every other guard on it is a
         * regex over the text — which is exactly the wrong shape of evidence
         * for `compress.pure_getters`, whose licence is to delete member
         * expressions whose value is unused.
         *
         * The registration path is idempotent and first-wins
         * (`defineViewerElement` returns early when the tag is taken), so the
         * IIFE test above having really defined the tag would make this one
         * observe nothing. Stub `get` as well as `define`, and the two tests
         * stop depending on each other's order.
         */
        function loadAndCollectDefinitions(js: string): {
            tags: string[];
            ctor: CustomElementConstructor | undefined;
        } {
            const tags: string[] = [];
            let ctor: CustomElementConstructor | undefined;
            const define = customElements.define.bind(customElements);
            const get = customElements.get.bind(customElements);
            customElements.define = (tag, c) => {
                tags.push(tag);
                ctor = c;
            };
            customElements.get = () => undefined;
            try {
                new Function(js)();
            } finally {
                customElements.define = define;
                customElements.get = get;
            }
            return { tags, ctor };
        }

        it('defines exactly the one custom element when executed', () => {
            const js = readFileSync(dist('triiiceratops-element.js'), 'utf8');
            const { tags, ctor } = loadAndCollectDefinitions(js);

            expect(tags).toEqual(['triiiceratops-viewer']);
            expect(ctor).toBeTypeOf('function');
        });

        it('observes every attribute the wrapper declares', () => {
            // `observedAttributes` is a static getter on Svelte's
            // custom-element base class, reading the compiled props
            // definition. Asking the live constructor for it — rather than
            // grepping the text, which is all the other guards on this
            // artifact do — is what makes the attribute contract survive the
            // round trip through two minifiers. Expected values come from the
            // wrapper source, so the two cannot drift.
            const wrapper = readFileSync(
                resolve(
                    PACKAGE_ROOT,
                    'src/lib/components/TriiiceratopsViewerElement.svelte',
                ),
                'utf8',
            );
            const declared = [
                ...wrapper.matchAll(/attribute:\s*'([a-z-]+)'/g),
            ].map((m) => m[1]);
            expect(declared.length).toBeGreaterThan(0);

            const js = readFileSync(dist('triiiceratops-element.js'), 'utf8');
            const { ctor } = loadAndCollectDefinitions(js);
            const observed = (
                ctor as unknown as { observedAttributes: string[] }
            ).observedAttributes;

            expect(observed).toEqual(expect.arrayContaining(declared));
        });
    });

    // The Annotorious single-source CSS rule lives in
    // `@triiiceratops/plugin-annotation-editor`, whose `styles.ts` imports the
    // Annotorious stylesheet with `?inline` and installs it through the SDK
    // style service. Core's own "no Annotorious layer" rule (above) is what
    // stays here.
});
