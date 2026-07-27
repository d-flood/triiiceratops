// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { applyThemeConfig, clearThemeConfig } from './themeManager';
import { CSS_VAR_MAP } from './cssVarMap';
import { PUBLIC_CSS_TOKENS } from './publicTokens';

describe('themeConfig friendly-name overrides map to --tri-* vars', () => {
    it('applies a friendly color override to the namespaced token', () => {
        const el = document.createElement('div');
        applyThemeConfig(el, { primary: '#3b82f6' });

        // The friendly `primary` key writes the namespaced --tri-* token
        // (normalized to oklch), and only namespaced vars are ever written.
        expect(el.style.getPropertyValue('--tri-color-primary')).not.toBe('');
        for (let i = 0; i < el.style.length; i++) {
            const name = el.style.item(i);
            if (name.startsWith('--')) {
                expect(name.startsWith('--tri-')).toBe(true);
            }
        }
    });

    it('applies a non-color friendly override verbatim to the namespaced token', () => {
        const el = document.createElement('div');
        applyThemeConfig(el, { radiusBox: '0.75rem' });
        expect(el.style.getPropertyValue('--tri-radius-box')).toBe('0.75rem');
    });

    it('clears friendly overrides again', () => {
        const el = document.createElement('div');
        applyThemeConfig(el, { primary: '#3b82f6', radiusBox: '0.75rem' });
        clearThemeConfig(el);
        expect(el.style.getPropertyValue('--tri-color-primary')).toBe('');
        expect(el.style.getPropertyValue('--tri-radius-box')).toBe('');
    });

    it('supports the raw cssVars escape hatch for plugin-owned tokens', () => {
        const el = document.createElement('div');
        applyThemeConfig(el, {
            cssVars: { 'tri-my-plugin-panel-bg': '#eef' },
        });
        expect(el.style.getPropertyValue('--tri-my-plugin-panel-bg')).toBe(
            '#eef',
        );
        clearThemeConfig(el);
        expect(el.style.getPropertyValue('--tri-my-plugin-panel-bg')).toBe('');
    });
});

describe('CSS_VAR_MAP is consistent with the public token registry', () => {
    it('maps every friendly name to a --tri-* var (except colorScheme)', () => {
        for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
            if (key === 'colorScheme') {
                expect(cssVar).toBe('color-scheme');
                continue;
            }
            expect(cssVar, `${key} maps to ${cssVar}`).toMatch(/^--tri-/);
            expect(
                PUBLIC_CSS_TOKENS,
                `${cssVar} must be a documented public token`,
            ).toContain(cssVar);
        }
    });
});
