/**
 * The site's two colour palettes, and the pairings they are used in.
 *
 * The dark palette is **selected**, not inverted. A warm-paper identity has no
 * automatic dark counterpart, and every accent has to be re-measured against a
 * dark ground: the brand amber is unusable as text or as a data mark on the bone
 * surface (1.99) and comfortable on the dark one (8.09), and the orange has to
 * step *lighter* for dark rather than darker. Both facts come from the design
 * record's measurements; neither falls out of a transformation.
 *
 * Filled colour fields keep their light values in both schemes, because a colour
 * field carries its own ground with it and re-stepping it only weakens the
 * identity. That is why `amber`, `amber-ink`, `cta`, `cta-ink`, `ink-block` and
 * the two inks that sit on it have one value each.
 *
 * This module is the appendix route's source, and the unit suite holds it and
 * `tokens.css` to the same values — the stylesheet renders the palette and
 * cannot import from here, so the agreement is asserted rather than assumed.
 */

export type Scheme = 'light' | 'dark';

export type ColourToken = {
    /** The custom property name, with its `--` prefix. */
    readonly name: string;
    readonly light: string;
    /** Equal to `light` for a token that deliberately does not re-step. */
    readonly dark: string;
    readonly role: string;
};

/**
 * Every colour token in the shell, with both schemes' values.
 *
 * Exhaustive by test: a hex-valued custom property in `tokens.css`'s `:root`
 * that is missing here fails the unit suite, so the appendix cannot fall behind
 * the stylesheet.
 */
export const COLOURS: readonly ColourToken[] = [
    {
        name: '--bone',
        light: '#f7f2e9',
        dark: '#1a1613',
        role: 'Page ground',
    },
    {
        name: '--paper',
        light: '#fffdf9',
        dark: '#221d18',
        role: 'Raised ground',
    },
    {
        name: '--bench',
        light: '#f2ebdd',
        dark: '#14100d',
        role: 'Recessed ground',
    },
    {
        name: '--rail-bg',
        light: '#efe7d9',
        dark: '#201b16',
        role: 'Rail ground',
    },
    {
        name: '--band-1',
        light: '#efe3cd',
        dark: '#302820',
        role: 'Rail tint, group 1',
    },
    {
        name: '--band-2',
        light: '#e9e2d0',
        dark: '#29221a',
        role: 'Rail tint, group 2',
    },
    {
        name: '--band-3',
        light: '#e3ddcb',
        dark: '#231d17',
        role: 'Rail tint, group 3',
    },
    { name: '--ink', light: '#191512', dark: '#f2ebdd', role: 'Body text' },
    {
        name: '--ink-soft',
        light: '#3d362f',
        dark: '#d9cfbd',
        role: 'Secondary text',
    },
    {
        name: '--ink-2',
        light: '#5f564c',
        dark: '#b3a795',
        role: 'Muted and italic text',
    },
    {
        name: '--rule',
        light: '#ded3c1',
        dark: '#3a3229',
        role: 'Hairline rule',
    },
    {
        name: '--rule-2',
        light: '#cabda6',
        dark: '#4a4036',
        role: 'Emphasised rule',
    },
    {
        name: '--link',
        light: '#b84a19',
        dark: '#d9662b',
        role: 'Orange as text — steps lighter in dark, not darker',
    },
    {
        name: '--grid',
        light: '#ded3c1',
        dark: '#332c24',
        role: 'Chart gridline',
    },
    {
        name: '--code-bg',
        light: '#221e1a',
        dark: '#12100d',
        role: 'Code ground',
    },
    {
        name: '--mark',
        light: '#8d8375',
        dark: '#a19582',
        role: 'Data mark, de-emphasised',
    },
    {
        name: '--mark-emphasis',
        light: '#b84a19',
        dark: '#e0a32e',
        role: 'Data mark, emphasised — orange on light, amber on dark',
    },
    // Filled colour fields from here down: one value, both schemes.
    {
        name: '--ink-block',
        light: '#2a2521',
        dark: '#2a2521',
        role: 'Dark filled field',
    },
    {
        name: '--ink-on-dark',
        light: '#e9dfcc',
        dark: '#e9dfcc',
        role: 'Text on the dark field',
    },
    {
        name: '--ink-dim-on-dark',
        light: '#b7aa93',
        dark: '#b7aa93',
        role: 'Muted text on the dark field',
    },
    {
        name: '--cta',
        light: '#b84a19',
        dark: '#b84a19',
        role: 'Orange as a filled field',
    },
    {
        name: '--cta-ink',
        light: '#fff3ea',
        dark: '#fff3ea',
        role: 'Text on the orange field',
    },
    {
        name: '--amber',
        light: '#e0a32e',
        dark: '#e0a32e',
        role: 'Brand amber, filled fields only — never text, never a data mark on light',
    },
    {
        name: '--amber-ink',
        light: '#2b1e04',
        dark: '#2b1e04',
        role: 'Text on the amber field',
    },
];

/** The tokens whose value differs between the schemes, for the stylesheet check. */
export const RESTEPPED: readonly ColourToken[] = COLOURS.filter(
    (token) => token.light !== token.dark,
);

const BY_NAME = new Map(COLOURS.map((token) => [token.name, token]));

export function colour(name: string, scheme: Scheme): string {
    const token = BY_NAME.get(name);
    if (token === undefined) {
        throw new Error(`No colour token named ${name}`);
    }
    return scheme === 'dark' ? token.dark : token.light;
}

export type Pairing = {
    /** The foreground token, used as text. */
    readonly ink: string;
    /** The ground it sits on. */
    readonly ground: string;
    readonly role: string;
};

/**
 * Every pairing in which a token is used as text at body size, in both schemes.
 *
 * These are the pairings that have to clear 4.5. The list is what the shell
 * actually does, not every arithmetic combination: the orange is text on the
 * page grounds and never on a rail band, where it would measure below 4.5 — the
 * rail's own text is the ink and the muted ink.
 *
 * The data marks are absent because they are not text; their non-text threshold
 * is stated separately, and the brand amber's exclusion from marks on the light
 * ground is the whole reason the emphasised mark re-steps.
 */
export const PAIRINGS: readonly Pairing[] = [
    { ink: '--ink', ground: '--bone', role: 'Body text on the page' },
    { ink: '--ink', ground: '--paper', role: 'Body text on a raised ground' },
    { ink: '--ink', ground: '--bench', role: 'Body text on a recessed ground' },
    { ink: '--ink-soft', ground: '--bone', role: 'Lede and prose' },
    { ink: '--ink-soft', ground: '--paper', role: 'Prose on a raised ground' },
    { ink: '--ink-2', ground: '--bone', role: 'Asides and numerals' },
    { ink: '--ink-2', ground: '--paper', role: 'Asides on a raised ground' },
    { ink: '--ink-2', ground: '--bench', role: 'The unlanded-prose notice' },
    { ink: '--ink-2', ground: '--rail-bg', role: 'Rail chrome' },
    { ink: '--ink-2', ground: '--band-1', role: 'Rail numerals, group 1' },
    { ink: '--ink-2', ground: '--band-2', role: 'Rail numerals, group 2' },
    { ink: '--ink-2', ground: '--band-3', role: 'Rail numerals, group 3' },
    { ink: '--link', ground: '--bone', role: 'Links on the page' },
    { ink: '--link', ground: '--paper', role: 'Links on a raised ground' },
    { ink: '--cta-ink', ground: '--cta', role: 'The orange link block' },
    { ink: '--amber-ink', ground: '--amber', role: 'The amber link block' },
    {
        ink: '--ink-on-dark',
        ground: '--ink-block',
        role: 'The dark link block',
    },
    {
        ink: '--ink-dim-on-dark',
        ground: '--ink-block',
        role: 'Muted text on the dark block',
    },
    { ink: '--paper', ground: '--ink', role: 'The skip link' },
];

/** The data marks, which are not text and so answer to the 3:1 threshold. */
export const MARK_PAIRINGS: readonly Pairing[] = [
    { ink: '--mark', ground: '--bone', role: 'De-emphasised mark' },
    { ink: '--mark-emphasis', ground: '--bone', role: 'Emphasised mark' },
];

/** WCAG 2 minimum for text at body size. */
export const AA_TEXT = 4.5;
/** WCAG 2 minimum for a graphical object such as a data mark. */
export const AA_NON_TEXT = 3;

function channel(value: number): number {
    const unit = value / 255;
    return unit <= 0.03928
        ? unit / 12.92
        : Math.pow((unit + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a `#rrggbb` colour, per WCAG 2. */
export function luminance(hex: string): number {
    const value = Number.parseInt(hex.slice(1), 16);
    return (
        0.2126 * channel((value >> 16) & 0xff) +
        0.7152 * channel((value >> 8) & 0xff) +
        0.0722 * channel(value & 0xff)
    );
}

/** Contrast ratio between two `#rrggbb` colours, per WCAG 2. */
export function contrast(a: string, b: string): number {
    const first = luminance(a);
    const second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** A pairing's measured ratio in one scheme, to two decimal places. */
export function ratio(pairing: Pairing, scheme: Scheme): number {
    return (
        Math.round(
            contrast(
                colour(pairing.ink, scheme),
                colour(pairing.ground, scheme),
            ) * 100,
        ) / 100
    );
}

/**
 * The figures the design record states, as the anchor for everything computed
 * from the palette here.
 *
 * The record measured these; this table exists so that a mistyped hex changes a
 * number the suite is watching rather than one nobody has ever seen. Do not
 * adjust a figure to match a value — the palette is the thing that is wrong.
 */
export const RECORDED: readonly {
    readonly pairing: Pairing;
    readonly scheme: Scheme;
    readonly measured: number;
}[] = [
    {
        pairing: { ink: '--ink', ground: '--bone', role: '' },
        scheme: 'light',
        measured: 16.27,
    },
    {
        pairing: { ink: '--link', ground: '--bone', role: '' },
        scheme: 'light',
        measured: 4.67,
    },
    {
        pairing: { ink: '--link', ground: '--paper', role: '' },
        scheme: 'light',
        measured: 5.13,
    },
    {
        pairing: { ink: '--cta-ink', ground: '--cta', role: '' },
        scheme: 'light',
        measured: 4.78,
    },
    {
        pairing: { ink: '--amber-ink', ground: '--amber', role: '' },
        scheme: 'light',
        measured: 7.32,
    },
    {
        pairing: { ink: '--ink-2', ground: '--band-1', role: '' },
        scheme: 'light',
        measured: 5.66,
    },
    {
        pairing: { ink: '--ink-2', ground: '--band-3', role: '' },
        scheme: 'light',
        measured: 5.29,
    },
    {
        pairing: { ink: '--mark', ground: '--bone', role: '' },
        scheme: 'light',
        measured: 3.34,
    },
    {
        pairing: { ink: '--ink', ground: '--bone', role: '' },
        scheme: 'dark',
        measured: 15.16,
    },
    {
        pairing: { ink: '--ink-soft', ground: '--bone', role: '' },
        scheme: 'dark',
        measured: 11.65,
    },
    {
        pairing: { ink: '--ink-2', ground: '--bone', role: '' },
        scheme: 'dark',
        measured: 7.6,
    },
    {
        pairing: { ink: '--link', ground: '--bone', role: '' },
        scheme: 'dark',
        measured: 5.04,
    },
    {
        pairing: { ink: '--mark-emphasis', ground: '--bone', role: '' },
        scheme: 'dark',
        measured: 8.09,
    },
    {
        pairing: { ink: '--mark', ground: '--bone', role: '' },
        scheme: 'dark',
        measured: 6.11,
    },
];

/**
 * The brand amber against the light page ground: the measurement that decides
 * the two values which invert between the schemes.
 *
 * Recorded rather than merely asserted, because it is the reason the emphasised
 * data mark is orange on light and amber on dark — the opposite of what brand
 * instinct wants, and the first thing a later reader will try to "fix".
 */
export const AMBER_ON_BONE = 1.99;
