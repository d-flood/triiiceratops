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

import { BUILTIN_THEMES } from 'triiiceratops';
import { describe, expect, it } from 'vitest';

import {
    CONTROL_GROUPS,
    PLUGIN_UI_CONTROLS,
} from '../../src/lib/builder/surface';
import { THEME_CHOICES, TOKEN_GROUPS } from '../../src/lib/builder/tokens';

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

/*
 * Aliases are substituted wherever they appear rather than only when the whole
 * declared type is one, so a union like `BarMenu | null` is checked against the
 * values `BarMenu` actually carries.
 */
const expand = (type: string): string =>
    type.replace(/\w+/g, (word) => ALIASES.get(word) ?? word);

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
const TOKENS = TOKEN_GROUPS.flatMap((group) => group.tokens);

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
            if (control.kind === 'text') expect(type).toBe('string');
            if (control.kind === 'colour') expect(type).toBe('string');
            if (control.kind === 'count') expect(type).toBe('number');
            if (control.kind === 'headers') {
                expect(type).toBe('Record<string, string>');
            }
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

/**
 * Every leaf of the configuration interface, as a dotted path: a property
 * whose declared type is not itself an interface the report carries. This is
 * the denominator the route's coverage claim is made against.
 */
function leaves(name: string, prefix = '', seen: string[] = []): string[] {
    if (seen.includes(name)) return [];
    const target = INTERFACES.get(name);
    if (!target) return [];

    const found = target.extends.flatMap((parent) =>
        leaves(parent, prefix, [...seen, name]),
    );
    for (const [prop, type] of target.props) {
        found.push(
            ...(INTERFACES.has(type)
                ? leaves(type, `${prefix}${prop}.`, [...seen, name])
                : [`${prefix}${prop}`]),
        );
    }
    return found;
}

describe('what the route leaves out', () => {
    const paths = CONTROLS.map((control) => control.path.join('.'));

    /*
     * The route sets the whole configuration interface, so a key that is not a
     * control has to say why in one line here. Two do; a third would be a gap.
     */
    const EXPECTED_ABSENT: Record<string, string> = {
        /*
         * The one key a reader must not be handed. It is the superseded alias
         * of `toolbar.showStructures`, which is a control, and offering both
         * would let one page emit two keys that disagree about the same button.
         */
        showStructures: 'superseded alias of toolbar.showStructures',
        /*
         * Covered, but not from here: the record is keyed by plugin id, so the
         * route renders `PLUGIN_UI_CONTROLS` under each plugin a reader turns
         * on. The suite below holds those to `PluginUiConfig`.
         */
        plugins: 'rendered per plugin by the picker, from PLUGIN_UI_CONTROLS',
    };

    it('accounts for every leaf of the configuration interface', () => {
        const unaccounted = leaves('ViewerConfig').filter(
            (leaf) => !paths.includes(leaf) && !(leaf in EXPECTED_ABSENT),
        );

        expect(unaccounted).toEqual([]);
    });

    it('names no absence that is in fact a control', () => {
        expect(
            Object.keys(EXPECTED_ABSENT).filter((leaf) => paths.includes(leaf)),
        ).toEqual([]);
    });

    it('keeps the chrome half of the locale pair', () => {
        expect(paths).toContain('toolbar.showLocalePicker');
    });
});

/*
 * The picker renders these under `plugins.<id>`, so they are resolved against
 * `PluginUiConfig` directly: a plugin id is not a key the report can carry.
 */
describe('every per-plugin UI control', () => {
    const relative = (path: readonly string[]) =>
        propertyType('PluginUiConfig', path[0]);

    it('names a real leaf of the per-plugin interface', () => {
        const unresolved = PLUGIN_UI_CONTROLS.filter(
            (control) => relative(control.path) === undefined,
        ).map((control) => control.path.join('.'));

        expect(unresolved).toEqual([]);
    });

    it('covers every leaf of it', () => {
        const bound = PLUGIN_UI_CONTROLS.map((control) =>
            control.path.join('.'),
        );

        expect(leaves('PluginUiConfig').sort()).toEqual(bound.sort());
    });

    it('writes the kind of value that leaf declares', () => {
        for (const control of PLUGIN_UI_CONTROLS) {
            const type = relative(control.path);
            if (control.kind === 'toggle') expect(type).toBe('boolean');
            if (control.kind === 'choice') {
                for (const choice of control.choices) {
                    expect(expand(type ?? '')).toContain(`'${choice.value}'`);
                }
            }
        }
    });

    /*
     * Both override an answer the plugin was authored with, so a reader who has
     * stated one has to be able to hand it back.
     */
    it('lets a reader retract the two the plugin already answers', () => {
        const unsettable = PLUGIN_UI_CONTROLS.filter(
            (control) => control.kind === 'choice' && control.unset,
        );

        expect(unsettable.map((control) => control.path.join('.'))).toEqual([
            'target',
            'position',
        ]);
    });
});

describe('a control whose absence is a choice', () => {
    const unsettable = CONTROLS.filter(
        (control) => control.kind === 'choice' && control.unset !== undefined,
    );

    /*
     * Both keys override what the publisher declared, so the builder has to be
     * able to say nothing about them. Core reads a falsy value as "the manifest
     * decides", which is what makes the retraction expressible at all.
     */
    it('is offered for each key whose absence says something', () => {
        expect(unsettable.map((control) => control.path.join('.'))).toEqual([
            'viewingMode',
            'viewingDirection',
            'openMenu',
        ]);
    });

    it('states no default, so an untouched page overrides nothing', async () => {
        const { BUILDER_DEFAULTS } =
            await import('../../src/lib/builder/surface');

        for (const control of unsettable) {
            expect(
                (BUILDER_DEFAULTS as Record<string, unknown>)[control.path[0]],
            ).toBeUndefined();
        }
    });

    it('reserves the empty string, which no real choice may use', () => {
        for (const control of unsettable) {
            if (control.kind !== 'choice') continue;
            for (const choice of control.choices) {
                expect(choice.value).not.toBe('');
            }
        }
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

    it('offers the palette, the surfaces, the content colors, the per-panel overrides, the annotations and the corners', () => {
        expect(TOKEN_GROUPS.map((group) => group.title)).toEqual([
            'Palette',
            'Surfaces',
            'Content colors',
            'Per-panel overrides',
            'Annotations',
            'Corners',
        ]);
        // The general sizing and border/effect tokens are the theming
        // reference's, not this route's.
        expect(TOKENS.map((token) => token.key)).not.toContain('sizeField');
        expect(TOKENS.map((token) => token.key)).not.toContain('depth');
    });

    /*
     * The one group that is not a single kind: two hues, a marker's size, a
     * border's width and the fill the hue is carried at. A control drawn as a
     * swatch would set `20%` to `#000000`, so what each token is has to reach
     * the template.
     */
    it('draws each annotation token as the kind of value it is', () => {
        const annotations = TOKEN_GROUPS.find(
            (group) => group.title === 'Annotations',
        );

        expect(
            annotations?.tokens.map((token) => [token.name, token.kind]),
        ).toEqual([
            ['--tri-annotation-color', 'colour'],
            ['--tri-annotation-hit-color', 'colour'],
            ['--tri-annotation-fill-opacity', 'percent'],
            ['--tri-annotation-point-size', 'length'],
            ['--tri-annotation-border-width', 'length'],
        ]);

        // A border past ten pixels is a band over the material rather than an
        // edge around it, and at zero it is not a border at all, so this one
        // slider runs from a hairline to ten rather than over the general range.
        expect(
            annotations?.tokens.find(
                (token) => token.name === '--tri-annotation-border-width',
            )?.range,
        ).toEqual({ min: 0.5, max: 10, step: 0.5 });
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

describe('the theme a reader starts from', () => {
    it('offers exactly the themes the package builds in', () => {
        expect(THEME_CHOICES.map((choice) => choice.value).sort()).toEqual(
            [...BUILTIN_THEMES].sort(),
        );
    });
});

describe('the configuration the controls start from', () => {
    /*
     * Every control but the two whose absence is itself a choice: a `<select>`
     * bound to `undefined` shows no arrangement and a slider bound to it has no
     * position, so each of the rest has to start from its own documented
     * default. The exceptions are held to the opposite rule above.
     */
    it('states a default for every key a control binds', async () => {
        const { BUILDER_DEFAULTS } =
            await import('../../src/lib/builder/surface');

        const settled = CONTROLS.filter(
            (control) => !(control.kind === 'choice' && control.unset),
        );

        for (const control of settled) {
            let cursor: unknown = BUILDER_DEFAULTS;
            for (const key of control.path) {
                expect(cursor).toBeTypeOf('object');
                cursor = (cursor as Record<string, unknown>)[key];
            }
            expect(cursor).toBeDefined();
        }
    });
});
