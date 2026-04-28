import type { ThemeConfig } from './types';

const CSS_VAR_MAP: Record<keyof ThemeConfig, string> = {
    primary: '--color-primary',
    primaryContent: '--color-primary-content',
    secondary: '--color-secondary',
    secondaryContent: '--color-secondary-content',
    accent: '--color-accent',
    accentContent: '--color-accent-content',
    neutral: '--color-neutral',
    neutralContent: '--color-neutral-content',
    base100: '--color-base-100',
    base200: '--color-base-200',
    base300: '--color-base-300',
    baseContent: '--color-base-content',
    info: '--color-info',
    infoContent: '--color-info-content',
    success: '--color-success',
    successContent: '--color-success-content',
    warning: '--color-warning',
    warningContent: '--color-warning-content',
    error: '--color-error',
    errorContent: '--color-error-content',
    radiusBox: '--radius-box',
    radiusField: '--radius-field',
    radiusSelector: '--radius-selector',
    sizeSelector: '--size-selector',
    sizeField: '--size-field',
    border: '--border',
    depth: '--depth',
    noise: '--noise',
    colorScheme: 'color-scheme',
};

export function getThemeCssVariables(): string[] {
    return Object.values(CSS_VAR_MAP).filter((value) => value !== 'color-scheme');
}

export function getThemePropertyNames(): (keyof ThemeConfig)[] {
    return Object.keys(CSS_VAR_MAP) as (keyof ThemeConfig)[];
}
