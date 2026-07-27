/*
 * Icon manifest (checked in). The single source of truth for which Phosphor
 * glyphs and weights the core chrome ships. `scripts/generate-icons.ts` reads
 * this file, pulls the matching raw SVGs from the dependency-free
 * `@phosphor-icons/core` devDependency, and emits
 * `src/lib/generated/icons.ts` (gitignored) — a module of raw SVG-inner-content
 * strings rendered by `src/lib/components/Icon.svelte`.
 *
 * To add an icon: add its Phosphor PascalCase name below, then rebuild
 * (`pnpm gen:icons` or any build). Only the names listed here are generated, so
 * the production graph never carries `phosphor-svelte` or the full icon set.
 *
 * Naming: entries use Phosphor's PascalCase component names (e.g. `ArrowClockwise`);
 * the generator maps them to `@phosphor-icons/core` kebab-case asset filenames
 * (`arrow-clockwise.svg`, and `arrow-clockwise-bold.svg` for non-regular weights).
 */

/** Weights generated for every listed icon. `regular` is the default at render. */
export const ICON_WEIGHTS = ['regular', 'bold', 'fill'] as const;

/** Phosphor PascalCase names used across the core chrome and first-party plugins. */
export const ICON_NAMES = [
    'ArrowClockwise',
    'ArrowCounterClockwise',
    'ArrowsLeftRight',
    'BookOpen',
    'CaretDown',
    'CaretLeft',
    'CaretRight',
    'CaretUp',
    'ChatCenteredText',
    'Check',
    'CircleHalf',
    'Copy',
    'CornersIn',
    'CornersOut',
    'DownloadSimple',
    'Drop',
    'Eye',
    'EyeSlash',
    'File',
    'FilePdf',
    'Folder',
    'Gear',
    'GithubLogo',
    'ImageBroken',
    'Info',
    'List',
    'ListBullets',
    'ListDashes',
    'MagnifyingGlass',
    'MagnifyingGlassMinus',
    'MagnifyingGlassPlus',
    'Moon',
    'Palette',
    'PencilSimple',
    'Plus',
    'Polygon',
    'Rectangle',
    'Scroll',
    'SelectionInverse',
    'ShareNetwork',
    'Sliders',
    'Slideshow',
    'Stack',
    'Sun',
    'Target',
    'Trash',
    'Warning',
    'X',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
export type IconWeight = (typeof ICON_WEIGHTS)[number];
