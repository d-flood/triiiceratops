/**
 * The front page's configuration surface, as knobs.
 *
 * The hero's argument is that the viewer composes rather than ships a menu of
 * looks, so what the page offers is the settings themselves — a segmented
 * control per setting, and the configuration they currently amount to. Named
 * arrangements are deliberately not used: a label like "Docked toolbar" is a
 * noun phrase, which is the grammar of an enum value, and the viewer has no
 * such value. Every `path` below is a real leaf of the viewer's configuration
 * or theme interface, and `tests/unit/hero-knobs.test.ts` holds them to it.
 *
 * Two groups, in the order a deployment asks the questions: whether it can be
 * made to look like theirs, then where the chrome goes. Eleven knobs of the
 * fifty-two that exist — the group headings carry the real counts, and
 * `/configure/` is the instrument.
 */

import type { BuiltInTheme, ThemeConfig } from 'triiiceratops';

import type { ViewerConfig } from './viewerConfig';
import { SITE_VIEWER_THEME } from './viewerTheme';

/**
 * The site's own tokens, offered as a theme choice alongside the built-ins.
 *
 * It is first, and it is where the page starts, for a reason that is not
 * presentational: `SITE_VIEWER_THEME` is what keeps a dark page from containing
 * a light island, and starting on a built-in would put that island in the
 * prerendered markup for every reader whose scheme disagreed with it. It is
 * also the strongest claim on the page — the viewer wearing somebody else's
 * tokens is the thing a deployment actually needs — so it is a choice a reader
 * can come back to rather than a default they can only leave.
 */
export const SITE_THEME = 'site';

/**
 * What each theme sets in the four slots this panel offers.
 *
 * Choosing a theme is choosing a set of slot values, and the panel says so: the
 * slot knobs move to the chosen theme's values, because that is what a reader
 * expects a preset to do and because it is the only way the preset/override
 * relationship is visible at all. A slot a reader has not touched is not stored
 * — it reads through to the theme — so a chip standing on the theme's own value
 * emits nothing, and moving off it is what produces a `themeConfig`.
 *
 * The four built-ins' values are the viewer's, declared in its own stylesheet
 * under `[data-theme=…]`, and `tests/unit/hero-knobs.test.ts` reads them out of
 * the published `triiiceratops/style.css` to hold this table to them. `site` is
 * `SITE_VIEWER_THEME`'s own four, which are site tokens rather than colours.
 */
export const THEME_SLOTS: Record<
    string,
    {
        readonly primary: string;
        readonly viewerBg: string;
        readonly radiusBox: string;
        readonly radiusButtons: string;
    }
> = {
    [SITE_THEME]: {
        primary: 'var(--cta)',
        viewerBg: 'var(--stage)',
        radiusBox: '2px',
        radiusButtons: '2px',
    },
    light: {
        primary: 'oklch(78% 0.15 80)',
        viewerBg: 'oklch(100% 0 0)',
        radiusBox: '0.5rem',
        radiusButtons: '1rem',
    },
    dark: {
        primary: 'oklch(78% 0.15 80)',
        viewerBg: 'oklch(25.33% 0.016 252.42)',
        radiusBox: '0.5rem',
        radiusButtons: '1rem',
    },
    teal: {
        primary: 'oklch(85% 0.138 181.071)',
        viewerBg: 'oklch(97.788% 0.004 56.375)',
        radiusBox: '0',
        radiusButtons: '0',
    },
    dracula: {
        primary: 'oklch(75.461% 0.183 346.812)',
        viewerBg: 'oklch(28.822% 0.022 277.508)',
        radiusBox: '0',
        radiusButtons: '0',
    },
};

/** The slot values of the theme currently chosen. */
function own(settings: HeroSettings) {
    return THEME_SLOTS[settings.theme];
}

export type HeroTheme = typeof SITE_THEME | BuiltInTheme;

/**
 * What the panel is set to: a viewer configuration, a theme, and the four
 * theme slots the page offers off it.
 *
 * The slots are nullable because "unset" is a real state and not the same as
 * holding the value the theme would have given anyway. A null slot follows the
 * theme as it changes; one set to the same colour would not, and would emit a
 * `themeConfig` line that changes nothing. Which chip is lit is the same either
 * way, so the difference is invisible on the page and load-bearing in the
 * snippet.
 */
export type HeroSettings = {
    readonly theme: HeroTheme;
    readonly primary: string | null;
    readonly viewerBg: string | null;
    readonly radiusBox: string | null;
    readonly radiusButtons: string | null;
    readonly config: ViewerConfig;
};

/**
 * The chips a slot offers: every value some theme sets, and two that are
 * nobody's.
 *
 * Every theme's own value has to be in the set, or choosing a theme would move
 * the knob to a value it could not show. The two extras are what makes the row
 * a demonstration rather than a readout — the point is that the slot takes any
 * colour, and a row of only the built-ins' own would suggest otherwise. A fixed
 * set rather than a picker all the same: a picker is `/configure/`'s job.
 */
export const PRIMARIES: readonly string[] = [
    THEME_SLOTS[SITE_THEME].primary,
    THEME_SLOTS.light.primary,
    THEME_SLOTS.teal.primary,
    THEME_SLOTS.dracula.primary,
    'oklch(60% 0.14 250)',
    'oklch(62% 0.13 145)',
];

/** Grounds the material can sit on, from a photographer's black to paper. */
export const VIEWER_BGS: readonly string[] = [
    THEME_SLOTS[SITE_THEME].viewerBg,
    THEME_SLOTS.light.viewerBg,
    THEME_SLOTS.teal.viewerBg,
    THEME_SLOTS.dark.viewerBg,
    THEME_SLOTS.dracula.viewerBg,
    'oklch(0% 0 0)',
];

/** Every radius some theme sets, plus one rounder than any of them. */
export const RADII: readonly string[] = ['0', '2px', '0.5rem', '1rem'];

/** How a knob renders, which is decided by what it sets rather than by taste. */
export type KnobKind = 'segments' | 'swatches';

export type Knob = {
    /** The configuration leaf it writes, which is also its label. */
    readonly path: string;
    readonly kind: KnobKind;
    readonly values: readonly string[];
    readonly read: (settings: HeroSettings) => string;
    readonly write: (settings: HeroSettings, value: string) => HeroSettings;
    /**
     * Why this knob currently sets nothing, where that is so.
     *
     * The viewer collapses parts of its own surface — no toolbar rail exists in
     * `unified` controls, and a closed gallery has no side to dock to — and a
     * knob that silently stops working is worse than one that says why. It is
     * also the clearest evidence on the page that these are settings with real
     * interactions rather than a list of presets.
     */
    readonly inert?: (settings: HeroSettings) => string | undefined;
};

function withConfig(
    settings: HeroSettings,
    config: ViewerConfig,
): HeroSettings {
    return { ...settings, config: { ...settings.config, ...config } };
}

const HORIZONTAL_GALLERY_SIZE = 150;

function gallerySize(
    dockPosition:
        | NonNullable<ViewerConfig['gallery']>['dockPosition']
        | undefined,
): number | undefined {
    return dockPosition === 'top' || dockPosition === 'bottom'
        ? HORIZONTAL_GALLERY_SIZE
        : undefined;
}

export const THEME_KNOBS: readonly Knob[] = [
    {
        path: 'theme',
        kind: 'segments',
        values: [SITE_THEME, 'light', 'dark', 'teal', 'dracula'],
        read: (settings) => settings.theme,
        // A theme takes every slot with it, including ones a reader had moved.
        // On a front page a preset has to be a whole look a reader can see in
        // one click; a slot that quietly survived it would leave the viewer
        // showing something no theme actually describes.
        write: (settings, value) => ({
            ...settings,
            theme: value as HeroTheme,
            primary: null,
            viewerBg: null,
            radiusBox: null,
            radiusButtons: null,
        }),
    },
    {
        path: 'themeConfig.primary',
        kind: 'swatches',
        values: PRIMARIES,
        read: (settings) => settings.primary ?? own(settings).primary,
        write: (settings, value) => ({
            ...settings,
            // Standing on the theme's own value is not an override of it.
            primary: value === own(settings).primary ? null : value,
        }),
    },
    {
        path: 'themeConfig.viewerBg',
        kind: 'swatches',
        values: VIEWER_BGS,
        read: (settings) => settings.viewerBg ?? own(settings).viewerBg,
        write: (settings, value) => ({
            ...settings,
            viewerBg: value === own(settings).viewerBg ? null : value,
        }),
    },
    {
        path: 'themeConfig.radiusBox',
        kind: 'segments',
        values: RADII,
        read: (settings) => settings.radiusBox ?? own(settings).radiusBox,
        write: (settings, value) => ({
            ...settings,
            radiusBox: value === own(settings).radiusBox ? null : value,
        }),
    },
    {
        path: 'themeConfig.radiusButtons',
        kind: 'segments',
        values: RADII,
        read: (settings) =>
            settings.radiusButtons ?? own(settings).radiusButtons,
        write: (settings, value) => ({
            ...settings,
            radiusButtons: value === own(settings).radiusButtons ? null : value,
        }),
    },
];

/**
 * The layout knobs the front page carries.
 *
 * Seven of the eight the viewer declares. `nav.align` is left to
 * `/configure/`: it is the one whose effect a reader is least likely to see at
 * a glance, and a panel that fits without scrolling is worth more here than
 * completeness the heading already states honestly.
 */
export const LAYOUT_KNOBS: readonly Knob[] = [
    {
        path: 'controls',
        kind: 'segments',
        values: ['split', 'unified'],
        read: (settings) => settings.config.controls ?? 'split',
        write: (settings, value) =>
            withConfig(settings, {
                controls: value as ViewerConfig['controls'],
            }),
    },
    {
        path: 'nav.style',
        kind: 'segments',
        values: ['docked', 'floating'],
        read: (settings) => settings.config.nav?.style ?? 'docked',
        write: (settings, value) =>
            withConfig(settings, {
                nav: {
                    ...settings.config.nav,
                    style: value as NonNullable<ViewerConfig['nav']>['style'],
                },
            }),
    },
    {
        path: 'nav.edge',
        kind: 'segments',
        values: ['top', 'bottom'],
        read: (settings) => settings.config.nav?.edge ?? 'bottom',
        write: (settings, value) =>
            withConfig(settings, {
                nav: {
                    ...settings.config.nav,
                    edge: value as NonNullable<ViewerConfig['nav']>['edge'],
                },
            }),
    },
    {
        path: 'toolbar.side',
        kind: 'segments',
        values: ['left', 'right'],
        read: (settings) => settings.config.toolbar?.side ?? 'left',
        write: (settings, value) =>
            withConfig(settings, {
                toolbar: {
                    ...settings.config.toolbar,
                    side: value as NonNullable<ViewerConfig['toolbar']>['side'],
                },
            }),
        inert: (settings) =>
            settings.config.controls === 'unified'
                ? 'no rail in unified'
                : undefined,
    },
    {
        path: 'toolbar.anchor',
        kind: 'segments',
        values: ['center', 'top'],
        read: (settings) => settings.config.toolbar?.anchor ?? 'center',
        write: (settings, value) =>
            withConfig(settings, {
                toolbar: {
                    ...settings.config.toolbar,
                    anchor: value as NonNullable<
                        ViewerConfig['toolbar']
                    >['anchor'],
                },
            }),
        inert: (settings) =>
            settings.config.controls === 'unified'
                ? 'no rail in unified'
                : undefined,
    },
    {
        path: 'gallery.open',
        kind: 'segments',
        values: ['closed', 'open'],
        read: (settings) => (settings.config.gallery?.open ? 'open' : 'closed'),
        write: (settings, value) => {
            const dockPosition =
                settings.config.gallery?.dockPosition ?? 'bottom';
            return withConfig(settings, {
                gallery: {
                    ...settings.config.gallery,
                    open: value === 'open',
                    size: gallerySize(dockPosition),
                },
            });
        },
    },
    {
        path: 'gallery.dockPosition',
        kind: 'segments',
        values: ['left', 'right', 'top', 'bottom'],
        read: (settings) => settings.config.gallery?.dockPosition ?? 'bottom',
        write: (settings, value) => {
            const dockPosition = value as NonNullable<
                ViewerConfig['gallery']
            >['dockPosition'];
            return withConfig(settings, {
                gallery: {
                    ...settings.config.gallery,
                    dockPosition,
                    size: gallerySize(dockPosition),
                },
            });
        },
        inert: (settings) =>
            settings.config.gallery?.open ? undefined : 'gallery closed',
    },
];

/**
 * What each group's heading says the whole surface is, behind the ten shown.
 *
 * Both counts are held to the code by `tests/unit/hero-knobs.test.ts`: the slot
 * count against `ThemeConfig` in the committed API report, and the arrangement
 * count against the value lists the viewer declares, including the two rules
 * that collapse some of them. A number in marketing copy that nothing checks is
 * a number that quietly stops being true.
 */
export const THEME_SAY = '4 built-ins, 44 typed slots, or your own tokens';
export const LAYOUT_SAY = '8 settings, 240 distinct arrangements';

/**
 * Where the page starts, and what the prerendered chrome is drawn for.
 *
 * `ChromeSkeleton` draws this arrangement and nothing else, so a reader whose
 * script has not run — or never runs — sees the chrome the live viewer is about
 * to land in the same places. The cycle only moves once the page has loaded.
 *
 * Every panel the sequence opens is declared closed here rather than left to
 * its default, because the sequence loops back to this state: a setting the
 * last lap turned on and this one never mentions would survive the restart.
 */
export const HERO_START: HeroSettings = {
    theme: SITE_THEME,
    primary: null,
    viewerBg: null,
    radiusBox: null,
    radiusButtons: null,
    config: {
        controls: 'split',
        viewingMode: 'continuous',
        toolbarOpen: false,
        toolbar: { side: 'left', anchor: 'center' },
        nav: { style: 'docked', edge: 'bottom', align: 'center' },
        gallery: { open: false },
        information: { open: false, position: 'right' },
    },
};

/**
 * How long the step that opens a group holds, in milliseconds. The rest of a
 * group holds half as long — see {@link HERO_SEQUENCE}.
 *
 * Short enough that the opener does not outlast the canvases it turns through
 * — {@link HERO_STRIDE} moves at {@link HERO_STRIDE_PAUSE} apiece — because a
 * lap whose first step is still turning pages when its second arrives is one
 * where a reader cannot tell which of the two moved the chrome.
 */
export const HERO_DWELL = 2400;

export const ALL_KNOBS: readonly Knob[] = [...THEME_KNOBS, ...LAYOUT_KNOBS];

export function knobAt(path: string): Knob | undefined {
    return ALL_KNOBS.find((knob) => knob.path === path);
}

/** One edit to what the panel is set to: the unit a scripted step is built of. */
type Change = (settings: HeroSettings) => HeroSettings;

/** A knob moved to one of its values, which is most of what the script does. */
function move(path: string, value: string): Change {
    return (settings) => knobAt(path)!.write(settings, value);
}

/** A configuration key the panel offers no knob for. */
function set(config: ViewerConfig): Change {
    return (settings) => withConfig(settings, config);
}

/** The information pane, whose two settings the script moves separately. */
function info(patch: NonNullable<ViewerConfig['information']>): Change {
    return (settings) =>
        withConfig(settings, {
            information: { ...settings.config.information, ...patch },
        });
}

/**
 * The four runs the sequence is made of, in the order a reader meets them.
 *
 * Grouping is what turns a list of twitches into an argument. Each run takes
 * one part of the viewer's surface and works through it while the rest of the
 * arrangement holds still, so a reader can see what the setting under
 * discussion actually does — and each run leaves the arrangement the next one
 * starts from, which is why the order is not arbitrary and the runs cannot be
 * shuffled.
 */
const GROUPS = {
    controls: 'Toolbar and controls',
    gallery: 'Gallery',
    panels: 'Panels',
    theme: 'Theme',
} as const;

type Beat = {
    readonly group: string;
    readonly changes: readonly Change[];
};

const SCRIPT: readonly Beat[] = [
    // Toolbar and controls. A split rail on the left with the nav docked to the
    // bottom edge — where the page starts, and what its prerendered chrome
    // draws — then the same buttons through every arrangement the viewer offers
    // for them.
    { group: GROUPS.controls, changes: [] },
    { group: GROUPS.controls, changes: [set({ toolbarOpen: true })] },
    { group: GROUPS.controls, changes: [move('controls', 'unified')] },
    {
        group: GROUPS.controls,
        changes: [
            set({ toolbarOpen: false }),
            move('themeConfig.radiusButtons', '1rem'),
            move('nav.style', 'floating'),
        ],
    },
    {
        group: GROUPS.controls,
        changes: [
            move('controls', 'split'),
            move('toolbar.side', 'right'),
            set({ toolbarOpen: true }),
        ],
    },
    { group: GROUPS.controls, changes: [set({ toolbarOpen: false })] },
    {
        group: GROUPS.controls,
        changes: [move('controls', 'unified'), move('nav.edge', 'top')],
    },
    { group: GROUPS.controls, changes: [move('nav.edge', 'bottom')] },

    // Gallery. Docked to each of its four sides in turn and back to the one it
    // opened on, so the run closes where it began and the setting is the only
    // thing a reader has watched move.
    {
        group: GROUPS.gallery,
        changes: [
            move('gallery.dockPosition', 'bottom'),
            move('gallery.open', 'open'),
        ],
    },
    { group: GROUPS.gallery, changes: [move('gallery.dockPosition', 'left')] },
    { group: GROUPS.gallery, changes: [move('gallery.dockPosition', 'top')] },
    { group: GROUPS.gallery, changes: [move('gallery.dockPosition', 'right')] },
    {
        group: GROUPS.gallery,
        changes: [move('gallery.dockPosition', 'bottom')],
    },

    // Panels. The chrome the reader opens rather than the chrome that is always
    // there, stacked onto an arrangement that already carries a gallery.
    { group: GROUPS.panels, changes: [set({ toolbarOpen: true })] },
    { group: GROUPS.panels, changes: [info({ open: true })] },
    { group: GROUPS.panels, changes: [info({ position: 'left' })] },

    // Theme. The four built-ins and then the site's own tokens, over an
    // arrangement that does not move: the run's whole claim is that a theme
    // changes nothing about where the chrome is.
    { group: GROUPS.theme, changes: [move('theme', 'light')] },
    { group: GROUPS.theme, changes: [move('theme', 'dark')] },
    { group: GROUPS.theme, changes: [move('theme', 'teal')] },
    { group: GROUPS.theme, changes: [move('theme', 'dracula')] },
    { group: GROUPS.theme, changes: [move('theme', SITE_THEME)] },
];

/** One stop of the sequence: what the panel is set to, and for how long. */
export type Step = {
    readonly settings: HeroSettings;
    readonly dwell: number;
    readonly group: string;
    /**
     * Whether this step opens its group, which is what earns the full dwell.
     *
     * The opener establishes an arrangement and the rest of the run works one
     * setting inside it, so the two are not worth the same time: a reader needs
     * to read a new arrangement and only to notice a value change.
     */
    readonly opens: boolean;
};

/**
 * The sequence the hero walks, as the settings each step lands on.
 *
 * Written rather than drawn. A shuffle tours more of the surface, but it tours
 * it as a list of unrelated twitches: a reader cannot tell a setting that
 * changed from one the last step happened to leave alone, and no two readers
 * see the same page. A route is a demonstration, and each of its steps means
 * something because of the one before it.
 *
 * The script is deltas and this is what they accumulate to, so a step holds the
 * whole arrangement rather than a change to whatever the reader left behind.
 * The last step's settings are not the first's, and the loop back to step one
 * is itself a visible move: a whole arrangement collapsing back to the plain
 * one the page was served with.
 */
export const HERO_SEQUENCE: readonly Step[] = SCRIPT.reduce<Step[]>(
    (steps, beat) => {
        const previous = steps.at(-1);
        const opens = previous?.group !== beat.group;
        return [
            ...steps,
            {
                settings: beat.changes.reduce(
                    (settings, change) => change(settings),
                    previous?.settings ?? HERO_START,
                ),
                dwell: opens ? HERO_DWELL : HERO_DWELL / 2,
                group: beat.group,
                opens,
            },
        ];
    },
    [],
);

/** A run of the sequence, and the steps it holds, for drawing its dots. */
export type HeroGroup = {
    readonly name: string;
    /** Indices into {@link HERO_SEQUENCE}, in order. */
    readonly steps: readonly number[];
};

export const HERO_GROUPS: readonly HeroGroup[] = HERO_SEQUENCE.reduce<
    HeroGroup[]
>((groups, step, at) => {
    if (step.opens) return [...groups, { name: step.group, steps: [at] }];
    const open = groups[groups.length - 1];
    return [
        ...groups.slice(0, -1),
        { name: open.name, steps: [...open.steps, at] },
    ];
}, []);

/** Where in {@link HERO_SEQUENCE} the panel currently stands. */
export type Cycle = { readonly at: number };

export const HERO_CYCLE_START: Cycle = { at: 0 };

/**
 * How many canvases the material moves on by at the top of each lap, and how
 * many before the first one.
 *
 * The sequence stands still on one canvas while it walks: the argument is that
 * the chrome recomposes, and material moving underneath it is the one thing
 * that could be mistaken for the chrome being rebuilt. Between laps it moves
 * instead, and by a stride that does not divide eleven, so the resting canvas
 * is a different one each time round and the whole set is reached eventually.
 *
 * The first lap moves two rather than three: the page is served on the first
 * canvas, and three would skip the opening of the material a reader has just
 * been looking at while the viewer loaded.
 */
export const HERO_STRIDE = 3;
export const HERO_FIRST_STRIDE = 2;

/**
 * How long the material rests on each canvas of a stride, in milliseconds.
 *
 * A stride is walked rather than jumped: three canvases arriving at once is a
 * cut, and a cut is the one thing that looks like the viewer rebuilding itself.
 * Played one at a time the same three canvases are a reader turning pages,
 * which is what the renderer's own motion is tuned for and what makes the point
 * that the material moves under chrome that does not.
 */
export const HERO_STRIDE_PAUSE = 600;

/**
 * The canvas moves a stride is made of, and the heading it leaves behind.
 *
 * Moves rather than a destination: the viewer's own `nextCanvas` and
 * `previousCanvas` are what the chrome's arrows call, and going through them
 * means the hero moves the material by exactly the path a reader could have
 * taken. It also keeps this a pure function of an index, which is the only way
 * the reflection is worth trusting.
 *
 * Reflecting rather than wrapping. A stride of three over eleven canvases that
 * wrapped would rest on the same three forever; turning round at each end
 * shifts the phase every crossing, so the resting canvas works through the
 * whole set. `heading` is carried out and back in so the turn survives between
 * laps.
 *
 * Fewer moves than asked for when the material cannot supply them — a manifest
 * of one canvas supplies none.
 */
export function strideMoves(
    index: number,
    total: number,
    heading: 1 | -1,
    count: number,
): { moves: readonly (1 | -1)[]; heading: 1 | -1 } {
    const moves: (1 | -1)[] = [];
    let at = index;
    let going = heading;
    const off = (from: number, by: 1 | -1) =>
        from + by < 0 || from + by >= total;

    for (let step = 0; step < count; step += 1) {
        if (off(at, going)) going = -going as 1 | -1;
        if (off(at, going)) break;
        at += going;
        moves.push(going);
    }
    return { moves, heading: going };
}

/** The step the panel currently stands on. */
export function stepAt(cycle: Cycle): Step {
    return HERO_SEQUENCE[cycle.at];
}

/** Take the next step, wrapping back to the start of the sequence. */
export function advance(cycle: Cycle): {
    settings: HeroSettings;
    cycle: Cycle;
} {
    const at = (cycle.at + 1) % HERO_SEQUENCE.length;
    return { settings: HERO_SEQUENCE[at].settings, cycle: { at } };
}

/** Take the previous step, wrapping back to the end of the sequence. */
export function retreat(cycle: Cycle): {
    settings: HeroSettings;
    cycle: Cycle;
} {
    const at = (cycle.at + HERO_SEQUENCE.length - 1) % HERO_SEQUENCE.length;
    return { settings: HERO_SEQUENCE[at].settings, cycle: { at } };
}

/**
 * The theme the viewer is given, as its two props.
 *
 * On `site` the viewer wears the site's own tokens and no built-in is set,
 * because a built-in would win over them. On any other choice the built-in is
 * the base and only the slots a reader has moved are layered on top — which is
 * the relationship the snippet is trying to teach, and it only holds if the
 * site's tokens are not silently mixed in underneath.
 */
export function heroTheme(settings: HeroSettings): {
    theme?: BuiltInTheme;
    themeConfig?: ThemeConfig;
} {
    const slots: ThemeConfig = {};
    if (settings.primary !== null) slots.primary = settings.primary;
    if (settings.viewerBg !== null) slots.viewerBg = settings.viewerBg;
    if (settings.radiusBox !== null) slots.radiusBox = settings.radiusBox;
    if (settings.radiusButtons !== null)
        slots.radiusButtons = settings.radiusButtons;

    if (settings.theme === SITE_THEME) {
        return { themeConfig: { ...SITE_VIEWER_THEME, ...slots } };
    }
    // Always an object, never undefined: an undefined `themeConfig` prop takes
    // the embed's default, which is the site's own tokens, and those would sit
    // on top of the built-in and hide the preset a reader just chose.
    return { theme: settings.theme, themeConfig: slots };
}

/** The configuration the panel is set to, as source a reader can copy. */
export function heroSnippet(settings: HeroSettings): string {
    const { config } = settings;
    const lines = ['const config = {'];

    if (settings.theme !== SITE_THEME) {
        lines.push(`    theme: '${settings.theme}',`);
    }
    lines.push(`    viewingMode: '${config.viewingMode}',`);
    lines.push(`    controls: '${config.controls}',`);
    if (config.controls !== 'unified') {
        lines.push(
            `    toolbar: { side: '${config.toolbar?.side}', anchor: '${config.toolbar?.anchor}' },`,
        );
    }
    if (config.toolbarOpen) lines.push('    toolbarOpen: true,');
    lines.push(
        `    nav: { style: '${config.nav?.style}', edge: '${config.nav?.edge}', align: '${config.nav?.align}' },`,
    );
    lines.push(
        config.gallery?.open
            ? `    gallery: { open: true, dockPosition: '${config.gallery.dockPosition}'${config.gallery.size === undefined ? '' : `, size: ${config.gallery.size}`} },`
            : '    gallery: { open: false },',
    );
    if (config.information?.open) {
        lines.push(
            `    information: { open: true, position: '${config.information.position}' },`,
        );
    }
    lines.push('};');

    const moved = [
        settings.primary !== null && `primary: '${settings.primary}'`,
        settings.viewerBg !== null && `viewerBg: '${settings.viewerBg}'`,
        settings.radiusBox !== null && `radiusBox: '${settings.radiusBox}'`,
        settings.radiusButtons !== null &&
            `radiusButtons: '${settings.radiusButtons}'`,
    ].filter((slot): slot is string => slot !== false);

    if (settings.theme === SITE_THEME) {
        lines.push('');
        lines.push(
            '// No built-in theme: the viewer wears this page’s tokens.',
        );
        lines.push(
            `const themeConfig = { ${[
                "viewerBg: 'var(--stage)'",
                "content: 'var(--ink)'",
                ...moved,
            ].join(', ')}, … };`,
        );
    } else if (moved.length > 0) {
        lines.push('');
        lines.push('// Slots moved off the preset arrive as themeConfig.');
        lines.push(`const themeConfig = { ${moved.join(', ')} };`);
    }

    return lines.join('\n');
}
