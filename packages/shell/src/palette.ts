/** Dark palette selected, not inverted; filled fields keep light values in both schemes. */

export type Scheme = 'light' | 'dark';

export type ColourToken = {
    readonly name: string;
    readonly light: string;
    readonly dark: string;
    readonly role: string;
};

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
        name: '--stage',
        light: '#e6dfd0',
        dark: '#1e1915',
        role: 'Viewer stage',
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
        role: 'Emphasized rule',
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
        role: 'Data mark, de-emphasized',
    },
    {
        name: '--mark-emphasis',
        light: '#b84a19',
        dark: '#e0a32e',
        role: 'Data mark, emphasized — orange on light, amber on dark',
    },
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

export const PAIRINGS: readonly Pairing[] = [
    { ink: '--ink', ground: '--bone', role: 'Body text on the page' },
    { ink: '--ink', ground: '--paper', role: 'Body text on a raised ground' },
    { ink: '--ink', ground: '--bench', role: 'Body text on a recessed ground' },
    { ink: '--ink', ground: '--stage', role: 'Viewer text on its stage' },
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

export const MARK_PAIRINGS: readonly Pairing[] = [
    { ink: '--mark', ground: '--bone', role: 'De-emphasized mark' },
    { ink: '--mark-emphasis', ground: '--bone', role: 'Emphasized mark' },
];

export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

function channel(value: number): number {
    const unit = value / 255;
    return unit <= 0.03928
        ? unit / 12.92
        : Math.pow((unit + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
    const value = Number.parseInt(hex.slice(1), 16);
    return (
        0.2126 * channel((value >> 16) & 0xff) +
        0.7152 * channel((value >> 8) & 0xff) +
        0.0722 * channel(value & 0xff)
    );
}

export function contrast(a: string, b: string): number {
    const first = luminance(a);
    const second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

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

/** Do not adjust a figure to match a value — the palette is wrong. */
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

/** Amber on bone: 1.99, which is why the emphasized mark re-steps. */
export const AMBER_ON_BONE = 1.99;
