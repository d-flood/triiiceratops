/**
 * The front page's knobs, held to the settings they claim to write.
 *
 * The hero's whole argument is that these are the viewer's own settings rather
 * than a menu of looks, so a knob naming a key the viewer does not have would
 * make the page a liar in the one place it is trying hardest to be believed.
 *
 * Layout knobs are resolved against the builder's control surface rather than
 * against the API report directly: `builder-surface.test.ts` already resolves
 * every one of those paths against the committed report, so going through it
 * means the front page can only name settings that suite has already proved
 * exist — and the two surfaces cannot drift into disagreeing about a value.
 * Theme knobs are resolved against the committed token report, which is what
 * the builder's theming controls are checked against for the same reason.
 *
 * The counts in the group headings are checked too. A number in marketing copy
 * that nothing checks is a number that quietly stops being true.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BUILTIN_THEMES } from 'triiiceratops';
import { describe, expect, it } from 'vitest';

import { CONTROL_GROUPS } from '../../src/lib/builder/surface';
import { createRequire } from 'node:module';

import {
    HERO_CYCLE_START,
    HERO_DWELL,
    HERO_FIRST_STRIDE,
    HERO_GROUPS,
    HERO_SEQUENCE,
    HERO_STRIDE,
    HERO_START,
    LAYOUT_KNOBS,
    LAYOUT_SAY,
    PRIMARIES,
    SITE_THEME,
    THEME_KNOBS,
    THEME_SAY,
    THEME_SLOTS,
    advance,
    heroSnippet,
    heroTheme,
    knobAt,
    retreat,
    stepAt,
    strideMoves,
} from '../../src/lib/heroConfigurations';

const TOKEN_REPORT = JSON.parse(
    readFileSync(
        fileURLToPath(
            new URL('../../../../api-reports/css-tokens.json', import.meta.url),
        ),
        'utf8',
    ),
) as { tokens: { themeConfigKey: string | null }[] };

const THEME_CONFIG_KEYS = new Set(
    TOKEN_REPORT.tokens
        .map((token) => token.themeConfigKey)
        .filter((key): key is string => key !== null),
);

const API = readFileSync(
    fileURLToPath(
        new URL('../../../../api-reports/core.api.md', import.meta.url),
    ),
    'utf8',
);

/** Every property of one `export interface` in the committed report. */
function propertiesOf(name: string): string[] {
    const source = API.replace(/\/\*[\s\S]*?\*\//g, '');
    const header = source.indexOf(`export interface ${name} {`);
    expect(header, `${name} is not in the API report`).toBeGreaterThan(-1);

    let at = header + `export interface ${name} {`.length;
    let depth = 1;
    while (at < source.length && depth > 0) {
        if (source[at] === '{') depth += 1;
        if (source[at] === '}') depth -= 1;
        at += 1;
    }
    const body = source.slice(header, at);
    return [...body.matchAll(/^ {4}(\w+)\??:/gm)].map((match) => match[1]);
}

/** The builder's choice and toggle controls, by dotted path. */
const BUILDER = new Map(
    CONTROL_GROUPS.flatMap((group) => group.controls).map((control) => [
        control.path.join('.'),
        control,
    ]),
);

describe('the layout knobs', () => {
    for (const knob of LAYOUT_KNOBS) {
        it(`${knob.path} is a setting the builder already resolves`, () => {
            expect(BUILDER.has(knob.path)).toBe(true);
        });

        it(`${knob.path} offers only values the viewer declares`, () => {
            const control = BUILDER.get(knob.path);
            if (control?.kind === 'choice') {
                const declared = control.choices.map((choice) => choice.value);
                expect(declared).toEqual(
                    expect.arrayContaining([...knob.values]),
                );
            } else {
                // A boolean setting, offered as two named states rather than as
                // a checkbox: the panel is a row of segmented controls, and one
                // control that is a different shape reads as a different kind of
                // thing.
                expect(control?.kind).toBe('toggle');
                expect(knob.values).toHaveLength(2);
            }
        });
    }
});

/**
 * The built-in themes' own slot values, read out of the stylesheet the package
 * actually ships.
 *
 * The source of these is `packages/core/src/styles/themes.css`, but an
 * application sees a package only through what it publishes, so this reads the
 * published `triiiceratops/style.css` — the same file the site loads. It is
 * minified, so `0.15` arrives as `.15`.
 */
const STYLESHEET = readFileSync(
    createRequire(import.meta.url).resolve('triiiceratops/style.css'),
    'utf8',
);

function shipped(theme: string) {
    const block = new RegExp(
        `\\[data-theme=["']?${theme}["']?\\]\\s*\\{(.*?)\\}`,
        's',
    ).exec(STYLESHEET);
    expect(block, `${theme} is not in the published stylesheet`).not.toBeNull();
    const read = (token: string) => {
        const found = new RegExp(`--tri-${token}:\\s*([^;]+)`).exec(block![1]);
        expect(found, `${theme} declares no --tri-${token}`).not.toBeNull();
        // A leading zero the minifier dropped is the same number.
        return found![1].trim().replace(/(^|[\s(])\./g, '$10.');
    };
    return {
        primary: read('color-primary'),
        viewerBg: read('viewer-bg'),
        radiusBox: read('radius-box'),
        radiusButtons: read('radius-buttons'),
    };
}

describe('what each theme sets in the slots the panel offers', () => {
    for (const theme of BUILTIN_THEMES) {
        it(`matches what the published stylesheet declares for ${theme}`, () => {
            expect(THEME_SLOTS[theme]).toEqual(shipped(theme));
        });
    }

    it('offers every one of those values as a chip a reader can stand on', () => {
        // A theme whose value is not in its knob's set would move the knob to
        // something it cannot show, and the selection would vanish.
        for (const theme of [SITE_THEME, ...BUILTIN_THEMES]) {
            const slots = THEME_SLOTS[theme];
            expect(knobAt('themeConfig.primary')!.values).toContain(
                slots.primary,
            );
            expect(knobAt('themeConfig.viewerBg')!.values).toContain(
                slots.viewerBg,
            );
            expect(knobAt('themeConfig.radiusBox')!.values).toContain(
                slots.radiusBox,
            );
            expect(knobAt('themeConfig.radiusButtons')!.values).toContain(
                slots.radiusButtons,
            );
        }
    });

    it('moves the slot knobs when the theme moves', () => {
        // What a preset is for: choosing one is choosing its slot values, and a
        // panel that did not show that would be hiding the relationship it
        // exists to teach.
        const teal = knobAt('theme')!.write(HERO_START, 'teal');
        const dracula = knobAt('theme')!.write(HERO_START, 'dracula');
        for (const slot of ['themeConfig.primary', 'themeConfig.viewerBg']) {
            const knob = knobAt(slot)!;
            expect(knob.read(teal)).not.toBe(knob.read(HERO_START));
            expect(knob.read(teal)).not.toBe(knob.read(dracula));
        }
    });

    it('drops a moved slot when a theme is chosen', () => {
        // A preset on a front page is a whole look in one click. A slot that
        // survived it would leave the viewer showing something no theme
        // describes, and the panel claiming a theme that is not what is on
        // screen.
        const recoloured = knobAt('themeConfig.primary')!.write(
            HERO_START,
            PRIMARIES[4],
        );
        expect(recoloured.primary).toBe(PRIMARIES[4]);

        const teal = knobAt('theme')!.write(recoloured, 'teal');
        expect(teal.primary).toBeNull();
        expect(knobAt('themeConfig.primary')!.read(teal)).toBe(
            THEME_SLOTS.teal.primary,
        );
        expect(heroSnippet(teal)).not.toContain('themeConfig');
    });

    it('stores nothing for a slot standing on its theme’s own value', () => {
        // Reselecting what the theme already set is not an override of it, so
        // the snippet stays free of a themeConfig that changes nothing.
        const teal = knobAt('theme')!.write(HERO_START, 'teal');
        const same = knobAt('themeConfig.primary')!.write(
            teal,
            THEME_SLOTS.teal.primary,
        );
        expect(same.primary).toBeNull();
        expect(heroSnippet(same)).not.toContain('themeConfig');

        const moved = knobAt('themeConfig.primary')!.write(
            teal,
            THEME_SLOTS.dracula.primary,
        );
        expect(moved.primary).toBe(THEME_SLOTS.dracula.primary);
        expect(heroSnippet(moved)).toContain('themeConfig');
    });
});

describe('the theme knobs', () => {
    it('offers the built-ins, and the site’s own tokens alongside them', () => {
        const knob = knobAt('theme');
        expect(knob).toBeDefined();
        expect(knob!.values).toEqual([SITE_THEME, ...BUILTIN_THEMES]);
    });

    for (const knob of THEME_KNOBS.filter((entry) =>
        entry.path.startsWith('themeConfig.'),
    )) {
        it(`${knob.path} is a slot the viewer publishes`, () => {
            expect(
                THEME_CONFIG_KEYS.has(knob.path.replace('themeConfig.', '')),
            ).toBe(true);
        });
    }
});

describe('what the group headings claim', () => {
    it('states the number of theme slots ThemeConfig actually has', () => {
        const slots = propertiesOf('ThemeConfig').length;
        expect(THEME_SAY).toContain(`${slots} typed slots`);
    });

    it('states the number of built-in themes there are', () => {
        expect(THEME_SAY).toContain(`${BUILTIN_THEMES.length} built-ins`);
    });

    it('states the number of arrangements the settings compose to', () => {
        /*
         * Counted rather than asserted, because two rules collapse combinations
         * that the raw product would count twice, and both are the viewer's:
         *
         *   - `unified` renders no toolbar rail, so `toolbar.side` and
         *     `toolbar.anchor` stop distinguishing anything.
         *   - a top-anchored rail owns the top edge, so `nav.edge: 'top'` yields
         *     to the bottom and duplicates its bottom-edge twin.
         *
         * And a closed gallery has one state, not one per dock position.
         */
        const navStyle = 2;
        const navEdge = 2;
        const navAlign = 3;
        const toolbarSide = 2;
        const toolbarAnchor = 2;

        const split =
            navStyle * navEdge * navAlign * toolbarSide * toolbarAnchor -
            // anchor: 'top' with edge: 'top' is the bottom-edge arrangement.
            navStyle * navAlign * toolbarSide;
        const unified = navStyle * navEdge * navAlign;
        const gallery = 1 + 4;

        expect(LAYOUT_SAY).toContain(`${(split + unified) * gallery} distinct`);
    });

    it('states the number of layout settings the viewer declares', () => {
        // Seven are shown; the heading is honest about the one that is not.
        expect(LAYOUT_SAY).toContain('8 settings');
        expect(LAYOUT_KNOBS).toHaveLength(7);
    });
});

describe('where the page starts', () => {
    it('sets no built-in theme, so the prerendered viewer cannot island', () => {
        const themed = heroTheme(HERO_START);
        expect(themed.theme).toBeUndefined();
        // It wears the site's tokens instead, which is what makes the rail's
        // scheme toggle carry the viewer with it.
        expect(themed.themeConfig?.viewerBg).toBe('var(--stage)');
    });

    it('opens with the arrangement the prerendered chrome is drawn for', () => {
        // ChromeSkeleton draws a handle in the top-left and a control cluster
        // centred on the bottom edge, and nothing else. A start state that
        // disagreed would move the chrome on mount.
        expect(HERO_START.config.controls).toBe('split');
        expect(HERO_START.config.nav).toMatchObject({
            style: 'docked',
            edge: 'bottom',
            align: 'center',
        });
        expect(HERO_START.config.gallery?.open).toBe(false);
    });
});

describe('hero gallery size', () => {
    it('enlarges thumbnails in top and bottom bands', () => {
        const open = knobAt('gallery.open')!.write(HERO_START, 'open');
        const top = knobAt('gallery.dockPosition')!.write(open, 'top');

        expect(open.config.gallery?.size).toBe(150);
        expect(top.config.gallery?.size).toBe(150);
        expect(heroSnippet(top)).toContain(
            "gallery: { open: true, dockPosition: 'top', size: 150 }",
        );
    });

    it('keeps vertical gallery rails at the default size', () => {
        const open = knobAt('gallery.open')!.write(HERO_START, 'open');
        const left = knobAt('gallery.dockPosition')!.write(open, 'left');

        expect(left.config.gallery?.size).toBeUndefined();
        expect(heroSnippet(left)).toContain(
            "gallery: { open: true, dockPosition: 'left' },",
        );
    });
});

describe('the sequence', () => {
    it('starts where the prerendered page does', () => {
        expect(HERO_SEQUENCE[0].settings).toEqual(HERO_START);
        expect(stepAt(HERO_CYCLE_START)).toBe(HERO_SEQUENCE[0]);
    });

    it('moves something a reader can see at every step', () => {
        // A dwell in which nothing changed reads as broken rather than as
        // composed. Deltas accumulate, so a step that repeats what the one
        // before it set is easy to write and invisible until it is watched.
        for (let at = 0; at < HERO_SEQUENCE.length; at += 1) {
            const before =
                HERO_SEQUENCE[
                    (at + HERO_SEQUENCE.length - 1) % HERO_SEQUENCE.length
                ];
            expect(
                HERO_SEQUENCE[at].settings,
                `step ${at} changed nothing`,
            ).not.toEqual(before.settings);
        }
    });

    it('returns to the start rather than to something like it', () => {
        // The route loops, so the last step's arrangement has to be undone
        // completely: a panel the last lap opened and the restart never
        // mentions would still be open on the second time round.
        const { settings } = advance({ at: HERO_SEQUENCE.length - 1 });
        expect(settings).toEqual(HERO_START);
    });

    it('walks the same route every time, in both directions', () => {
        let cycle = HERO_CYCLE_START;
        for (let at = 0; at < HERO_SEQUENCE.length * 2; at += 1) {
            const next = advance(cycle);
            expect(retreat(next.cycle)).toEqual({
                settings: stepAt(cycle).settings,
                cycle,
            });
            cycle = next.cycle;
        }
        expect(cycle).toEqual(HERO_CYCLE_START);
    });

    it('stays in continuous viewing throughout', () => {
        for (const step of HERO_SEQUENCE) {
            expect(step.settings.config.viewingMode).toBe('continuous');
        }
    });

    it('holds the step that opens a run twice as long as the rest of it', () => {
        for (const step of HERO_SEQUENCE) {
            expect(step.dwell).toBe(step.opens ? HERO_DWELL : HERO_DWELL / 2);
        }
    });

    it('groups into four runs, each of them contiguous', () => {
        expect(HERO_GROUPS.map((group) => group.name)).toEqual([
            'Toolbar and controls',
            'Gallery',
            'Panels',
            'Theme',
        ]);
        // The dots are drawn from these, so a group that came apart would be
        // drawn as two runs of the same name rather than caught here.
        expect(HERO_GROUPS.flatMap((group) => group.steps)).toEqual(
            HERO_SEQUENCE.map((_, at) => at),
        );
        for (const group of HERO_GROUPS) {
            expect(group.steps.length).toBeGreaterThan(1);
            for (const at of group.steps) {
                expect(HERO_SEQUENCE[at].group).toBe(group.name);
            }
        }
    });

    it('reaches every value of every knob it tours', () => {
        // What the route is for. The gallery is docked to each of its four
        // sides and every theme runs past, so the page is not arguing from a
        // short loop that its settings are few.
        const toured = ['theme', 'gallery.dockPosition'];
        for (const path of toured) {
            const knob = knobAt(path)!;
            const seen = new Set(
                HERO_SEQUENCE.map((step) => knob.read(step.settings)),
            );
            for (const value of knob.values) {
                expect(seen, `${path} never reached ${value}`).toContain(value);
            }
        }
    });

    it('moves the toolbar rail only where one exists', () => {
        // `toolbar.side` is inert in unified controls, so a step that moved it
        // there would be a dwell demonstrating nothing. Carrying a side set
        // earlier into a unified arrangement is a different thing and fine.
        const side = knobAt('toolbar.side')!;
        for (const [at, step] of HERO_SEQUENCE.entries()) {
            const before = HERO_SEQUENCE[at - 1] ?? step;
            if (side.read(step.settings) === side.read(before.settings)) {
                continue;
            }
            expect(
                step.settings.config.controls,
                `step ${at} moved toolbar.side with no rail to move`,
            ).toBe('split');
        }
    });

    it('opens the information pane on its default side first', () => {
        // The run's claim is that the pane can be docked either way, and it can
        // only make it by opening where a deployment that set nothing would
        // find it and then moving.
        const opened = HERO_SEQUENCE.findIndex(
            (step) => step.settings.config.information?.open === true,
        );
        expect(opened).toBeGreaterThan(-1);
        expect(
            HERO_SEQUENCE[opened].settings.config.information?.position,
        ).toBe('right');
        expect(
            HERO_SEQUENCE.at(-1)?.settings.config.information?.position,
        ).toBe('left');
    });
});

describe('the material under the sequence', () => {
    const CANVASES = 11;

    /** Where each lap comes to rest, walking the strides the hero walks. */
    function rests(laps: number) {
        let at = 0;
        let heading: 1 | -1 = 1;
        const landed: number[] = [];
        for (let lap = 0; lap < laps; lap += 1) {
            const strode = strideMoves(
                at,
                CANVASES,
                heading,
                lap === 0 ? HERO_FIRST_STRIDE : HERO_STRIDE,
            );
            at = strode.moves.reduce((index, move) => index + move, at);
            heading = strode.heading;
            landed.push(at);
        }
        return landed;
    }

    it('opens on the third canvas rather than the one it was served on', () => {
        expect(rests(1)).toEqual([HERO_FIRST_STRIDE]);
    });

    it('strides three between laps', () => {
        expect(rests(3)).toEqual([2, 5, 8]);
    });

    it('turns round at the ends instead of wrapping', () => {
        // Wrapping a stride of three over eleven would rest on the same three
        // canvases forever. The turn is what shifts the phase.
        const walked = rests(8);
        expect(walked.slice(3)).toEqual([9, 6, 3, 0, 3]);
        for (const at of walked) {
            expect(at).toBeGreaterThanOrEqual(0);
            expect(at).toBeLessThan(CANVASES);
        }
    });

    it('comes to rest on every canvas eventually', () => {
        const seen = new Set(rests(40));
        expect(seen.size).toBe(CANVASES);
    });

    it('never moves further than it was asked to', () => {
        for (let at = 0; at < CANVASES; at += 1) {
            for (const heading of [1, -1] as const) {
                const strode = strideMoves(at, CANVASES, heading, HERO_STRIDE);
                expect(strode.moves.length).toBe(HERO_STRIDE);
            }
        }
    });

    it('asks nothing of a manifest with one canvas', () => {
        const strode = strideMoves(0, 1, 1, HERO_STRIDE);
        expect(strode.moves).toEqual([]);
    });
});

describe('the snippet', () => {
    it('names no built-in theme while the viewer wears the page’s tokens', () => {
        const source = heroSnippet(HERO_START);
        // The comment above `themeConfig` says why there is none, so the
        // declaration is what is asserted rather than the word.
        expect(source).not.toMatch(/^\s+theme: /m);
        expect(source).toContain('const config = {');
        expect(source).toContain('gallery: { open: false }');
    });

    it('omits the toolbar in unified controls, where it sets nothing', () => {
        const unified = knobAt('controls')!.write(HERO_START, 'unified');
        expect(heroSnippet(unified)).not.toContain('toolbar:');
    });

    it('shows a moved slot as themeConfig beside the preset it came off', () => {
        const teal = knobAt('theme')!.write(HERO_START, 'teal');
        const recoloured = knobAt('themeConfig.primary')!.write(
            teal,
            '#2f6fb8',
        );
        const source = heroSnippet(recoloured);
        expect(source).toContain("theme: 'teal'");
        expect(source).toContain("primary: '#2f6fb8'");
    });
});
