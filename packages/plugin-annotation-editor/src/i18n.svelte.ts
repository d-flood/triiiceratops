/**
 * Localization seam for the plugin's Svelte UI.
 *
 * In production, `view.mount` builds a reactive bridge over the SDK's per-viewer
 * {@link PluginLocaleService} (bound to the viewer's active locale + this
 * package's catalog) and hands the resulting `t` to the components through Svelte
 * context. Reading `t(key)` in a template tracks a `$state` tick the bridge bumps
 * on every active-locale change, so mounted UI re-renders in the new language.
 *
 * When a component is mounted directly with no context (the unit tests), `useT`
 * falls back to {@link defaultT}, which resolves against the English catalog — so
 * the tests observe stable English strings without a host locale service.
 */
import { getContext } from 'svelte';

import type { PluginLocaleService } from '@triiiceratops/plugin-sdk';

import { catalog } from './catalog';

export type TFn = (
    key: string,
    params?: Record<string, string | number>,
) => string;

/** Context key under which `view.mount` provides the reactive `t`. */
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
