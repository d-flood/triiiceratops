// Tarball-level CSS assertions.
//
// Prior art: packages/core/src/packaging/distributions.test.ts inspects the
// build's `dist/`. This harness strengthens the same checks by inspecting the
// CSS *inside the packed `.tgz`* — i.e. exactly the bytes a consumer installs as
// `triiiceratops/style.css`.

// The built-in themes ship with lowercase identifiers.
const THEMES = ['light', 'dark', 'teal', 'dracula'];

function splitTopLevel(selector) {
    const out = [];
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

function stripAtRuleBlocks(css, opener) {
    const re = new RegExp(opener.source + '[^{]*\\{', 'g');
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(css))) {
        out += css.slice(last, m.index);
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

function findUnscopedSelectors(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    css = stripAtRuleBlocks(css, /@[\w-]*keyframes/);
    const leaks = [];
    const ruleRe = /([^{}]+)\{/g;
    let m;
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
 * Run every CSS assertion against the stylesheet string extracted from the
 * tarball. Returns { ok, checks: [{ name, ok, detail }] }.
 */
export function assertTarballCss(css) {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

    check(
        'design tokens present (--tri-color-primary, --tri-viewer-bg, --tri-content)',
        css.includes('--tri-color-primary') &&
            css.includes('--tri-viewer-bg') &&
            css.includes('--tri-content'),
    );

    const missingThemes = THEMES.filter((theme) => {
        const re = new RegExp(
            `\\.viewer-root\\[data-theme=['"]?${theme}['"]?\\]`,
        );
        return !re.test(css);
    });
    check(
        'all four built-in themes present, scoped to .viewer-root',
        missingThemes.length === 0,
        missingThemes.length ? `missing: ${missingThemes.join(', ')}` : '',
    );

    check(
        'element reset + layout vars present (.viewer-root *, --ui-)',
        css.includes('.viewer-root *') && css.includes('--ui-'),
    );

    const hasA9s = css.includes('a9s-') || css.includes('annotorious');
    check(
        "no plugin CSS in core stylesheet (no 'a9s-' / 'annotorious')",
        !hasA9s,
    );

    const leaks = findUnscopedSelectors(css);
    check(
        'fully scoped to .viewer-root — zero unscoped selectors',
        leaks.length === 0,
        leaks.length ? `leaks: ${leaks.slice(0, 5).join(' | ')}` : '',
    );

    return { ok: checks.every((c) => c.ok), checks };
}
