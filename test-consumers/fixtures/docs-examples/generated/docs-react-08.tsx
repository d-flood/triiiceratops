// GENERATED from apps/site/content/docs/react.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useMemo } from 'react';
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { ThemeConfig, ViewerConfig } from 'triiiceratops/react';

// Hoisted: one object for the module's lifetime.
const THEME_CONFIG: ThemeConfig = { panelBg: '#101014' };

export function Reader({ side }: { side: 'left' | 'right' }) {
    // Memoized: a new object only when what it depends on changes.
    const config = useMemo<ViewerConfig>(() => ({ toolbar: { side } }), [side]);
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            config={config}
            themeConfig={THEME_CONFIG}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
