/*
 * Icon manifest (checked in). The single source of truth for which Phosphor
 * glyphs and weights the core chrome ships. `scripts/generate-icons.ts` reads
 * this file, pulls the matching raw SVGs from the dependency-free
 * `@phosphor-icons/core` devDependency, and emits
 * `src/lib/generated/icons.ts` (gitignored) — a module of raw SVG-inner-content
 * strings rendered by `src/lib/components/Icon.svelte`.
 *
 * Only `CORE_ICONS` is generated, and only at the weights each glyph declares.
 * `Icon.svelte` indexes the table dynamically (`icons[weight]?.[name]`), so a
 * glyph nothing renders can never be tree-shaken out of the element bundle —
 * every surplus entry is shipped bytes. The table is therefore SPARSE: a glyph
 * appears under `bold`/`fill` only where the chrome actually asks for it, and
 * `Icon.svelte`'s `?? icons.regular[name]` fallback keeps an unlisted weight
 * rendering the regular glyph instead of nothing.
 *
 * Sparseness fails silently — a missing entry is a blank square at runtime, not
 * a build error — so `scripts/check-icon-coverage.mjs` re-derives the rendered
 * (name, weight) pairs from the source and fails the build when one is absent.
 * It runs at the head of `build:element`.
 *
 * To add an icon: add its Phosphor PascalCase name below (with any non-regular
 * weights it renders at), then rebuild (`pnpm gen:icons` or any build).
 *
 * Naming: entries use Phosphor's PascalCase component names (e.g. `ArrowClockwise`);
 * the generator maps them to `@phosphor-icons/core` kebab-case asset filenames
 * (`arrow-clockwise.svg`, and `arrow-clockwise-bold.svg` for non-regular weights).
 */

/** The weight vocabulary. `regular` is the default at render and always generated. */
export const ICON_WEIGHTS = ['regular', 'bold', 'fill'] as const;

export type IconWeight = (typeof ICON_WEIGHTS)[number];

/** Weights that must be declared per glyph; `regular` is implicit. */
export type ExtraIconWeight = Exclude<IconWeight, 'regular'>;

/**
 * Glyphs the core chrome and the shared UI package render, mapped to the
 * NON-regular weights each is rendered at. Every listed glyph is generated at
 * `regular`; an empty array means regular only.
 *
 * The `bold` entries are the panel-header glyphs, which `PanelStackSection`
 * renders as `<Icon name={panel.iconName} weight="bold">`. Every other glyph
 * here renders at `regular` only, so `bold` is currently the sole extra weight
 * any of them declares.
 */
export const CORE_ICONS = {
    ArrowsLeftRight: [],
    BookOpen: [],
    CaretDown: [],
    CaretLeft: [],
    CaretRight: [],
    CaretUp: [],
    ChatCenteredText: ['bold'],
    Check: [],
    CornersIn: [],
    CornersOut: [],
    Eye: [],
    EyeSlash: [],
    File: [],
    Folder: ['bold'],
    ImageBroken: [],
    Info: ['bold'],
    List: [],
    ListBullets: ['bold'],
    MagnifyingGlass: ['bold'],
    MagnifyingGlassMinus: [],
    MagnifyingGlassPlus: [],
    Scroll: [],
    Slideshow: [],
    Stack: [],
    Translate: [],
    X: [],
} as const satisfies Record<string, readonly ExtraIconWeight[]>;

export type IconName = keyof typeof CORE_ICONS;

/**
 * Glyphs only the first-party plugin packages render. Recorded here so the
 * shared vocabulary stays in one place, but NOT generated: each plugin inlines
 * the Phosphor path data it needs in its own `src/icons.ts` and hands core a
 * framework-neutral `IconDescriptor`, so none of these ever resolve through
 * core's table. Generating them would put 14 unreachable glyphs (× 3 weights)
 * in every element bundle.
 *
 * Move a name up into `CORE_ICONS` if the core chrome starts rendering it.
 */
export const PLUGIN_ONLY_ICON_NAMES = [
    'ArrowClockwise',
    'CircleHalf',
    'DownloadSimple',
    'Drop',
    'FilePdf',
    'PencilSimple',
    'Plus',
    'Polygon',
    'Rectangle',
    'SelectionInverse',
    'Sliders',
    'Target',
    'Trash',
    'Warning',
] as const;

/** Every glyph name this project knows about, core-rendered or plugin-only. */
export const KNOWN_ICON_NAMES = [
    ...Object.keys(CORE_ICONS),
    ...PLUGIN_ONLY_ICON_NAMES,
] as const;
