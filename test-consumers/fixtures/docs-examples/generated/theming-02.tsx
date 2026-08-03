// GENERATED from docs/theming.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { ThemeConfig } from 'triiiceratops';

// Defined outside the component (or memoized) so the wrapper's shallow
// equality check sees a stable value and never re-applies it.
const customTheme: ThemeConfig = {
    primary: '#0ea5e9',
    panelBg: '#0f172a',
    radiusBox: '1rem',
};

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="..."
            theme="light"
            themeConfig={customTheme}
        />
    );
}
