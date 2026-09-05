/**
 * The site's own viewer theme, built from the site's measured palette.
 *
 * Every value is a reference to a site token rather than a colour, which is
 * what makes one declaration serve both schemes: the tokens re-step themselves
 * between light and dark, so the rail's toggle carries every embedded viewer
 * with it and a dark page cannot contain a light island. It also means the
 * contrast ratios the design record measured are the ratios inside the viewer,
 * with nothing measured twice.
 *
 * Passed as `themeConfig` rather than written as CSS on an ancestor: the viewer
 * declares its own defaults on its root element, and a declaration on an element
 * beats one inherited from its ancestors whatever the selectors say. No built-in
 * `theme` is set, because setting one would win over this.
 */

import type { ThemeConfig } from 'triiiceratops';

export const SITE_VIEWER_THEME: ThemeConfig = {
    viewerBg: 'var(--bench)',
    toolbarBg: 'var(--paper)',
    panelBg: 'var(--paper)',
    galleryBg: 'var(--rail-bg)',
    inputBg: 'var(--bone)',
    surfaceBorder: 'var(--rule)',
    content: 'var(--ink)',
    /* The one colour field. Orange carries its own ground in both schemes and
       the pale ink on it measures 4.78; the brand amber measures 1.99 on bone
       and can never be a mark, which is why the accent here is orange. */
    primary: 'var(--cta)',
    primaryContent: 'var(--cta-ink)',
    neutral: 'var(--ink-block)',
    neutralContent: 'var(--ink-on-dark)',
    border: '1px',
    radiusBox: '2px',
    radiusButtons: '2px',
};
