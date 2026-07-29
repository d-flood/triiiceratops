// `definePlugin` metadata contract.
//
// Focus: `name` (package-qualified IDENTITY — registry key, style namespace)
// stays distinct from `title` (the chrome DISPLAY COPY core resolves against the
// plugin's own catalog). A plugin that omits `title` must carry no `title` at
// all, so core can fall through to its pre-`title` behavior.

import { describe, expect, it } from 'vitest';

import { definePlugin } from './definePlugin';

const ICON = {
    kind: 'svg',
    inner: '<circle />',
    viewBox: '0 0 1 1',
} as const;

const BASE = {
    name: '@triiiceratops/plugin-x',
    version: '1.0.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    icon: ICON,
    view: { mount: () => () => {} },
};

describe('definePlugin metadata', () => {
    it('carries `title` through to the returned plugin, distinct from `name`', () => {
        const plugin = definePlugin({ ...BASE, title: 'x_title' });

        expect(plugin.title).toBe('x_title');
        // Identity is untouched: it still keys the registry and the style
        // namespace.
        expect(plugin.name).toBe('@triiiceratops/plugin-x');
    });

    it('leaves `title` undefined (not empty) when omitted', () => {
        const plugin = definePlugin(BASE);

        expect(plugin.title).toBeUndefined();
    });
});
