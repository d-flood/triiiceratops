import type { ThemeConfig } from './types';
import { CSS_VAR_MAP } from './cssVarMap';

export function getThemeCssVariables(): string[] {
    return Object.values(CSS_VAR_MAP).filter(
        (value) => value !== 'color-scheme',
    );
}

export function getThemePropertyNames(): (keyof ThemeConfig)[] {
    return Object.keys(CSS_VAR_MAP) as (keyof ThemeConfig)[];
}
