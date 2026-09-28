/** The front page's configuration surface, as knobs. */

import type { BuiltInTheme, ThemeConfig } from 'triiiceratops';

import type { ViewerConfig } from './viewerConfig';
import { SITE_VIEWER_THEME } from './viewerTheme';

export const SITE_THEME = 'site';

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

function own(settings: HeroSettings) {
    return THEME_SLOTS[settings.theme];
}

export type HeroTheme = typeof SITE_THEME | BuiltInTheme;

export type HeroSettings = {
    readonly theme: HeroTheme;
    readonly primary: string | null;
    readonly viewerBg: string | null;
    readonly radiusBox: string | null;
    readonly radiusButtons: string | null;
    readonly config: ViewerConfig;
};

export const PRIMARIES: readonly string[] = [
    THEME_SLOTS[SITE_THEME].primary,
    THEME_SLOTS.light.primary,
    THEME_SLOTS.teal.primary,
    THEME_SLOTS.dracula.primary,
    'oklch(60% 0.14 250)',
    'oklch(62% 0.13 145)',
];

export const VIEWER_BGS: readonly string[] = [
    THEME_SLOTS[SITE_THEME].viewerBg,
    THEME_SLOTS.light.viewerBg,
    THEME_SLOTS.teal.viewerBg,
    THEME_SLOTS.dark.viewerBg,
    THEME_SLOTS.dracula.viewerBg,
    'oklch(0% 0 0)',
];

export const RADII: readonly string[] = ['0', '2px', '0.5rem', '1rem'];

export type KnobKind = 'segments' | 'swatches';

export type Knob = {
    readonly path: string;
    readonly kind: KnobKind;
    readonly values: readonly string[];
    readonly read: (settings: HeroSettings) => string;
    readonly write: (settings: HeroSettings, value: string) => HeroSettings;
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

export const THEME_SAY = '4 built-ins, 49 typed slots, or your own tokens';
export const LAYOUT_SAY = '8 settings, 240 distinct arrangements';

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

export const HERO_DWELL = 2400;

export const ALL_KNOBS: readonly Knob[] = [...THEME_KNOBS, ...LAYOUT_KNOBS];

export function knobAt(path: string): Knob | undefined {
    return ALL_KNOBS.find((knob) => knob.path === path);
}

type Change = (settings: HeroSettings) => HeroSettings;

function move(path: string, value: string): Change {
    return (settings) => knobAt(path)!.write(settings, value);
}

function set(config: ViewerConfig): Change {
    return (settings) => withConfig(settings, config);
}

function info(patch: NonNullable<ViewerConfig['information']>): Change {
    return (settings) =>
        withConfig(settings, {
            information: { ...settings.config.information, ...patch },
        });
}

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

    { group: GROUPS.panels, changes: [set({ toolbarOpen: true })] },
    { group: GROUPS.panels, changes: [info({ open: true })] },
    { group: GROUPS.panels, changes: [info({ position: 'left' })] },

    { group: GROUPS.theme, changes: [move('theme', 'light')] },
    { group: GROUPS.theme, changes: [move('theme', 'dark')] },
    { group: GROUPS.theme, changes: [move('theme', 'teal')] },
    { group: GROUPS.theme, changes: [move('theme', 'dracula')] },
    { group: GROUPS.theme, changes: [move('theme', SITE_THEME)] },
];

export type Step = {
    readonly settings: HeroSettings;
    readonly dwell: number;
    readonly group: string;
    readonly opens: boolean;
};

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

export type HeroGroup = {
    readonly name: string;
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

export type Cycle = { readonly at: number };

export const HERO_CYCLE_START: Cycle = { at: 0 };

export function stepAt(cycle: Cycle): Step {
    return HERO_SEQUENCE[cycle.at];
}

export function advance(cycle: Cycle): {
    settings: HeroSettings;
    cycle: Cycle;
} {
    const at = (cycle.at + 1) % HERO_SEQUENCE.length;
    return { settings: HERO_SEQUENCE[at].settings, cycle: { at } };
}

export function retreat(cycle: Cycle): {
    settings: HeroSettings;
    cycle: Cycle;
} {
    const at = (cycle.at + HERO_SEQUENCE.length - 1) % HERO_SEQUENCE.length;
    return { settings: HERO_SEQUENCE[at].settings, cycle: { at } };
}

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
    // Undefined `themeConfig` takes the embed's default and hides the preset.
    return { theme: settings.theme, themeConfig: slots };
}

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
