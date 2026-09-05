/**
 * The builder's control surface, held to the published interfaces it claims to
 * set.
 *
 * The route's whole promise is that a reader can hand the resulting
 * configuration to a developer and have it work, so a control naming a key the
 * viewer does not have is worse than a missing control. Each path is resolved
 * against the committed API report — the machine-readable form of the viewer's
 * public types — and each theming control against the committed token report.
 *
 * The reports are read rather than the packages' sources: an application sees a
 * package only through what it publishes, and these are what the repository
 * publishes of it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTROL_GROUPS } from '../../src/lib/builder/surface';
import { TOKEN_GROUPS } from '../../src/lib/builder/tokens';

const API = readFileSync(
    fileURLToPath(
        new URL('../../../../api-reports/core.api.md', import.meta.url),
    ),
    'utf8',
);

const TOKEN_REPORT = JSON.parse(
    readFileSync(
        fileURLToPath(
            new URL('../../../../api-reports/css-tokens.json', import.meta.url),
        ),
        'utf8',
    ),
) as { tokens: { name: string; themeConfigKey: string | null }[] };

type Interface = {
    /** Property name to the text of its declared type. */
    readonly props: Map<string, string>;
    readonly extends: readonly string[];
};

/** Every `export interface` in the report, by name. */
function parseInterfaces(text: string): Map<string, Interface> {
    const found = new Map<string, Interface>();
    const header = /export interface (\w+)(?:\s+extends\s+([^{]+))?\s*\{/g;

    for (let match = header.exec(text); match; match = header.exec(text)) {
        let depth = 1;
        let at = match.index + match[0].length;
        const start = at;
        while (at < text.length && depth > 0) {
            if (text[at] === '{') depth += 1;
            if (text[at] === '}') depth -= 1;
            at += 1;
        }
        const body = text.slice(start, at - 1);

        const props = new Map<string, string>();
        for (const line of body.split('\n')) {
            const prop = /^\s{4}(\w+)\??:\s*(.+);\s*$/.exec(line);
            if (prop) props.set(prop[1], prop[2].trim());
        }

        const existing = found.get(match[1]);
        if (existing) {
            for (const [key, value] of props) existing.props.set(key, value);
            continue;
        }
        found.set(match[1], {
            props,
            extends: (match[2] ?? '')
                .split(',')
                .map((name) => name.trim())
                .filter(Boolean),
        });
    }

    return found;
}

/* Comments are stripped once: a JSDoc `{@link …}` would otherwise unbalance the
   brace count that finds where a declaration ends. */
const SOURCE = API.replace(/\/\*[\s\S]*?\*\//g, '');

const INTERFACES = parseInterfaces(SOURCE);

/**
 * The right-hand side of every `export type`, so a property declared as a named
 * union — `controls?: ControlsMode` — can be checked against the values a
 * control actually offers.
 */
const ALIASES = new Map(
    [...SOURCE.matchAll(/export type (\w+) = ([^;]+);/g)].map((match) => [
        match[1],
        match[2].trim(),
    ]),
);

const expand = (type: string): string => ALIASES.get(type) ?? type;

/** A property's declared type, following `extends` where the interface has one. */
function propertyType(name: string, prop: string): string | undefined {
    const target = INTERFACES.get(name);
    if (!target) return undefined;
    const own = target.props.get(prop);
    if (own !== undefined) return own;
    for (const parent of target.extends) {
        const inherited = propertyType(parent, prop);
        if (inherited !== undefined) return inherited;
    }
    return undefined;
}

/**
 * The declared type of the leaf a control writes, or `undefined` if any step of
 * the path is not a property of the interface it is read against.
 */
function resolve(path: readonly string[]): string | undefined {
    let owner = 'ViewerConfig';
    for (let step = 0; step < path.length; step += 1) {
        const type = propertyType(owner, path[step]);
        if (type === undefined) return undefined;
        if (step === path.length - 1) return type;
        // Only a named interface can be descended into.
        if (!INTERFACES.has(type)) return undefined;
        owner = type;
    }
    return undefined;
}

const CONTROLS = CONTROL_GROUPS.flatMap((group) => group.controls);
const TOKENS = TOKEN_GROUPS.flatMap((group) =>
    group.tokens.map((token) => ({ ...token, kind: group.kind })),
);

describe('the API report parse this suite depends on', () => {
    it('finds the interfaces the controls are checked against', () => {
        expect(INTERFACES.has('ViewerConfig')).toBe(true);
        expect(propertyType('ViewerConfig', 'toolbar')).toBe('ToolbarConfig');
        // Inherited through `extends`, which the resolver has to follow.
        expect(propertyType('SearchConfig', 'position')).toContain('left');
    });

    it('reports a key the viewer does not have as unresolved', () => {
        expect(resolve(['notAKey'])).toBeUndefined();
        expect(resolve(['toolbar', 'notAKey'])).toBeUndefined();
    });
});

describe('every configuration control', () => {
    it('names a real leaf of the viewer configuration interface', () => {
        const unresolved = CONTROLS.filter(
            (control) => resolve(control.path) === undefined,
        ).map((control) => control.path.join('.'));

        expect(unresolved).toEqual([]);
    });

    it('writes the kind of value that leaf declares', () => {
        for (const control of CONTROLS) {
            const type = resolve(control.path);
            if (control.kind === 'toggle') expect(type).toBe('boolean');
            if (control.kind === 'pixels') expect(type).toBe('string');
            if (control.kind === 'count') expect(type).toBe('number');
            if (control.kind === 'choice') {
                for (const choice of control.choices) {
                    expect(expand(type ?? '')).toContain(`'${choice.value}'`);
                }
            }
        }
    });

    it('is bound to a distinct key', () => {
        const paths = CONTROLS.map((control) => control.path.join('.'));
        expect(new Set(paths).size).toBe(paths.length);
    });
});

describe('what the route leaves to the playground', () => {
    const paths = CONTROLS.map((control) => control.path.join('.'));

    it('has no control for a value this route is not the surface for', () => {
        // Whether a control is *shown* is chrome, so `toolbar.showViewingMode`
        // is in scope; the value it sets is not.
        expect(paths).not.toContain('viewingMode');
        expect(paths).not.toContain('viewingDirection');
        expect(paths).not.toContain('pagedViewOffset');
        expect(paths).not.toContain('preserveCanvasScale');
    });

    it('has no control under renderer tuning or search providers', () => {
        for (const path of paths) {
            expect(path.startsWith('renderer')).toBe(false);
        }
        expect(paths).not.toContain('search.query');
    });
});

describe('every theming control', () => {
    it('names a public token that has a themeConfig key', () => {
        const published = new Map(
            TOKEN_REPORT.tokens.map((token) => [
                token.name,
                token.themeConfigKey,
            ]),
        );

        for (const token of TOKENS) {
            expect(published.get(token.name)).toBe(token.key);
        }
    });

    it('names no property the theme configuration does not declare', () => {
        for (const token of TOKENS) {
            expect(propertyType('ThemeConfig', token.key)).toBeDefined();
        }
    });

    it('carries none of the names the design record invented', () => {
        const invented = ['--vw-radius', '--vw-border', '--vw-ctl', '--vw-pad'];
        const names = TOKENS.map((token) => token.name);

        for (const name of invented) expect(names).not.toContain(name);
    });

    it('offers the palette, the surfaces, the content colours, the per-panel overrides and the corners', () => {
        expect(TOKEN_GROUPS.map((group) => group.title)).toEqual([
            'Palette',
            'Surfaces',
            'Content colours',
            'Per-panel overrides',
            'Corners',
        ]);
        // Sizing and border/effect tokens are the theming reference's, not this
        // route's.
        expect(TOKENS.map((token) => token.key)).not.toContain('sizeField');
        expect(TOKENS.map((token) => token.key)).not.toContain('depth');
    });

    it('reads each token’s label off its own name', () => {
        const labels = new Map(
            TOKENS.map((token) => [token.name, token.label]),
        );

        expect(labels.get('--tri-color-primary')).toBe('Primary');
        expect(labels.get('--tri-metadata-panel-bg')).toBe(
            'Metadata panel background',
        );
        expect(labels.get('--tri-radius-box')).toBe('Box');
    });
});

describe('the configuration the controls start from', () => {
    it('states a default for every key a control binds', async () => {
        const { BUILDER_DEFAULTS } =
            await import('../../src/lib/builder/surface');

        for (const control of CONTROLS) {
            let cursor: unknown = BUILDER_DEFAULTS;
            for (const key of control.path) {
                expect(cursor).toBeTypeOf('object');
                cursor = (cursor as Record<string, unknown>)[key];
            }
            expect(cursor).toBeDefined();
        }
    });
});
