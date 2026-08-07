import { CSS_VAR_MAP } from './cssVarMap';
export function getThemeCssVariables() {
    return Object.values(CSS_VAR_MAP).filter((value) => value !== 'color-scheme');
}
export function getThemePropertyNames() {
    return Object.keys(CSS_VAR_MAP);
}
