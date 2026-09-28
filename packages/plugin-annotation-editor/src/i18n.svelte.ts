import { getContext } from 'svelte';

import type { PluginLocaleService } from '@triiiceratops/plugin-sdk';

import { catalog } from './catalog';

export type TFn = (
    key: string,
    params?: Record<string, string | number>,
) => string;

export const LOCALE_T_KEY = Symbol('triiiceratops:plugin-annotation-editor:t');

function interpolate(
    template: string,
    params?: Record<string, string | number>,
): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
    );
}

/** English-catalog resolver used when no host locale service is present. */
export function defaultT(
    key: string,
    params?: Record<string, string | number>,
): string {
    const en = catalog.en ?? {};
    return interpolate(en[key] ?? key, params);
}

/** Resolve the active `t` for a component (context-provided, else English). */
export function useT(): TFn {
    return getContext<TFn | undefined>(LOCALE_T_KEY) ?? defaultT;
}

/**
 * Build a reactive `t` bound to the owning viewer's locale service. The returned
 * `t` reads a `$state` tick bumped on every active-locale change, so template
 * reads re-render when the viewer's locale changes. `unsubscribe` drops the
 * locale subscription (the SDK also auto-releases it on deactivation).
 */
export function createLocaleBridge(locale: PluginLocaleService): {
    t: TFn;
    unsubscribe: () => void;
} {
    let tick = $state(0);
    const unsubscribe = locale.subscribe(() => {
        tick += 1;
    });
    const t: TFn = (key, params) => {
        void tick;
        return locale.t(key, params);
    };
    return { t, unsubscribe };
}
