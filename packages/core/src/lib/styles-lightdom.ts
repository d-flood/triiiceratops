/*
 * Entry for the published light-DOM stylesheet: `triiiceratops/style.css`
 * (→ dist/triiiceratops.css).
 *
 * Svelte component consumers import this once (`import 'triiiceratops/style.css'`)
 * to get the global layer their bundler can't derive from the components:
 * the element reset, design tokens + built-in themes, base styles, and chrome
 * layout vars. Per-component styling still comes from each `.svelte` file's
 * scoped <style> at the consumer's build.
 *
 * CORE ONLY — no plugin CSS here. The Annotorious annotation layer is shipped
 * BY the annotation-editor plugin (AnnotationEditorPanel.svelte imports its
 * stylesheet, and AnnotationManager injects it into the shadow root), so a
 * consumer only pays for it when they use that plugin. Core has no Annotorious
 * dependency.
 *
 * These same sheets feed the custom element's shadow root via `app.css?inline`
 * (see TriiiceratopsViewerElement.svelte). The difference: this bundle is run
 * through the `.viewer-root` scoping PostCSS plugin (see vite.config.styles.ts)
 * so importing it into a light-DOM app styles ONLY the viewer, never the host
 * page. The sheets are imported individually (rather than via app.css's
 * @import) so PostCSS sees the real rules in a deterministic order.
 */
import '../styles/preflight.css';
import '../styles/themes.css';
import '../styles/base.css';
import '../styles/layout.css';
