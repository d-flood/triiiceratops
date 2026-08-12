<script module lang="ts">
    import { installTrustedTypesPolicy } from '../utils/trustedTypes';

    // Install the pass-through Trusted Types default policy at module load, before
    // any component template is instantiated (Svelte renders via
    // `<template>.innerHTML`, a Trusted Types sink). No-op unless the page runs a
    // `require-trusted-types-for 'script'` policy (ticket 24). Importing this
    // module — directly (light DOM) or via the Web Component wrapper — installs it.
    installTrustedTypesPolicy();
</script>

<script lang="ts">
    import Icon from './Icon.svelte';
    import MagnifyingGlassIcon from './icons/MagnifyingGlassIcon.svelte';
    import ChatCenteredTextIcon from './icons/ChatCenteredTextIcon.svelte';
    import InfoIcon from './icons/InfoIcon.svelte';
    import ListBulletsIcon from './icons/ListBulletsIcon.svelte';
    import FolderIcon from './icons/FolderIcon.svelte';
    import { onDestroy, setContext, untrack } from 'svelte';
    import { cubicOut } from 'svelte/easing';
    import {
        language,
        getMessages,
        provideActiveLocale,
    } from '../state/i18n.svelte';
    import { watchReducedMotion } from '../state/reducedMotion';
    import { VIEWER_STATE_KEY, ViewerState } from '../state/viewer.svelte';
    import { applyTheme } from '../theme/themeManager';
    import type { BuiltInTheme, ThemeConfig } from '../theme/types';
    import type {
        ControlsMode,
        NavStyle,
        NavEdge,
        NavAlign,
        ToolbarSide,
        SearchProvider,
        ViewerConfig,
    } from '../types/config';
    import {
        CONTROLS_MODES,
        NAV_STYLES,
        NAV_EDGES,
        NAV_ALIGNS,
        TOOLBAR_ANCHORS,
        DEFAULT_CONTROLS,
        DEFAULT_NAV_STYLE,
        DEFAULT_NAV_EDGE,
        DEFAULT_NAV_ALIGN,
        DEFAULT_TOOLBAR_ANCHOR,
    } from '../types/config';
    import type {
        SdkPlugin,
        PluginError,
        PluginErrorReport,
        PluginErrorPhase,
        PluginLocaleService,
        PluginMountThunk,
    } from '../types/plugin';
    import { isSdkPlugin, PLUGIN_ERROR_EVENT } from '../types/plugin';
    import type { ViewerError } from '../types/viewerError';
    import { VIEWER_ERROR_EVENT } from '../types/viewerError';
    import { logger, configureLogging } from '../logging/logger';
    import {
        CORE_VERSION,
        pluginApiVersion,
        capabilities as coreCapabilities,
    } from '../plugin/api';
    import { createPluginStyleService } from '../plugin/styleService';
    import { createPluginLocaleService } from '../plugin/localeService';
    import { createPluginUiService } from '../plugin/uiService';
    import { createPluginSurface } from '../plugin/surface';
    import type { CanvasRegion } from '../utils/contentState';
    import { sdkPluginChromeId } from '../utils/pluginId';
    import { getThumbnailSrc } from '../utils/getThumbnailSrc';
    import { getViewerTileSources } from '../utils/resolveCanvasImage';
    import { parseContentState } from '../utils/contentState';
    import { getCanvasId } from './viewerControls';
    import AnnotationOverlay from './AnnotationOverlay.svelte';
    import AnnotationShapeOverlay from './AnnotationShapeOverlay.svelte';
    import CanvasHost from './CanvasHost.svelte';
    import AnnotationPanel from './AnnotationPanel.svelte';
    import CollectionPanel from './CollectionPanel.svelte';
    import MetadataPanel from './MetadataPanel.svelte';
    import PanelStack, { type PanelStackItem } from './PanelStack.svelte';
    import PluginMountHost from './PluginMountHost.svelte';
    import SearchPanel from './SearchPanel.svelte';
    import StructuresPanel from './StructuresPanel.svelte';
    import ThumbnailGallery from './ThumbnailGallery.svelte';
    import Toolbar from './Toolbar.svelte';
    import ViewerControls from './ViewerControls.svelte';
    import { Spinner } from './ui';

    // SSR-safe browser detection for library consumers
    const browser = typeof window !== 'undefined';

    /**
     * `prefers-reduced-motion`, from the viewer-wide watcher.
     *
     * WATCHED, not read once at init: the renderer honors the preference live
     * (`CanvasHost` stops the viewport the moment it is turned on), and a
     * chrome that only sampled it at mount would go on gliding its drawer and
     * its panels after the same toggle — one viewer giving two answers about
     * whether it respects the setting. Every transition below reads this at the
     * instant it starts, so a change reaches the next one. SSR-safe: the helper
     * reports `false` off the browser and never calls back.
     */
    let prefersReducedMotion = $state(false);
    onDestroy(
        watchReducedMotion((reduced) => {
            prefersReducedMotion = reduced;
        }),
    );

    /**
     * Open the expanded gallery as a drawer sliding out of its dock edge — a
     * bottom-docked strip grows upward to fill the column, and shrinks back the
     * same way. `from` is the docked footprint the drawer starts at, so the
     * animation begins exactly where the strip/rail was instead of from nothing.
     *
     * Animates `clip-path`, not `height`: clip-path is composited, so the grid
     * lays out once and is uncovered, where an animated height would reflow every
     * thumbnail on every frame. A floating gallery has no edge to slide from, so
     * it just fades up.
     */
    function expandGallery(
        node: HTMLElement,
        {
            edge,
            from,
        }: { edge: 'top' | 'bottom' | 'left' | 'right' | 'none'; from: number },
    ) {
        const duration = prefersReducedMotion ? 0 : 260;
        if (edge === 'none') {
            return {
                duration,
                easing: cubicOut,
                css: (t: number) =>
                    `opacity: ${t}; transform: scale(${0.98 + 0.02 * t});`,
            };
        }
        // `u` is the un-revealed fraction: at u=1 only the docked footprint shows.
        const closed = (u: number) => `calc(${u} * (100% - ${from}px))`;
        const inset = (u: number) => {
            switch (edge) {
                case 'bottom':
                    return `${closed(u)} 0 0 0`;
                case 'top':
                    return `0 0 ${closed(u)} 0`;
                case 'left':
                    return `0 ${closed(u)} 0 0`;
                default:
                    return `0 0 0 ${closed(u)}`;
            }
        };
        return {
            duration,
            easing: cubicOut,
            css: (t: number) => `clip-path: inset(${inset(1 - t)});`,
        };
    }

    /**
     * Animate a side panel column's width (0 → full) so the center viewer
     * resizes smoothly as the panel opens/closes, instead of the layout snapping
     * to the panel's width in a single frame. Paired with the panel's own
     * slide-in transition in PanelStack.
     */
    function slideWidth(node: HTMLElement, { duration = 200 } = {}) {
        const width = node.getBoundingClientRect().width;
        return {
            duration: prefersReducedMotion ? 0 : duration,
            easing: cubicOut,
            css: (t: number) =>
                `width: ${t * width}px; min-width: 0; overflow: hidden;`,
        };
    }

    interface Props {
        manifestId?: string;
        manifestJson?: any;
        canvasId?: string;
        plugins?: readonly SdkPlugin[] | null | boolean;
        /** Built-in theme name. Defaults to 'light' or 'dark' based on prefers-color-scheme. */
        theme?: BuiltInTheme;
        /** Custom theme configuration to override the base theme's values. */
        themeConfig?: ThemeConfig;
        /** Configuration options for the viewer UI */
        config?: ViewerConfig;
        searchProvider?: SearchProvider | null;
        /** Bindable viewer state instance for external access (Svelte consumers) */
        viewerState?: ViewerState;
        initialCanvasRegion?: CanvasRegion | null;
        /**
         * Host callback for the structured plugin-failure channel (ticket 09).
         * Called with the SAME {@link PluginError} object dispatched as the
         * bubbling, composed `pluginerror` CustomEvent from the viewer root, so
         * a host can present or report the failure and call `retry()`.
         */
        onpluginerror?: (error: PluginError) => void;
        /**
         * Host callback for the structured viewer-failure channel (ticket 18).
         * Called with the SAME {@link ViewerError} object dispatched as the
         * bubbling, composed `viewererror` CustomEvent from the viewer root, so a
         * host can present or report actionable configuration, content, and
         * operation failures without scraping the console.
         */
        onviewererror?: (error: ViewerError) => void;
    }

    type ViewerTileSourceError =
        | { type: 'auth' }
        | { type: 'load'; message?: string; details?: string }
        | null;

    let {
        manifestId,
        manifestJson,
        canvasId,
        plugins: rawPlugins = [],
        theme,
        themeConfig,
        config = {},
        searchProvider = null,
        viewerState = $bindable(),
        initialCanvasRegion = null,
        onpluginerror,
        onviewererror,
    }: Props = $props();

    let allPlugins = $derived(Array.isArray(rawPlugins) ? rawPlugins : []);
    // The SDK path (ticket 07) is the one plugin path.
    let sdkPlugins = $derived(allPlugins.filter(isSdkPlugin));
    let isDragOver = $state(false);
    // Active locale (CONTEXT.md **Active locale**, ticket 06): the viewer's typed
    // `config.locale` if set, otherwise the page default. Published to chrome via
    // Svelte context (below) so every `m.*()` call renders in it; also mirrored
    // onto ViewerState.activeLocale as observable state.
    let viewerLocale = $derived(config.locale ?? language.current);

    // Reference to root element for applying theme
    let rootElement: HTMLElement | undefined = $state();

    // Reactively apply theme when element is available or theme/themeConfig changes
    $effect(() => {
        if (rootElement) {
            applyTheme(rootElement, theme, themeConfig);
            internalViewerState.setViewerElement(rootElement);
        }
    });

    // Create per-instance viewer state
    // Note: We pass empty initial values and use $effect blocks below to set
    // manifestId, canvasId, and plugins reactively, avoiding Svelte's
    // "state_referenced_locally" warning about capturing initial prop values.
    const internalViewerState = new ViewerState(null, undefined);
    viewerState = internalViewerState; // Expose via bindable prop
    setContext(VIEWER_STATE_KEY, internalViewerState);

    // Route state-level actionable failures (search, viewport, content) out
    // through the structured `viewererror` channel (ticket 18). Mirrors the
    // ticket 09 `pluginerror` wiring: ViewerState reports; the component owns the
    // DOM event + host callback.
    internalViewerState.setErrorReporter(emitViewerError);

    /**
     * Deliver one structured viewer failure (ticket 18) on BOTH channels with
     * the SAME object: the bubbling, composed `viewererror` CustomEvent from the
     * viewer root and the `onviewererror` host callback. Mirrors
     * {@link emitPluginError}. Also mirrors the payload to the (silent-by-default)
     * logger so it is visible in `debug` mode; production stays quiet unless a
     * host wires a channel or enables debug.
     */
    function emitViewerError(error: ViewerError): void {
        if (error.severity === 'error') {
            logger.error(
                `[${error.code}] ${error.message}`,
                error.error ?? error.detail ?? '',
            );
        } else {
            logger.warn(`[${error.code}] ${error.message}`, error.detail ?? '');
        }

        // Bubbling + composed so it escapes the shadow root to WC hosts.
        rootElement?.dispatchEvent(
            new CustomEvent(VIEWER_ERROR_EVENT, {
                detail: error,
                bubbles: true,
                composed: true,
            }),
        );
        // Host callback — the SAME object.
        onviewererror?.(error);
    }

    // Publish this viewer's active locale to its chrome subtree, and route all
    // core message rendering through it. `getMessages()` returns a drop-in `m`
    // whose calls render in `viewerLocale`; chrome uses `m.*()` unchanged.
    provideActiveLocale({
        get current() {
            return viewerLocale;
        },
    });
    const m = getMessages();

    // Mirror the resolved active locale onto ViewerState as observable state so
    // subscribers (and ticket 08's PluginLocaleService) are notified on change.
    // `viewerLocale` already resolves `config.locale ?? page default` reactively,
    // so this keeps the observable identical to the locale the chrome renders in.
    $effect(() => {
        internalViewerState.activeLocale = viewerLocale;
    });

    $effect(() => {
        internalViewerState.setManifestRequestConfig(config?.requests);
    });

    $effect(() => {
        internalViewerState.setSearchProvider(searchProvider);
    });

    $effect(() => {
        internalViewerState.setInitialCanvasRegion(initialCanvasRegion);
    });

    function clearDragState() {
        isDragOver = false;
    }

    function hasCanvas(canvasId: string) {
        return internalViewerState.canvases.some(
            (canvas: any) => getCanvasId(canvas) === canvasId,
        );
    }

    function handleDragOver(event: DragEvent) {
        if (!internalViewerState.config.enableDragDrop) return;
        event.preventDefault();
        isDragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        if (!internalViewerState.config.enableDragDrop) return;
        if (event.currentTarget === event.target) {
            isDragOver = false;
        }
    }

    async function handleDrop(event: DragEvent) {
        if (!internalViewerState.config.enableDragDrop) return;
        event.preventDefault();
        clearDragState();

        const text = event.dataTransfer?.getData('text/plain')?.trim();
        if (!text) return;

        const parsed = parseContentState(text);
        if (parsed?.manifestId) {
            internalViewerState.setInitialCanvasRegion(parsed.region ?? null);
            if (parsed.canvasId) {
                internalViewerState.setCanvas(parsed.canvasId);
            }
            await internalViewerState.setManifest(parsed.manifestId, {
                requestConfig: config?.requests,
            });
            if (parsed.canvasId) {
                internalViewerState.setCanvas(parsed.canvasId);
            }
            return;
        }

        if (/^https?:\/\//i.test(text)) {
            internalViewerState.setInitialCanvasRegion(null);
            await internalViewerState.setManifest(text, {
                requestConfig: config?.requests,
            });
        }
    }

    $effect(() => {
        if (manifestId && manifestJson) {
            const requestedCanvasId = canvasId || undefined;
            void (async () => {
                await internalViewerState.setManifestData(
                    manifestId,
                    manifestJson,
                    { canvasId: requestedCanvasId },
                );
                lastAppliedCanvasId = '';
            })();
            return;
        }

        if (manifestId && manifestId !== internalViewerState.manifestId) {
            // Don't re-trigger setManifest if the prop points to the active collection.
            // When a collection is loaded, internalViewerState.manifestId is the
            // currently-selected manifest inside the collection, which differs from
            // the collection URL passed as the prop.
            if (
                internalViewerState.collectionId &&
                manifestId === internalViewerState.collectionId
            ) {
                return;
            }
            // Pass the requested canvas along so the manifest load selects it
            // directly, without a transient first-canvas state that consumers
            // mirroring viewer state could echo back into the prop.
            const requestedCanvasId = canvasId || undefined;
            void (async () => {
                await internalViewerState.setManifest(manifestId, {
                    requestConfig: config?.requests,
                    canvasId: requestedCanvasId,
                });
                lastAppliedCanvasId = '';
            })();
        }
    });

    // Track last applied canvasId PROP value to prevent reverting internal navigation
    let lastAppliedCanvasId = '';

    $effect(() => {
        // Only sync from prop to internal state when PROP actually changes
        // This prevents internal navigation from being reverted when the effect
        // runs due to internal state changes
        if (canvasId && canvasId !== lastAppliedCanvasId) {
            lastAppliedCanvasId = canvasId;
            untrack(() => {
                if (
                    internalViewerState.manifestId &&
                    internalViewerState.canvases.length &&
                    !hasCanvas(canvasId)
                ) {
                    return;
                }
                // Only apply if different from current internal state
                if (canvasId !== internalViewerState.canvasId) {
                    internalViewerState.setCanvas(canvasId);
                }
            });
        }
    });

    // Track last applied config to prevent redundant updates and loops
    let lastConfigStr = '';

    $effect(() => {
        if (config) {
            const str = JSON.stringify(config);
            if (str !== lastConfigStr) {
                lastConfigStr = str;
                internalViewerState.updateConfig(config);
            }
        }
    });

    // Opt-in developer diagnostics (ticket 18): production is quiet by default.
    // `config.debug` gates the core logger; actionable failures still surface
    // through the structured `viewererror`/`pluginerror` channels regardless.
    $effect(() => {
        configureLogging({ debug: config?.debug ?? false });
    });

    // ---- SDK plugin activation (ticket 07 + services ticket 08) ------------
    // SDK plugins carry their own framework-neutral `activate(host)`. Core owns
    // a container per plugin, negotiates nothing itself (the plugin's activate
    // does compatibility/context/selectors), and supplies the host: the
    // container, the live viewer state, core's declared version/capabilities,
    // and the three per-activation services (ticket 08) — a root-aware style
    // service, a per-viewer locale service over the plugin's catalog, and the
    // icon-rendering UI service.

    // One activation record per mounted SDK plugin. `deactivate` runs the
    // instance's teardown (view cleanup + drop subscriptions + release styles);
    // tearing the record down also unregisters the plugin from viewer state (its
    // chrome, its overlay layers, its UI state) — see `deactivateSdkRecord`.
    // `primaryReported` de-dupes repeated command/subscription failures from the
    // same still-live instance so the channel fires once per failure, not once per
    // flush. `chromeId` is the id core knows this plugin by: the key under
    // `config.plugins`, the prefix of its chrome record ids, and the prefix of
    // its overlay layer ids. It is set when the record is CREATED, before the
    // plugin's view mounts — not after a successful activation — because it is
    // also the handle everything registered DURING that mount is released by,
    // and a mount that throws registers things too (see `activateSdkPlugin`).
    // `failed` records that setup/mount failed so core renders NO button (fail
    // closed, ADR 0010).
    interface SdkActivationRecord {
        plugin: SdkPlugin;
        el: HTMLElement;
        chromeId: string;
        deactivate: () => void;
        primaryReported: boolean;
        failed: boolean;
    }
    let sdkActivations: SdkActivationRecord[] = [];

    // The owning viewer's active-locale observable, shared by every SDK plugin's
    // locale service. Reads `ViewerState.activeLocale` (mirrored from
    // `config.locale ?? page default`, ticket 06) and wakes on change through the
    // framework-neutral subscription — no Svelte reactivity crosses the seam.
    const sdkLocaleSource = {
        get current(): string {
            return internalViewerState.activeLocale;
        },
        subscribe(callback: (locale: string) => void): () => void {
            let last = internalViewerState.activeLocale;
            return internalViewerState.subscribe(() => {
                const next = internalViewerState.activeLocale;
                if (next !== last) {
                    last = next;
                    callback(next);
                }
            });
        },
    };

    /**
     * Deliver one structured plugin failure on BOTH channels with the SAME
     * object: the bubbling, composed `pluginerror` CustomEvent from the viewer
     * root and the `onpluginerror` host callback (ticket 09), and log it via the
     * debug-gated developer logger. Fail-closed (ADR 0010): there is NO
     * user-facing error UI — a failed activation renders no toolbar button; the
     * payload's `retry()` is host-invoked only. Repeated command/subscription
     * failures from the same still-live instance are de-duped (they keep throwing
     * every flush until retry); `cleanup` failures always fire (they occur during
     * teardown and must each be reported).
     */
    function emitPluginError(
        record: SdkActivationRecord,
        phase: PluginErrorPhase,
        error: unknown,
    ) {
        if (phase !== 'cleanup') {
            if (record.primaryReported) return;
            record.primaryReported = true;
        }

        const payload: PluginError = {
            pluginName: record.plugin.name,
            pluginVersion: record.plugin.version,
            phase,
            error,
            retry: () => retrySdkPlugin(record.plugin),
        };

        // Debug-gated developer log; production stays quiet unless a host wires a
        // channel or enables debug.
        logger.error(
            `[triiiceratops] Plugin "${record.plugin.name}" failed in phase "${phase}".`,
            error,
        );

        // Bubbling + composed so it escapes the shadow root to WC hosts.
        rootElement?.dispatchEvent(
            new CustomEvent(PLUGIN_ERROR_EVENT, {
                detail: payload,
                bubbles: true,
                composed: true,
            }),
        );
        // Host callback — the SAME object.
        onpluginerror?.(payload);
    }

    /**
     * Assemble the `PluginHost` for one activation (shared by both paths).
     *
     * `locale` is passed in rather than built here: the SAME service instance
     * also resolves the plugin's chrome label (`SdkPluginMeta.title`), so the
     * plugin's UI strings and its toolbar/panel label can never disagree. It
     * must stay one instance PER ACTIVATION — it closes over that plugin's
     * catalog.
     */
    function buildSdkHost(
        plugin: SdkPlugin,
        container: HTMLElement,
        chromeId: string,
        locale: PluginLocaleService,
        reportError: (report: PluginErrorReport) => void,
    ) {
        return {
            container,
            viewerState: internalViewerState,
            coreVersion: CORE_VERSION,
            pluginApiVersion,
            capabilities: coreCapabilities,
            styles: createPluginStyleService(
                internalViewerState.getStyleRoot() ?? document,
                plugin.name,
            ),
            locale,
            ui: createPluginUiService(),
            // The plugin's own chrome: how it learns whether its panel/flyout is
            // open (core mounts it once, so open/close is no longer a mount
            // lifecycle event) and how it closes itself. Seeds the plugin's UI
            // state, so `surface` must be built before the plugin mounts.
            surface: createPluginSurface(
                internalViewerState,
                chromeId,
                plugin.target,
            ),
            reportError,
        };
    }

    /**
     * Activate one SDK plugin. Core owns the chrome: core hands `view.mount` a
     * content-only element it created; on success core registers the toolbar
     * chrome (button + anchored flyout / docked panel) via
     * {@link ViewerState.registerSdkChrome}. The element is placed into the open
     * surface (and removed on close) by the shared `PluginMountHost`
     * attachment. Fail closed
     * (ADR 0010): a setup/mount failure renders NO button.
     */
    function activateSdkPlugin(plugin: SdkPlugin) {
        // Stable, DOM-safe chrome id so consumers can target the plugin under
        // `config.plugins[chromeId]` for visible/open/target control. Prefer the
        // plugin's declared `uiId`; otherwise derive one from its package name
        // (`@scope/plugin-foo` → `scope-plugin-foo`). NOT random — a random id
        // was never surfaced to the consumer, so config.plugins keying was dead.
        // Computed up front (it is pure) because the plugin's `PluginSurface`
        // closes over it and is handed to `view.mount`, which runs below.
        const chromeId = sdkPluginChromeId(plugin);

        // One locale service per activation, shared by the plugin's own UI
        // strings and by its core-owned chrome label below.
        const locale = createPluginLocaleService(
            sdkLocaleSource,
            plugin.catalog,
        );

        // Content-only container: created and owned by core, detached until the
        // plugin's surface opens.
        const el = document.createElement('div');
        el.className = 'tri-sdk-plugin';
        el.dataset.pluginName = plugin.name;
        el.dataset.pluginTarget = plugin.target;

        const record: SdkActivationRecord = {
            plugin,
            el,
            // Recorded HERE, not after a successful activation. The plugin's
            // `view.mount` runs below and may register things core knows by this
            // id — its overlay layers, and the UI state its surface seeded — so a
            // record whose `chromeId` were only filled in on success would leave
            // a failed mount's registrations with no owner: `unregisterPlugin`
            // would never be called for them, and a retry's identical layer id
            // would then hit the duplicate-id refusal forever.
            chromeId,
            deactivate: () => {},
            primaryReported: false,
            failed: false,
        };
        sdkActivations.push(record);

        const reportError = (report: PluginErrorReport) => {
            if (report.phase === 'setup' || report.phase === 'mount') {
                record.failed = true;
            }
            emitPluginError(record, report.phase, report.error);
        };

        try {
            const activation = plugin.activate(
                buildSdkHost(plugin, el, chromeId, locale, reportError),
            );
            record.deactivate = activation.deactivate;
        } catch (error) {
            record.failed = true;
            emitPluginError(record, 'setup', error);
        }

        // Fail closed: a failed setup/mount tears down the partial activation and
        // renders no toolbar button.
        if (record.failed) {
            try {
                record.deactivate();
            } catch (error) {
                logger.error(
                    'SDK plugin teardown threw after failed activation; continuing.',
                    error,
                );
            }
            // Leave nothing of this plugin behind in viewer state either. A
            // mount that threw half-way may already have registered overlay
            // layers — DOM on the image with nothing left to remove it — and its
            // surface seeded plugin UI state, which is what `registerOverlayLayer`
            // validates ids against, so a plugin that does not exist would keep
            // looking like a known one. No chrome was registered, so the chrome
            // filters in `unregisterPlugin` simply match nothing.
            internalViewerState.unregisterPlugin(chromeId);
            el.remove();
            return;
        }

        // Reactive container provisioning: the shared PluginMountHost attachment
        // calls this thunk when the anchored flyout / docked panel container node
        // appears (open) and its cleanup when it goes away (close). The plugin's
        // Activation state lives above this mount, so open/close never tears it
        // down; a layout change that recreates the node simply re-parents `el`.
        // The plugin observes open/close through `PluginContext.surface` instead
        // of through a mount lifecycle event (see `plugin/surface.ts`).
        const mountThunk: PluginMountThunk = (node) => {
            node.appendChild(el);
            return () => {
                if (el.parentNode === node) node.removeChild(el);
            };
        };

        const pluginTitle = plugin.title;
        internalViewerState.registerSdkChrome({
            id: chromeId,
            name: plugin.name,
            // Display copy, resolved live so it follows the active locale. The
            // plugin's identity (`name`) stays on the record as the fallback for
            // plugins built before `title` existed.
            label: pluginTitle ? () => locale.t(pluginTitle) : undefined,
            icon: plugin.icon,
            target: plugin.target,
            dismiss: plugin.dismiss ?? 'light',
            mount: mountThunk,
        });
    }

    /**
     * Tear one activation down: unregister everything core knows by this
     * plugin's id — its chrome records, its overlay layers, and its UI state —
     * run its deactivation (view cleanup + drop subscriptions + release styles),
     * and remove its content element. Isolated so a throwing teardown never
     * blocks the rest.
     *
     * Unconditional: `unregisterPlugin` on a plugin that never got as far as
     * registering chrome matches no chrome record and simply drops whatever the
     * failed activation did leave behind, so a record for a failed mount is torn
     * down by exactly this path too.
     */
    function deactivateSdkRecord(record: SdkActivationRecord) {
        internalViewerState.unregisterPlugin(record.chromeId);
        try {
            record.deactivate();
        } catch (error) {
            logger.error(
                'SDK plugin deactivation threw; teardown continues.',
                error,
            );
        }
        record.el.remove();
    }

    /**
     * Manual retry = full re-activation (CONTEXT.md **Retry**): tear the instance
     * down (run its cleanups, drop its subscriptions, release its styles,
     * unregister its chrome), then activate fresh. Host-invoked only; no
     * auto-retry/backoff.
     */
    function retrySdkPlugin(plugin: SdkPlugin) {
        const index = sdkActivations.findIndex((r) => r.plugin === plugin);
        if (index !== -1) {
            const record = sdkActivations[index];
            sdkActivations.splice(index, 1);
            deactivateSdkRecord(record);
        }

        activateSdkPlugin(plugin);
    }

    function teardownSdkActivations() {
        for (const activation of sdkActivations) {
            deactivateSdkRecord(activation);
        }
        sdkActivations = [];
    }

    $effect(() => {
        const currentSdkPlugins = sdkPlugins;

        untrack(() => {
            // Diff the incoming list against live activations by plugin OBJECT
            // REFERENCE (CONTEXT.md **Activation**): activation lifetime follows
            // the plugin's identity within the list, not the identity of the
            // list. A plugin present before and after is left COMPLETELY
            // untouched — no `deactivate`, no re-mount, no style re-install, no
            // chrome re-registration, no subscription churn — so a host that
            // re-evaluates its plugin array every render keeps its plugins.
            // Reordering with unchanged membership is therefore also inert.
            const wanted = new Set(currentSdkPlugins);
            const retained: SdkActivationRecord[] = [];

            for (const activation of sdkActivations) {
                if (wanted.has(activation.plugin)) {
                    retained.push(activation);
                } else {
                    // Absent now → the existing teardown path, unchanged.
                    deactivateSdkRecord(activation);
                }
            }
            sdkActivations = retained;

            // Newly present → the existing activation path, unchanged. A
            // repeated object reference is one activation.
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            const live = new Set(retained.map((r) => r.plugin));
            for (const plugin of currentSdkPlugins) {
                if (live.has(plugin)) continue;
                live.add(plugin);
                activateSdkPlugin(plugin);
            }
        });
    });

    // Unmounting the viewer still deactivates everything. As with the legacy
    // registrations above, this is `onDestroy` rather than the effect's cleanup
    // so that a re-supplied plugin list does not tear the whole set down.
    onDestroy(() => {
        teardownSdkActivations();
    });

    onDestroy(() => {
        internalViewerState.destroy();
    });

    $effect(() => {
        if (!browser) return;

        const handleFullScreenChange = () => {
            internalViewerState.isFullScreen = !!document.fullscreenElement;
        };
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => {
            document.removeEventListener(
                'fullscreenchange',
                handleFullScreenChange,
            );
        };
    });

    let showCollectionSidebar = $derived(
        internalViewerState.showCollectionPanel &&
            internalViewerState.hasCollection,
    );

    let leftPanelWidth = $derived(
        internalViewerState.config.leftPanelWidth ?? '320px',
    );
    let rightPanelWidth = $derived(
        internalViewerState.config.rightPanelWidth ?? '320px',
    );

    // Resolve the layout knobs (drive data-controls / data-nav-style /
    // data-nav-edge / data-nav-align for the --ui-* vars and CSS). Fall back to
    // defaults for unknown values.
    let resolvedControls = $derived.by<ControlsMode>(() => {
        const c = internalViewerState.config.controls;
        return c && CONTROLS_MODES.includes(c) ? c : DEFAULT_CONTROLS;
    });
    let resolvedNavStyle = $derived.by<NavStyle>(() => {
        const n = internalViewerState.config.nav?.style;
        return n && NAV_STYLES.includes(n) ? n : DEFAULT_NAV_STYLE;
    });
    let resolvedNavAlign = $derived.by<NavAlign>(() => {
        const a = internalViewerState.config.nav?.align;
        return a && NAV_ALIGNS.includes(a) ? a : DEFAULT_NAV_ALIGN;
    });
    // Whether the split toolbar rail is pinned to the top corner. Only split mode
    // renders a separate rail, so a top anchor can only claim the top edge there.
    let toolbarAnchor = $derived.by<'top' | 'center'>(() => {
        const a = internalViewerState.config.toolbar?.anchor;
        return a && TOOLBAR_ANCHORS.includes(a) ? a : DEFAULT_TOOLBAR_ANCHOR;
    });
    let toolbarOwnsTop = $derived(
        resolvedControls === 'split' && toolbarAnchor === 'top',
    );
    // The toolbar owns the top edge: a `top`-edge nav yields to the bottom when a
    // top-anchored rail is present. We refuse to fit both rather than overlap them.
    let requestedNavEdge = $derived.by<NavEdge>(() => {
        const e = internalViewerState.config.nav?.edge;
        return e && NAV_EDGES.includes(e) ? e : DEFAULT_NAV_EDGE;
    });
    // A conflicting configuration: `nav.edge: 'top'` while a top-anchored toolbar
    // already owns the top. Surfaced as a structured `viewererror` warning below.
    let navEdgeConflict = $derived(
        requestedNavEdge === 'top' && toolbarOwnsTop,
    );
    let resolvedNavEdge = $derived<NavEdge>(
        navEdgeConflict ? 'bottom' : requestedNavEdge,
    );

    // Report the nav.edge/toolbar-anchor conflict once, when it becomes active,
    // through the structured `viewererror` channel (ticket 18) instead of a
    // bundler-specific dev-only console warning.
    $effect(() => {
        if (navEdgeConflict) {
            emitViewerError({
                severity: 'warning',
                scope: 'config',
                code: 'nav-edge-conflict',
                message:
                    'nav.edge "top" ignored: a top-anchored toolbar ' +
                    '(toolbar.anchor "top") already owns the top edge; nav ' +
                    'falls back to "bottom".',
                detail: {
                    requestedNavEdge: 'top',
                    resolvedNavEdge: 'bottom',
                },
            });
        }
    });

    // ---- Same-side toolbar/panel resolution (the "edge-rail" fix) ----
    // A side toolbar (left/right) that shares its side with a docked panel/gallery
    // is rendered as the OUTERMOST (screen-edge) column of that side bar instead
    // of floating over the image, so its close affordance no longer collides with
    // the panel's. Top toolbars float over the image and never conflict.
    let toolbarSide = $derived.by<ToolbarSide | null>(() => {
        // Top-anchored rails float over the image and never conflict with a
        // side panel, so they don't dock as the screen-edge column.
        if (toolbarAnchor === 'top') return null;
        const side = internalViewerState.config.toolbar?.side ?? 'left';
        return side === 'left' || side === 'right' ? side : null;
    });

    function showPanelCloseButton(showCloseButton: boolean | undefined) {
        return showCloseButton ?? true;
    }

    /**
     * Build a `PanelStackItem` from a registered plugin panel. A plugin panel
     * carries a DOM-mount thunk, rendered through the shared `PluginMountHost`
     * adapter.
     *
     * Header copy: a plugin that declared a `title` carries a `label` thunk
     * already resolved against the PLUGIN's catalog; otherwise look `name` up in
     * core's own catalog, else render it verbatim.
     */
    function toPluginPanelItem(
        panel: (typeof internalViewerState.pluginPanels)[number],
    ): PanelStackItem {
        const resolveTitle = (
            m as unknown as Record<string, (() => string) | undefined>
        )[panel.name];
        const title =
            panel.label?.() ?? (resolveTitle ? resolveTitle() : panel.name);
        return {
            id: panel.id,
            title,
            iconDescriptor: panel.iconDescriptor,
            component: PluginMountHost,
            props: { mount: panel.mount },
            close: showPanelCloseButton(
                internalViewerState.config.plugins?.[panel.pluginId]
                    ?.showCloseButton,
            )
                ? () => internalViewerState.setPluginOpen(panel.pluginId, false)
                : undefined,
        };
    }

    let visiblePanelsLeft = $derived.by<PanelStackItem[]>(() => {
        const panels: PanelStackItem[] = [];

        if (
            internalViewerState.showSearchPanel &&
            internalViewerState.config.search?.position === 'left'
        ) {
            panels.push({
                id: 'search',
                title: m.search(),
                icon: MagnifyingGlassIcon,
                component: SearchPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.search?.showCloseButton,
                )
                    ? () => internalViewerState.toggleSearchPanel()
                    : undefined,
            });
        }
        if (
            internalViewerState.showAnnotations &&
            internalViewerState.config.annotations?.position === 'left'
        ) {
            panels.push({
                id: 'annotations',
                title: m.settings_submenu_annotations(),
                icon: ChatCenteredTextIcon,
                component: AnnotationPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.annotations?.showCloseButton,
                )
                    ? () => internalViewerState.toggleAnnotations()
                    : undefined,
            });
        }
        if (
            internalViewerState.showMetadataPanel &&
            internalViewerState.config.information?.position === 'left'
        ) {
            panels.push({
                id: 'metadata',
                title: m.metadata(),
                icon: InfoIcon,
                component: MetadataPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.information?.showCloseButton,
                )
                    ? () => internalViewerState.toggleMetadataPanel()
                    : undefined,
            });
        }

        for (const panel of internalViewerState.pluginPanels) {
            if (
                panel.isVisible() &&
                internalViewerState.getPluginPosition(panel.pluginId) === 'left'
            ) {
                panels.push(toPluginPanelItem(panel));
            }
        }

        return panels;
    });

    let visiblePanelsRight = $derived.by<PanelStackItem[]>(() => {
        const panels: PanelStackItem[] = [];

        if (
            internalViewerState.showSearchPanel &&
            internalViewerState.config.search?.position !== 'left'
        ) {
            panels.push({
                id: 'search',
                title: m.search(),
                icon: MagnifyingGlassIcon,
                component: SearchPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.search?.showCloseButton,
                )
                    ? () => internalViewerState.toggleSearchPanel()
                    : undefined,
            });
        }
        if (
            internalViewerState.showAnnotations &&
            internalViewerState.config.annotations?.position !== 'left'
        ) {
            panels.push({
                id: 'annotations',
                title: m.settings_submenu_annotations(),
                icon: ChatCenteredTextIcon,
                component: AnnotationPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.annotations?.showCloseButton,
                )
                    ? () => internalViewerState.toggleAnnotations()
                    : undefined,
            });
        }
        if (
            internalViewerState.showMetadataPanel &&
            internalViewerState.config.information?.position !== 'left'
        ) {
            panels.push({
                id: 'metadata',
                title: m.metadata(),
                icon: InfoIcon,
                component: MetadataPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.information?.showCloseButton,
                )
                    ? () => internalViewerState.toggleMetadataPanel()
                    : undefined,
            });
        }
        if (internalViewerState.showStructuresPanel) {
            panels.push({
                id: 'structures',
                title: m.structures_title(),
                icon: ListBulletsIcon,
                component: StructuresPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.structures?.showCloseButton,
                )
                    ? () => internalViewerState.toggleStructuresPanel()
                    : undefined,
            });
        }
        if (showCollectionSidebar) {
            panels.push({
                id: 'collection',
                title: m.collection_title(),
                icon: FolderIcon,
                component: CollectionPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.collection?.showCloseButton,
                )
                    ? () => internalViewerState.toggleCollectionPanel()
                    : undefined,
            });
        }

        for (const panel of internalViewerState.pluginPanels) {
            if (
                panel.isVisible() &&
                internalViewerState.getPluginPosition(panel.pluginId) ===
                    'right'
            ) {
                panels.push(toPluginPanelItem(panel));
            }
        }

        return panels;
    });

    /**
     * The gallery, expanded to fill the center column as a thumbnail grid. It
     * renders in exactly one place — the `.gallery-expanded` overlay — so the
     * docked/floating render sites below all stand down while it is up. Two
     * mounted `ThumbnailGallery` instances would both run the dockSide sync
     * effects and fight over them.
     */
    let galleryExpanded = $derived(
        internalViewerState.showThumbnailGallery &&
            internalViewerState.galleryExpanded,
    );

    /** The gallery occupying its docked strip/rail (i.e. open but not expanded). */
    let galleryDocked = $derived(
        internalViewerState.showThumbnailGallery && !galleryExpanded,
    );

    /**
     * Docked gallery band height (top/bottom) and rail width (left/right): both are
     * `gallery.size` itself, which is what that config value means. The gallery is
     * given the number and derives its thumbnails from what is left of it — see
     * `galleryGeometry`.
     *
     * It stops short of the gallery's own border, which is added back in `calc()` by
     * the `.gallery-band` / `.gallery-host` rules below. Those read this as a custom
     * property, so a host that themes `--tri-border` gets a band that still agrees
     * with the padding math instead of one baking in the token's default width.
     */
    let galleryExtent = $derived(internalViewerState.galleryExtent);

    /**
     * The docked footprint the expand animation starts from, and the edge it
     * slides out of — the dock side, so a bottom-docked gallery grows upward.
     * Takes the border-free size: a transition's start size can be a pixel out
     * without anyone seeing it.
     */
    let galleryExpandFrom = $derived({
        edge: internalViewerState.dockSide as
            | 'top'
            | 'bottom'
            | 'left'
            | 'right'
            | 'none',
        // The band's height or the rail's width, whichever edge it slides out of —
        // one number either way, since that is what `gallery.size` is.
        from: galleryExtent,
    });

    let isLeftSidebarVisible = $derived(
        (galleryDocked && internalViewerState.dockSide === 'left') ||
            visiblePanelsLeft.length > 0,
    );

    let isRightSidebarVisible = $derived(
        (galleryDocked && internalViewerState.dockSide === 'right') ||
            visiblePanelsRight.length > 0,
    );

    // Latch the "sidebar present" signal so it trails the column's close
    // animation. When the last same-side panel closes, `isLeftSidebarVisible`
    // flips false instantly, but the panel column keeps sliding shut for ~200ms
    // (slideWidth outro). Holding this signal true across that window lets the
    // docked rail stay put — full size, not collapsing — until the column is
    // actually gone, then hand off to the floating toolbar in one atomic swap.
    // `$derived`, because `prefersReducedMotion` is now watched rather than
    // sampled at init: a latch sized to an animation that no longer runs would
    // hold the rail for 200ms of nothing after the preference is turned on.
    const SIDEBAR_ANIM_MS = $derived(prefersReducedMotion ? 0 : 200);

    let leftSidebarPresent = $state(false);
    $effect(() => {
        if (isLeftSidebarVisible) {
            leftSidebarPresent = true;
            return;
        }
        const id = setTimeout(
            () => (leftSidebarPresent = false),
            SIDEBAR_ANIM_MS,
        );
        return () => clearTimeout(id);
    });

    let rightSidebarPresent = $state(false);
    $effect(() => {
        if (isRightSidebarVisible) {
            rightSidebarPresent = true;
            return;
        }
        const id = setTimeout(
            () => (rightSidebarPresent = false),
            SIDEBAR_ANIM_MS,
        );
        return () => clearTimeout(id);
    });

    // The toolbar docks as the screen-edge rail of a side bar when it shares that
    // side with an open panel/gallery. Only `split` controls use a side toolbar;
    // `unified` embeds the tools in the nav bar.
    //
    // The rail is rendered as its OWN screen-edge column (a sibling of the panel
    // column, not a child of it — see the markup), so it is not caught in the
    // panel's slideWidth outro. That, plus the latched `…SidebarPresent` tail,
    // means the rail stays mounted at full size through the close and then
    // unmounts reactively the instant this flips false — in the SAME flush that
    // mounts the floating toolbar. The result is an atomic hand-off: never two
    // toolbars, never zero. `toolbarOpen` gates it directly (not via the latch)
    // so collapsing the toolbar itself removes the rail immediately.
    let dockRailLeft = $derived(
        resolvedControls === 'split' &&
            toolbarSide === 'left' &&
            internalViewerState.toolbarOpen &&
            (isLeftSidebarVisible || leftSidebarPresent),
    );
    let dockRailRight = $derived(
        resolvedControls === 'split' &&
            toolbarSide === 'right' &&
            internalViewerState.toolbarOpen &&
            (isRightSidebarVisible || rightSidebarPresent),
    );
    let toolbarDockedAsRail = $derived(dockRailLeft || dockRailRight);

    /**
     * Which edge of the center column a floating toolbar occupies, or null when
     * the toolbar is elsewhere (docked as a side rail, or embedded in the nav by
     * `unified` controls).
     *
     * The floating toolbar out-stacks the expanded gallery on purpose — it is
     * chrome, and losing every panel/search/info button on entering the gallery
     * would be worse than the alternative. So the expanded grid insets itself
     * away from that edge instead of sliding thumbnails underneath. A floating
     * toolbar is always an edge strip on `toolbar.side` (top-anchored or
     * centered), so one side's worth of inset covers every preset.
     */
    let floatingToolbarSide = $derived(
        !toolbarDockedAsRail && resolvedControls !== 'unified'
            ? (internalViewerState.config.toolbar?.side ?? 'left')
            : null,
    );

    let manifestData = $derived(internalViewerState.manifestEntry);
    let canvases = $derived(internalViewerState.canvases);
    let currentCanvasIndex = $derived(internalViewerState.currentCanvasIndex);

    // Effect to trigger deferred search once manifest is loaded
    $effect(() => {
        if (
            internalViewerState.pendingSearchQuery &&
            manifestData &&
            !manifestData.isFetching &&
            !manifestData.error &&
            manifestData.json
        ) {
            const query = internalViewerState.pendingSearchQuery;
            internalViewerState.pendingSearchQuery = null;
            internalViewerState.search(query);
        }
    });

    // Auto-select initial canvas: prefer start canvas from manifest, then first canvas
    $effect(() => {
        if (
            canvases.length > 0 &&
            currentCanvasIndex < 0 &&
            !manifestData?.isFetching
        ) {
            const startCanvas = internalViewerState.startCanvasId;
            if (startCanvas) {
                internalViewerState.setCanvas(startCanvas);
            } else {
                const firstCanvasId = getCanvasId(canvases[0]);
                if (firstCanvasId) {
                    internalViewerState.setCanvas(firstCanvasId);
                }
            }
        }
    });

    // Derive thumbnail URL for the current canvas (used for auth error backdrop)
    // Uses the same fallback chain as ThumbnailGallery
    let currentCanvasThumbnail = $derived.by(() => {
        if (
            !canvases ||
            currentCanvasIndex === -1 ||
            !canvases[currentCanvasIndex]
        )
            return null;
        return getThumbnailSrc(canvases[currentCanvasIndex]) || null;
    });

    let tileSources = $derived.by(() => {
        if (
            !canvases ||
            currentCanvasIndex === -1 ||
            !canvases[currentCanvasIndex]
        ) {
            if (!manifestData?.isFetching) {
                logger.debug('No canvas found');
            }
            return null;
        }

        const tileSourcesArray = getViewerTileSources({
            canvases,
            currentCanvasIndex,
            currentCanvasId: internalViewerState.canvasId,
            viewingMode: internalViewerState.viewingMode,
            pagedOffset: internalViewerState.pagedOffset,
            getSelectedChoice: (canvasId) =>
                internalViewerState.getSelectedChoice(canvasId),
        });

        if (!tileSourcesArray) {
            if (!manifestData?.isFetching) {
                logger.debug('No images/content in canvas');
            }
            return null;
        }

        logger.debug('Derived tileSources:', tileSourcesArray);
        return tileSourcesArray;
    });

    let tileSourceError = $derived(
        internalViewerState.tileSourceError as ViewerTileSourceError,
    );
    let tileSourceErrorMessage = $derived(
        tileSourceError?.type === 'load'
            ? tileSourceError.message || 'Unable to load this image.'
            : null,
    );
    let tileSourceErrorDetails = $derived(
        tileSourceError?.type === 'load' &&
            tileSourceError.details &&
            tileSourceError.details !== tileSourceErrorMessage
            ? tileSourceError.details
            : null,
    );

    /**
     * The plugin **overlay layers** to place over the image.
     *
     * Reading the revision counter is what establishes the dependency: the
     * registry's list is a plain frozen array rebuilt on change, not reactive
     * state, exactly as the paint hook's is — the two registries are
     * deliberately structurally identical, so this is one idiom rather than two.
     * The `void` read is therefore load-bearing and not a leftover to tidy away.
     */
    let overlayLayers = $derived.by(() => {
        void internalViewerState.overlayLayerRevision;
        return internalViewerState.overlayLayers;
    });
</script>

<div
    bind:this={rootElement}
    id="triiiceratops-viewer"
    class="viewer-root"
    class:opaque={!internalViewerState.config.transparentBackground}
    data-controls={resolvedControls}
    data-nav-style={resolvedNavStyle}
    data-nav-edge={resolvedNavEdge}
    data-nav-align={resolvedNavAlign}
>
    <!-- Toolbar docked as the screen-edge rail (same-side fix). Its own column,
         OUTSIDE the panel column's slideWidth outro, so it stays full size
         through the close and then swaps atomically with the floating toolbar
         (see dockRailLeft) — no collapsing icons, no duplicate, no empty gap. -->
    {#if dockRailLeft}
        <div
            class="toolbar-rail-host rail-col"
            class:opaque={!internalViewerState.config.transparentBackground}
        >
            <Toolbar docked />
        </div>
    {/if}

    <!-- Left Column -->
    {#if isLeftSidebarVisible}
        <div
            class="side-col side-col-left"
            class:opaque={!internalViewerState.config.transparentBackground}
        >
            {#if visiblePanelsLeft.length > 0}
                <div
                    class="panel-host"
                    style="width: {leftPanelWidth}"
                    transition:slideWidth|global
                >
                    <PanelStack
                        panels={visiblePanelsLeft}
                        closeAlign="end"
                        side="left"
                    />
                </div>
            {/if}

            <!-- Gallery (when docked left) -->
            {#if galleryDocked && internalViewerState.dockSide === 'left'}
                <div
                    class="gallery-host"
                    style="--ui-gallery-rail: {galleryExtent}px"
                    transition:slideWidth|global
                >
                    <ThumbnailGallery {canvases} />
                </div>
            {/if}
        </div>
    {/if}

    <!-- Center Column -->
    <div id="triiiceratops-center-panel" class="center-col">
        <!-- Top Area (Gallery) -->
        {#if galleryDocked && internalViewerState.dockSide === 'top'}
            <div
                class="gallery-band"
                style="--ui-gallery-band: {galleryExtent}px"
            >
                <ThumbnailGallery {canvases} />
            </div>
        {/if}

        <!-- Main Viewer Area -->
        <div
            class="viewer-area"
            class:opaque={!internalViewerState.config.transparentBackground}
            role={internalViewerState.config.enableDragDrop
                ? 'region'
                : undefined}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
        >
            {#if manifestData?.isFetching}
                <div class="centered">
                    <Spinner
                        size="lg"
                        style="color:var(--tri-color-primary-text)"
                    />
                </div>
            {:else if manifestData?.error}
                <div class="centered error-text">
                    {m.error_prefix()}
                    {manifestData.error}
                </div>
            {:else if tileSources}
                {#if tileSourceError}
                    <div class="overlay-cover" role="alert">
                        {#if currentCanvasThumbnail}
                            <img
                                src={currentCanvasThumbnail}
                                alt=""
                                class="blur-bg"
                            />
                            <div class="dim-50"></div>
                        {/if}
                        <div class="error-card">
                            {#if tileSourceError.type === 'auth'}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="warn-icon"
                                >
                                    <rect
                                        x="3"
                                        y="11"
                                        width="18"
                                        height="11"
                                        rx="2"
                                        ry="2"
                                    />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <p class="msg">
                                    {m.error_auth_required()}
                                </p>
                            {:else}
                                <Icon
                                    name="ImageBroken"
                                    size={48}
                                    color="var(--tri-color-warning)"
                                />
                                <p class="msg msg-strong">
                                    {tileSourceErrorMessage}
                                </p>
                                {#if tileSourceErrorDetails}
                                    <p class="msg-details">
                                        {tileSourceErrorDetails}
                                    </p>
                                {/if}
                            {/if}
                        </div>
                    </div>
                {:else}
                    <!--
                        The one renderer. There is no renderer selection: the
                        first-party Canvas2D host is what the viewer mounts, and
                        no build flag, config option, or capability can change
                        that (ADR 0012).
                    -->
                    <CanvasHost
                        {tileSources}
                        viewerState={internalViewerState}
                    />
                {/if}
            {:else if manifestData && !manifestData.isFetching && !tileSources}
                <div class="overlay-cover" role="status">
                    {#if currentCanvasThumbnail}
                        <img
                            src={currentCanvasThumbnail}
                            alt=""
                            class="blur-bg"
                        />
                        <div class="dim-50"></div>
                    {/if}
                    <div class="error-card">
                        <Icon
                            name="ImageBroken"
                            size={48}
                            color="var(--tri-color-warning)"
                        />
                        <p class="msg msg-strong">
                            {m.no_image_found()}
                        </p>
                    </div>
                </div>
            {/if}

            <!--
                The annotation SHAPES, and then the connector lines between them
                and the annotation panel. Two distinct concerns, both mounted
                here rather than inside a renderer: they are bound to the `frame`
                cadence and to the viewport coordinate helpers, so neither knows
                which renderer is mounted.

                The shape layer comes AFTER the renderer in DOM order, so Tab
                reaches the image surface before the things marked on it, and it
                is a SIBLING of the renderer root rather than a child — the
                renderer root is `role="application"`, which suppresses browse
                mode for its whole subtree and would hide these labels from NVDA
                and JAWS. `.viewer-area` is the shared positioning context, which
                is what makes the surface-local coordinates
                `ViewerState.canvasToScreen` returns this layer's own.
            -->
            <AnnotationShapeOverlay />
            <AnnotationOverlay />

            <!--
                Plugin **overlay layers**: one container per registered layer,
                which the plugin renders into and owns.

                TWO INDEPENDENT REQUIREMENTS, both load-bearing, both easy to
                break by a refactor that looks tidier:

                1. This is OUTSIDE the `{#if}` that mounts `CanvasHost`, a
                   sibling of the annotation overlays above. Grouping it with the
                   renderer would put every plugin's DOM inside the gate a
                   manifest change closes, destroying and rebuilding it — which
                   fails invisibly in any test that only ever loads one manifest.
                2. It is KEYED on layer id. Unkeyed, node reuse is positional, so
                   registering or disposing one layer can hand a SURVIVING layer
                   a different container node — and `PluginMountHost` remounts
                   when its node is recreated. Same broken guarantee, different
                   mechanism.

                The wrapper is what provides the box: `PluginMountHost`'s own
                element is `display: contents` and provides none, so positioning
                it instead would leave plugin children measured against the wrong
                ancestor — which looks almost right until a panel is docked.
            -->
            {#each overlayLayers as layer (layer.id)}
                <div class="plugin-overlay-layer">
                    <PluginMountHost mount={layer.mount} />
                </div>
            {/each}

            <!-- Floating Toolbar (suppressed while the docked rail occupies its
                 side — including the tail of the un-dock animation, since
                 toolbarDockedAsRail is latched — or in `unified` controls where
                 the buttons live in the nav). The hand-off is atomic: this mounts
                 in the same flush the rail column unmounts. -->
            {#if !toolbarDockedAsRail && resolvedControls !== 'unified'}
                <Toolbar />
            {/if}

            <!-- Overlay Plugin Panels -->
            {#each internalViewerState.pluginPanels as panel (panel.id)}
                {#if panel.isVisible() && internalViewerState.getPluginPosition(panel.pluginId) === 'overlay'}
                    <div class="plugin-overlay">
                        {#if panel.mount}
                            <PluginMountHost mount={panel.mount} />
                        {/if}
                    </div>
                {/if}
            {/each}

            <!-- Viewer Controls (Canvas Navigation + Zoom + IIIF Choice Selector) -->
            <ViewerControls />

            {#if internalViewerState.config.enableDragDrop && isDragOver}
                <div class="drag-overlay">
                    <div class="drag-hint">
                        {m.drop_manifest_hint()}
                    </div>
                </div>
            {/if}

            <!-- Float-mode Gallery -->
            {#if galleryDocked && internalViewerState.dockSide === 'none'}
                <ThumbnailGallery {canvases} />
            {/if}
        </div>

        <!-- Bottom Area (Gallery) -->
        {#if galleryDocked && internalViewerState.dockSide === 'bottom'}
            <div
                class="gallery-band"
                style="--ui-gallery-band: {galleryExtent}px"
            >
                <ThumbnailGallery {canvases} />
            </div>
        {/if}

        <!-- Bottom Area (Plugin Panels) -->
        {#each internalViewerState.pluginPanels as panel (panel.id)}
            {#if panel.isVisible() && internalViewerState.getPluginPosition(panel.pluginId) === 'bottom'}
                <div class="plugin-bottom">
                    {#if panel.mount}
                        <PluginMountHost mount={panel.mount} />
                    {/if}
                </div>
            {/if}
        {/each}

        <!-- Expanded Gallery. An overlay layer covering the center column, so
             the renderer keeps its size underneath (no re-layout or re-fit when it
             collapses) and the side panels stay visible and usable. Last child
             of the column and z-index above the bands so it covers the docked
             strip site and the bottom plugin panels. -->
        {#if galleryExpanded}
            <div
                class="gallery-expanded"
                class:inset-left={floatingToolbarSide === 'left'}
                class:inset-right={floatingToolbarSide === 'right'}
                transition:expandGallery|global={galleryExpandFrom}
            >
                <ThumbnailGallery {canvases} />
            </div>
        {/if}
    </div>

    <!-- Right Column -->
    {#if isRightSidebarVisible}
        <div
            class="side-col side-col-right"
            class:opaque={!internalViewerState.config.transparentBackground}
        >
            {#if visiblePanelsRight.length > 0}
                <div
                    class="panel-host"
                    style="width: {rightPanelWidth}"
                    transition:slideWidth|global
                >
                    <PanelStack
                        panels={visiblePanelsRight}
                        closeAlign={dockRailRight ? 'start' : 'end'}
                        side="right"
                    />
                </div>
            {/if}

            <!-- Gallery (when docked right) -->
            {#if galleryDocked && internalViewerState.dockSide === 'right'}
                <div
                    class="gallery-host"
                    style="--ui-gallery-rail: {galleryExtent}px"
                    transition:slideWidth|global
                >
                    <ThumbnailGallery {canvases} />
                </div>
            {/if}
        </div>
    {/if}

    <!-- Toolbar docked as the screen-edge rail (same-side fix). Its own column,
         OUTSIDE the panel column's slideWidth outro, so it stays full size
         through the close and then swaps atomically with the floating toolbar
         (see dockRailRight) — no collapsing icons, no duplicate, no empty gap. -->
    {#if dockRailRight}
        <div
            class="toolbar-rail-host rail-col"
            class:opaque={!internalViewerState.config.transparentBackground}
        >
            <Toolbar docked />
        </div>
    {/if}
</div>

<style>
    .viewer-root {
        display: flex;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        /* Re-anchor text color to this element's own resolved tokens. The `theme`
           prop sets data-theme on THIS element, so --tri-content here may
           differ from the inherited (host/page) value; resolving it locally keeps
           viewer text legible regardless of the host page's color. */
        color: var(--tri-content);
    }
    .viewer-root.opaque {
        background-color: var(--tri-viewer-bg);
    }

    .side-col {
        flex: none;
        min-height: 0;
        display: flex;
        flex-direction: row;
        z-index: 20;
        transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .side-col.opaque {
        background-color: var(--tri-viewer-bg);
    }
    .side-col-left.opaque {
        border-right: 1px solid var(--tri-surface-border);
    }

    .toolbar-rail-host {
        height: 100%;
        min-height: 0;
        flex: none;
        position: relative;
        pointer-events: auto;
    }
    /* The rail is its own screen-edge flex column (a sibling of the panel column,
       not nested inside it). Stack it above the side panels (z-index 20) so a
       docked toolbar's flyouts — which escape the rail toward the canvas, over
       the panel region — win regardless of DOM order. */
    .toolbar-rail-host.rail-col {
        z-index: 21;
    }
    .toolbar-rail-host.rail-col.opaque {
        background-color: var(--tri-viewer-bg);
    }

    .panel-host {
        height: 100%;
        min-height: 0;
        position: relative;
        /* Contain the panels' internal z-indexes (e.g. the sticky section
           header at z-index:10) so they can't out-stack the docked toolbar
           rail's flyouts, which sit above via .toolbar-rail-host's z-index. */
        isolation: isolate;
        pointer-events: auto;
    }
    /* Only the docked gallery rail uses this host, and its width is `gallery.size`
       (published as `--ui-gallery-rail`) plus the gallery's own themeable border. */
    .gallery-host {
        width: calc(var(--ui-gallery-rail) + var(--tri-border));
        height: 100%;
        min-height: 0;
        position: relative;
        isolation: isolate;
        pointer-events: auto;
    }

    .center-col {
        flex: 1 1 0%;
        position: relative;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    /* `gallery.size` (published as `--ui-gallery-band`) plus the gallery's own
       themeable border — see `.gallery-host` above. */
    .gallery-band {
        flex: none;
        height: calc(var(--ui-gallery-band) + var(--tri-border));
        width: 100%;
        position: relative;
        pointer-events: auto;
        z-index: 20;
    }

    .gallery-expanded {
        position: absolute;
        inset: 0;
        /* Above .gallery-band (20) and the bottom plugin panels so the expanded
           grid covers the whole center column. Deliberately scoped to this
           column: the side panels and the docked toolbar rail (z-index 21 in
           their own columns) stay reachable. */
        z-index: 30;
        pointer-events: auto;
        isolation: isolate;
    }
    /* Clear the floating toolbar's edge strip (see floatingToolbarSide). Padding
       on this host shrinks the gallery inside it, so no thumbnail ever lands
       under the toolbar's icons. */
    .gallery-expanded.inset-left {
        padding-left: 3rem;
    }
    .gallery-expanded.inset-right {
        padding-right: 3rem;
    }

    .viewer-area {
        flex: 1 1 0%;
        position: relative;
        min-height: 0;
        width: 100%;
        height: 100%;
    }
    .viewer-area.opaque {
        background-color: var(--tri-viewer-bg);
    }

    .centered {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .error-text {
        color: var(--tri-color-error);
    }

    .overlay-cover {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        overflow: hidden;
    }
    .blur-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(24px);
        scale: 1.1;
        opacity: 0.4;
    }
    .dim-50 {
        position: absolute;
        inset: 0;
        background-color: color-mix(
            in oklab,
            var(--tri-viewer-bg) 50%,
            transparent
        );
    }
    .error-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        max-width: 24rem;
        text-align: center;
        padding-inline: 1rem;
        padding-block: 1.5rem;
        background-color: color-mix(
            in oklab,
            var(--tri-viewer-bg) 90%,
            transparent
        );
        border-radius: 0.75rem;
        box-shadow:
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a;
    }
    .warn-icon {
        width: 3rem;
        height: 3rem;
        color: var(--tri-color-warning);
    }
    .msg {
        color: var(--tri-content);
        font-size: 0.875rem;
        line-height: 1.25rem;
    }
    .msg-strong {
        font-weight: 600;
    }
    .msg-details {
        color: color-mix(in oklab, var(--tri-content) 70%, transparent);
        font-size: 0.75rem;
        line-height: 1rem;
        overflow-wrap: break-word;
        max-width: 20rem;
    }

    .plugin-overlay {
        position: absolute;
        inset: 0;
        z-index: 40;
        pointer-events: none;
    }
    /*
     * A plugin overlay layer's box. Its origin is `.viewer-area`'s, which is
     * what makes it `ViewerState.canvasToScreen`'s origin too — a published
     * contract, so a plugin positions an element straight from a projected
     * point.
     *
     * `z-index: 40` matches `.plugin-overlay` and sits BELOW core's annotation
     * shapes at 50: those are focusable targets carrying the viewer's own
     * accessible names, and a plugin layer painted over them would break that
     * silently. Transparent to pointer events, so adding a layer cannot cost the
     * reader panning; plugin children opt in with `pointer-events: auto`.
     */
    .plugin-overlay-layer {
        position: absolute;
        inset: 0;
        z-index: 40;
        pointer-events: none;
    }
    .plugin-bottom {
        position: relative;
        width: 100%;
        z-index: 40;
        pointer-events: auto;
    }

    .drag-overlay {
        position: absolute;
        inset: 0;
        z-index: 45;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: color-mix(
            in oklab,
            var(--tri-viewer-bg) 70%,
            transparent
        );
        backdrop-filter: blur(4px);
    }
    .drag-hint {
        border-radius: var(--tri-radius-box);
        border: 2px dashed var(--tri-color-primary);
        background-color: color-mix(
            in oklab,
            var(--tri-viewer-bg) 90%,
            transparent
        );
        padding-inline: 1.5rem;
        padding-block: 1rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 500;
        color: var(--tri-content);
        box-shadow:
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a;
    }

    /* Scoped scrollbar styles for the viewer */
    :global(#triiiceratops-viewer *) {
        scrollbar-width: thin;
        scrollbar-color: color-mix(
                in oklab,
                var(--tri-content) 20%,
                transparent
            )
            transparent;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar) {
        width: 4px;
        height: 4px;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-track) {
        background: transparent;
        border-radius: 9999px;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-thumb) {
        background-color: color-mix(
            in oklab,
            var(--tri-content) 20%,
            transparent
        );
        border-radius: 9999px;
        border: 1px solid transparent;
        background-clip: padding-box;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-thumb:hover) {
        background-color: color-mix(
            in oklab,
            var(--tri-content) 40%,
            transparent
        );
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-corner) {
        background: transparent;
        border-radius: 9999px;
    }
</style>
