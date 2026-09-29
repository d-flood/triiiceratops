// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { applyThemeConfig, clearThemeConfig } from './themeManager';
import { CSS_VAR_MAP } from './cssVarMap';
import { getThemeCssVariables, getThemePropertyNames } from './introspection';
import { PUBLIC_CSS_TOKENS } from './publicTokens';

describe('themeConfig friendly-name overrides map to --tri-* vars', () => {
    it('applies a friendly color override to the namespaced token', () => {
        const el = document.createElement('div');
        applyThemeConfig(el, { primary: '#3b82f6' });

        // The friendly `primary` key writes the namespaced --tri-* token, and
        // only namespaced vars are ever written.
        expect(el.style.getPropertyValue('--tri-color-primary')).toBe(
            '#3b82f6',
        );
        for (let i = 0; i < el.style.length; i++) {
            const name = el.style.item(i);
            if (name.startsWith('--')) {
                expect(name.startsWith('--tri-')).toBe(true);
            }
        }
    });

    it.each([
        ['hex', '#3b82f6'],
        ['rgb', 'rgb(59, 130, 246)'],
        ['oklch', 'oklch(60% 0.25 250)'],
        ['named', 'rebeccapurple'],
    ])('reads a %s color back as the author wrote it', (_syntax, value) => {
        const el = document.createElement('div');
        applyThemeConfig(el, { primary: value });
        expect(el.style.getPropertyValue('--tri-color-primary')).toBe(value);
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
        for (const [key, { cssVar }] of Object.entries(CSS_VAR_MAP)) {
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

const EXPECTED_VARS: [string, string][] = [
    ['primary', '--tri-color-primary'],
    ['primaryContent', '--tri-color-primary-content'],
    ['neutral', '--tri-color-neutral'],
    ['neutralContent', '--tri-color-neutral-content'],
    ['success', '--tri-color-success'],
    ['successContent', '--tri-color-success-content'],
    ['warning', '--tri-color-warning'],
    ['warningContent', '--tri-color-warning-content'],
    ['error', '--tri-color-error'],
    ['errorContent', '--tri-color-error-content'],
    ['viewerBg', '--tri-viewer-bg'],
    ['toolbarBg', '--tri-toolbar-bg'],
    ['panelBg', '--tri-panel-bg'],
    ['galleryBg', '--tri-gallery-bg'],
    ['inputBg', '--tri-input-bg'],
    ['surfaceBorder', '--tri-surface-border'],
    ['content', '--tri-content'],
    ['panelContent', '--tri-panel-content'],
    ['toolbarContent', '--tri-toolbar-content'],
    ['viewerContent', '--tri-viewer-content'],
    ['galleryContent', '--tri-gallery-content'],
    ['metadataPanelBg', '--tri-metadata-panel-bg'],
    ['metadataPanelContent', '--tri-metadata-panel-content'],
    ['annotationsPanelBg', '--tri-annotations-panel-bg'],
    ['annotationsPanelContent', '--tri-annotations-panel-content'],
    ['searchPanelBg', '--tri-search-panel-bg'],
    ['searchPanelContent', '--tri-search-panel-content'],
    ['structuresPanelBg', '--tri-structures-panel-bg'],
    ['structuresPanelContent', '--tri-structures-panel-content'],
    ['collectionPanelBg', '--tri-collection-panel-bg'],
    ['collectionPanelContent', '--tri-collection-panel-content'],
    ['annotationColor', '--tri-annotation-color'],
    ['annotationHitColor', '--tri-annotation-hit-color'],
    ['annotationBorderWidth', '--tri-annotation-border-width'],
    ['annotationFillOpacity', '--tri-annotation-fill-opacity'],
    ['annotationPointSize', '--tri-annotation-point-size'],
    ['radiusBox', '--tri-radius-box'],
    ['radiusButtons', '--tri-radius-buttons'],
    ['radiusSelector', '--tri-radius-selector'],
    ['radiusToolbar', '--tri-radius-toolbar'],
    ['radiusPanels', '--tri-radius-panels'],
    ['radiusControls', '--tri-radius-controls'],
    ['radiusControlsButtons', '--tri-radius-controls-buttons'],
    ['sizeSelector', '--tri-size-selector'],
    ['sizeField', '--tri-size-field'],
    ['border', '--tri-border'],
    ['depth', '--tri-depth'],
    ['colorScheme', 'color-scheme'],
];

describe('CSS_VAR_MAP derived table', () => {
    it('enumerates every friendly name and var in order', () => {
        expect(
            Object.entries(CSS_VAR_MAP).map(([key, { cssVar }]) => [
                key,
                cssVar,
            ]),
        ).toEqual(EXPECTED_VARS);
    });

    it('keeps the introspection output identical', () => {
        expect(getThemePropertyNames()).toEqual(
            EXPECTED_VARS.map(([key]) => key),
        );
        expect(getThemeCssVariables()).toEqual(
            EXPECTED_VARS.map(([, cssVar]) => cssVar).filter(
                (cssVar) => cssVar !== 'color-scheme',
            ),
        );
    });
});
