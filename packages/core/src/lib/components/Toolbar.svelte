<script lang="ts">
    import Icon from './Icon.svelte';
    import { Button } from './ui';
    import PluginIcon from './PluginIcon.svelte';
    import PluginMountHost from './PluginMountHost.svelte';
    import { getContext, onMount } from 'svelte';
    import type { IconName } from '../generated/icons';
    import type { BarMenu } from '../types/config';
    import type { IconDescriptor } from '../types/plugin';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages, resolveChromeName } from '../state/i18n.svelte';
    import {
        FOCUS_MEMORY_KEY,
        focusIsOrphaned,
        type FocusMemory,
    } from '../utils/focusMemory';
    import { dismissible, panelToggleSelector } from '../utils/dismissible';
    import { nextRovingIndex } from '../utils/roving';

    interface Props {
        /**
         * Render as an in-flow docked rail (the cross-cutting same-side fix)
         * instead of a floating overlay. The parent renders the toolbar this way
         * only when its configured side hosts a panel/gallery AND it is open, so
         * the rail sits at the screen edge with the panel inboard of it.
         */
        docked?: boolean;
        /**
         * Render only the bare action buttons as a horizontal group (no shell,
         * positioning, handle, or collapse), for embedding inside another bar —
         * used by the Unified Bar preset to place the toolbar buttons in the
         * canvas nav.
         */
        inline?: boolean;
    }

    let { docked = false, inline = false }: Props = $props();
    const m = getMessages();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    const focusMemory = getContext<FocusMemory | undefined>(FOCUS_MEMORY_KEY);

    // --- Inline (Unified Bar) row balancing ---
    // In `inline` mode the action <ul> is allowed to wrap. Flexbox fills rows
    // greedily (6 + 1), so once the icons need a second row we compute an even
    // split (4 + 3) by capping the group's width to `ceil(count / rows)`
    // columns. Measured against the control-bar's stable offset parent (not the
    // group itself) so setting the cap can't feed back into the observer.
    let actionsEl: HTMLUListElement | undefined = $state();

    function balanceInlineRows(el: HTMLUListElement) {
        el.style.maxWidth = '';
        const items = Array.from(el.children) as HTMLElement[];
        const n = items.length;
        if (n < 2) return;

        const bar = el.closest('.control-bar') as HTMLElement | null;
        const container =
            (bar?.offsetParent as HTMLElement | null) ??
            bar?.parentElement ??
            null;
        if (!bar || !container) return;

        const barStyle = getComputedStyle(bar);
        const left = parseFloat(barStyle.left) || 0;
        const right = parseFloat(barStyle.right) || 0;
        const padX =
            (parseFloat(barStyle.paddingLeft) || 0) +
            (parseFloat(barStyle.paddingRight) || 0);
        const avail = container.clientWidth - left - right - padX;
        if (avail <= 0) return;

        const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
        let sum = 0;
        let widest = 0;
        for (const it of items) {
            const w = it.getBoundingClientRect().width;
            sum += w;
            if (w > widest) widest = w;
        }
        const natural = sum + gap * (n - 1);
        if (natural <= avail) return; // fits on one row — no cap needed

        const rows = Math.ceil(natural / avail);
        const perRow = Math.ceil(n / rows);
        el.style.maxWidth = `${perRow * widest + (perRow - 1) * gap + 1}px`;
    }

    $effect(() => {
        if (!inline || !actionsEl) return;
        const el = actionsEl;
        // Only balance once settled (open + animation finished). While closed or
        // animating the group is a single clipped row, so clear any cap — a
        // stale one would force it to wrap tall and balloon the bar's height.
        // Re-runs when `settled` flips.
        if (!settled) {
            el.style.maxWidth = '';
            return;
        }
        const bar = el.closest('.control-bar') as HTMLElement | null;
        const container =
            (bar?.offsetParent as HTMLElement | null) ??
            bar?.parentElement ??
            null;
        const run = () => balanceInlineRows(el);
        // Container width changes → re-balance. Its width is independent of the
        // cap we set, so no feedback loop.
        const ro = new ResizeObserver(run);
        if (container) ro.observe(container);
        // Icon set changes (plugins mounting) → re-balance. childList only, so
        // our maxWidth style writes don't re-trigger it.
        const mo = new MutationObserver(run);
        mo.observe(el, { childList: true });
        run();
        return () => {
            ro.disconnect();
            mo.disconnect();
        };
    });

    const isOpen = $derived(viewerState.toolbarOpen);

    // --- Unified Bar open/close animation ---
    // The group is revealed/collapsed by animating a max-width CLIP over it. While
    // animating (and closed) it is held to a single `nowrap` row (see `.collapsed`
    // below), so it never reflows taller (opening) or unwraps ~2× wider (closing);
    // the animated `max-width` also CAPS the bar, so even the transient single row
    // can't widen it past the target. `overflow: hidden` clips the excess. Once
    // the transition finishes we "settle": release the clip (`max-width: none` +
    // `overflow: visible`) and re-enable wrapping so the row balancer and plugin
    // flyouts work again. The target width is measured from the DOM because CSS
    // can't transition to/from an intrinsic `auto` width.
    const ANIM_MS = 200;
    let shellEl: HTMLDivElement | undefined = $state();
    let settled = $state(false);
    let animating = $state(false);
    let firstRun = true;

    $effect(() => {
        const shell = shellEl;
        const ul = actionsEl;
        // Depend on isOpen so this re-runs on every toggle.
        const open = isOpen;
        if (!inline || !shell || !ul) {
            settled = false;
            animating = false;
            return;
        }
        // Don't animate the initial mount — just adopt the resting state.
        if (firstRun) {
            firstRun = false;
            settled = open;
            return;
        }

        settled = false;
        animating = true;
        let raf = 0;
        if (open) {
            // Reveal 0 → natural single-row width (measured with the clip lifted).
            // Opening starts from the closed single row, so there is nothing to
            // unwrap; it settles into its wrapped layout at the end.
            shell.style.maxWidth = 'none';
            const w = ul.offsetWidth; // forced layout read
            shell.style.maxWidth = '0px';
            raf = requestAnimationFrame(() => {
                shell.style.maxWidth = `${w}px`;
            });
        } else {
            // Collapse the CURRENT (possibly multi-row) layout → 0. Freeze the
            // list at its exact current width so it keeps its wrapped rows while
            // the clip shrinks — otherwise switching to nowrap would unwrap the
            // rows into one ~2× wider row for a frame (the visible flash).
            const w = ul.offsetWidth;
            ul.style.width = `${w}px`;
            shell.style.maxWidth = `${w}px`;
            void shell.offsetWidth; // reflow so the next value transitions
            shell.style.maxWidth = '0px';
        }
        const id = setTimeout(() => {
            // Release: clear the inline sizing so the resting CSS applies
            // (settled → none / closed → 0). Now the closed group may drop to a
            // single nowrap row (compact height) — invisible, already clipped.
            shell.style.maxWidth = '';
            ul.style.width = '';
            animating = false;
            settled = open;
        }, ANIM_MS + 40);

        return () => {
            if (raf) cancelAnimationFrame(raf);
            clearTimeout(id);
        };
    });

    // --- Configuration ---
    // Compose the internal placement string from the nested toolbar config
    // (side = left/right, anchor = top/center). Defaults: left + center.
    const side = $derived(viewerState.config.toolbar?.side || 'left');
    const anchor = $derived(viewerState.config.toolbar?.anchor || 'center');
    const position = $derived(anchor === 'top' ? `top-${side}` : side);
    const isTop = $derived(anchor === 'top');

    // --- Away edge ---
    // The direction pointing away from the edge the buttons sit on, and toward
    // the canvas. Everything anchored to a toolbar button grows or points this
    // way: its tooltip, and a flyout panel. When inline (unified) the buttons
    // live inside the nav bar, so the edge is the nav's rather than the
    // toolbar's own side.
    const navOnTop = $derived(viewerState.config.nav?.edge === 'top');
    const awayEdge: 'top' | 'bottom' | 'left' | 'right' = $derived(
        inline
            ? navOnTop
                ? 'bottom'
                : 'top'
            : isTop
              ? 'bottom'
              : side === 'left'
                ? 'right'
                : 'left',
    );
    const tooltipPlacement = $derived(`place-${awayEdge}`);
    // A vertical away edge grows the panel out of the button's block flow, so it
    // reads as up/down; a horizontal one grows it inline and keeps the name.
    const flyoutPlacement = $derived(
        awayEdge === 'top' ? 'up' : awayEdge === 'bottom' ? 'down' : awayEdge,
    );

    // The floating open handle sits at the toolbar's own side whatever the
    // anchor, so its tooltip only ever points inboard.
    const openButtonTooltipPlacement = $derived(
        side === 'left' ? 'place-right' : 'place-left',
    );
    const handleClass = $derived(
        [
            'handle tooltip',
            openButtonTooltipPlacement,
            isOpen && 'invisible',
            isTop && 'top',
            (position === 'left' || position === 'top-left') && 'start',
            (position === 'right' || position === 'top-right') && 'end',
        ]
            .filter(Boolean)
            .join(' '),
    );

    // Inside a nav bar aligned to the inline-start screen edge the leading
    // button hugs that edge, so its centred bubble would overflow the viewer.
    // The shared tooltip sheet re-anchors it; only this component knows which
    // button is the leading one.
    const leadTooltipEdge = $derived(
        inline && viewerState.config.nav?.align === 'start'
            ? 'tt-edge-start'
            : '',
    );

    // --- Standard Viewer Actions ---
    const toolbarConfig = $derived(viewerState.config.toolbar || {});
    const showSearch = $derived(toolbarConfig.showSearch !== false);
    const showGallery = $derived(toolbarConfig.showGallery !== false);
    const showFullscreen = $derived(toolbarConfig.showFullscreen !== false);
    const annotationCount = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return 0;
        }

        // A claimed canvas has no annotation surface of core's: the panel this
        // button opens and the overlay behind it both filter by
        // `annotatableCanvasIds`. Counting annotations core cannot render would
        // put a live button over an empty panel. The claimant surfaces its own.
        if (!viewerState.annotatableCanvasIds.includes(viewerState.canvasId)) {
            return 0;
        }

        return viewerState.getAnnotations(
            viewerState.manifestId,
            viewerState.canvasId,
        ).length;
    });
    const showAnnotations = $derived(
        toolbarConfig.showAnnotations !== false && annotationCount > 0,
    );
    const showInfo = $derived(toolbarConfig.showInfo !== false);
    const showViewingMode = $derived(toolbarConfig.showViewingMode !== false);
    const showStructures = $derived(
        viewerState.config.showStructures !== false &&
            toolbarConfig.showStructures !== false &&
            viewerState.nonSequenceStructures.length > 0,
    );
    const showCollection = $derived(
        toolbarConfig.showCollection !== false && viewerState.hasCollection,
    );
    const showSequencePicker = $derived(viewerState.sequenceCount > 1);

    // The BUTTON is manifest-driven, like the sequence picker: a radio menu
    // offering one language cannot do anything, so a monolingual manifest gets
    // no button and no toolbar width spent on it. What the menu LISTS is wider
    // than that (see `pickableLocales`).
    const availableLocales = $derived(viewerState.availableLocales);
    const showLocalePicker = $derived(
        toolbarConfig.showLocalePicker !== false && availableLocales.length > 1,
    );
    /**
     * The locales the menu offers: the manifest's, plus every locale the host
     * names a chrome catalog for — sorted together, so the order rule is the one
     * `collectManifestLocales` already applies.
     *
     * A locale the host's `loadMessages` might supply is NOT among them unless
     * the host also names it in `messages` (an empty object is enough): the
     * picker must never offer a language nothing can be shown in.
     */
    const pickableLocales = $derived(
        [
            ...new Set([
                ...availableLocales,
                ...Object.keys(viewerState.config.messages ?? {}),
            ]),
        ].sort(),
    );
    /**
     * [tag, endonym] for the language menu's radio items.
     *
     * Each name is built in its OWN language, not the active one, so the menu
     * stays legible to a reader who cannot read the locale the viewer is
     * currently rendering in — the whole point of a language picker. A tag
     * `Intl.DisplayNames` cannot name (it echoes the input, or throws on a
     * malformed tag) falls back to the tag itself.
     */
    const localeItems = $derived(
        pickableLocales.map((tag): [string, string] => {
            try {
                const name = new Intl.DisplayNames([tag], {
                    type: 'language',
                }).of(tag);
                return [tag, name && name !== tag ? name : tag];
            } catch {
                return [tag, tag];
            }
        }),
    );
    const sequenceOptions = $derived.by(() => {
        const sequenceStructures = viewerState.sequenceStructures;
        if (sequenceStructures.length > 0) {
            return sequenceStructures.map((node, index) => ({
                index,
                label: node.label || `${m.sequence_label()} ${index + 1}`,
            }));
        }

        return Array.from(
            { length: viewerState.sequenceCount },
            (_, index) => ({
                index,
                label: `${m.sequence_label()} ${index + 1}`,
            }),
        );
    });
    const annotationsTooltip = $derived.by(() => {
        const base = viewerState.showAnnotations
            ? m.hide_annotations()
            : m.show_annotations();

        return annotationCount > 0 ? `${base} (${annotationCount})` : base;
    });

    /** One selectable row of a built-in menu. */
    type MenuRow = {
        key: string;
        /** Leading glyph. The locale menu's endonyms carry none. */
        icon?: IconName;
        label: string;
        checked: boolean;
        onclick: () => void;
        /**
         * The language this row's label is written in — the locale menu names
         * each language in itself, and a screen reader needs the switch.
         */
        lang?: string;
        /** The shift-pairing row is a checkbox among radios. */
        role?: 'menuitemradio' | 'menuitemcheckbox';
        textStart?: boolean;
    };

    /** The glyph the viewing-mode toggle wears: the mode currently in effect. */
    const viewingModeGlyph: IconName = $derived(
        viewerState.viewingMode === 'paged'
            ? 'BookOpen'
            : viewerState.viewingMode === 'continuous'
              ? 'Scroll'
              : 'File',
    );

    // [mode, glyph, label] for the viewing-mode menu's radio items.
    const viewingModeItems = $derived([
        ['individuals', 'File', m.viewing_mode_individuals()],
        ['paged', 'BookOpen', m.viewing_mode_paged()],
        ['continuous', 'Scroll', m.viewing_mode_continuous()],
    ] as const);

    // The shift-pairing row is a checkbox among radios, and is offered only in
    // the mode it means anything in.
    const viewingModeRows: MenuRow[] = $derived([
        ...viewingModeItems.map(([mode, icon, label]) => ({
            key: mode,
            icon,
            label,
            checked: viewerState.viewingMode === mode,
            onclick: () => viewerState.setViewingMode(mode),
        })),
        ...(viewerState.viewingMode === 'paged'
            ? [
                  {
                      key: 'shift-pairing',
                      icon: 'ArrowsLeftRight' as IconName,
                      label: m.viewing_mode_shift_pairing(),
                      checked: viewerState.pagedOffset === 1,
                      onclick: () => viewerState.togglePagedOffset(),
                      role: 'menuitemcheckbox' as const,
                      textStart: true,
                  },
              ]
            : []),
    ]);

    // [side, glyph, label] for the gallery menu's radio items — the four dock
    // sides, each glyph pointing at the edge it docks to, plus the off state.
    // 'off' is a placement in the menu's terms, not a dock side, so choosing a
    // side implies showing the gallery and choosing 'off' hides it.
    const galleryPlacementItems = $derived([
        ['top', 'CaretUp', m.gallery_placement_top()],
        ['bottom', 'CaretDown', m.gallery_placement_bottom()],
        ['left', 'CaretLeft', m.gallery_placement_left()],
        ['right', 'CaretRight', m.gallery_placement_right()],
        ['off', 'EyeSlash', m.gallery_placement_off()],
    ] as const);

    const galleryRows: MenuRow[] = $derived(
        galleryPlacementItems.map(([placement, icon, label]) => ({
            key: placement,
            icon,
            label,
            checked: galleryPlacement === placement,
            onclick: () => setGalleryPlacement(placement),
        })),
    );

    const sequenceRows: MenuRow[] = $derived(
        sequenceOptions.map((option) => ({
            key: String(option.index),
            icon: 'Stack' as IconName,
            label: option.label,
            checked: viewerState.selectedSequenceIndex === option.index,
            onclick: () => viewerState.setSequenceIndex(option.index),
        })),
    );

    const localeRows: MenuRow[] = $derived(
        localeItems.map(([tag, name]) => ({
            key: tag,
            label: name,
            checked: viewerState.activeLocale === tag,
            onclick: () => viewerState.setLocale(tag),
            lang: tag,
        })),
    );

    /** The menu item currently checked: the dock side, or 'off' when hidden. */
    const galleryPlacement = $derived(
        viewerState.showThumbnailGallery ? viewerState.dockSide : 'off',
    );

    function setGalleryPlacement(placement: string) {
        if (placement === 'off') {
            if (viewerState.showThumbnailGallery) {
                viewerState.toggleThumbnailGallery();
            }
            return;
        }
        viewerState.setDockSide(placement);
        if (!viewerState.showThumbnailGallery) {
            viewerState.toggleThumbnailGallery();
        }
    }

    /**
     * One row per built-in toolbar entry. A row naming a `flyout` carries the
     * whole menu — its identity, toggle and rows — and is rendered by the shared
     * `flyoutMenu` snippet; every other row is rendered by the one shared button
     * template.
     */
    type ToolbarEntry =
        | {
              key: string;
              show: boolean;
              flyout: (typeof TOOLBAR_MENUS)[number];
              /** Accessible name, on both the toggle and the panel. */
              label: string;
              /** The glyph the toggle wears. */
              glyph: IconName;
              /** Count pill on the toggle; the sequence picker's alone. */
              badge?: string | number;
              /** A wider panel, for menus whose labels run long. */
              wide?: boolean;
              rows: MenuRow[];
          }
        | {
              key: string;
              show: boolean;
              flyout?: undefined;
              icon: IconName;
              /** Hover tooltip; often shorter than the accessible name. */
              tip: string;
              /** Accessible name. */
              label: string;
              pressed: boolean;
              /** Id of the panel this toggles, for focus return on close. */
              panel?: string;
              indicator?: boolean;
              onclick: () => void;
          };

    // The built-in toolbar entries in render order. A new flyout entry belongs in
    // this list, with a matching `{:else if}` branch of the `{#each}` below
    // rendering `flyoutMenu` with its own rows snippet.
    const toolbarEntries: ToolbarEntry[] = $derived([
        {
            key: 'collection',
            show: showCollection,
            icon: 'Folder',
            tip: m.collection_title(),
            label: m.toggle_collection(),
            pressed: viewerState.showCollectionPanel,
            panel: 'collection',
            indicator: true,
            onclick: () => viewerState.toggleCollectionPanel(),
        },
        {
            key: 'search',
            show: showSearch,
            icon: 'MagnifyingGlass',
            tip: m.search(),
            label: m.toggle_search(),
            pressed: viewerState.showSearchPanel,
            panel: 'search',
            onclick: () => viewerState.toggleSearchPanel(),
        },
        {
            key: 'gallery',
            show: showGallery,
            flyout: 'gallery',
            label: m.gallery_label(),
            glyph: 'Slideshow',
            rows: galleryRows,
        },
        {
            key: 'structures',
            show: showStructures,
            icon: 'ListBullets',
            tip: m.structures_title(),
            label: m.toggle_structures(),
            pressed: viewerState.showStructuresPanel,
            panel: 'structures',
            onclick: () => viewerState.toggleStructuresPanel(),
        },
        {
            key: 'viewing-mode',
            show: showViewingMode,
            flyout: 'viewing-mode',
            label: m.viewing_mode_label(),
            glyph: viewingModeGlyph,
            rows: viewingModeRows,
        },
        {
            key: 'sequence-picker',
            show: showSequencePicker,
            flyout: 'sequence',
            label: m.sequence_label(),
            glyph: 'Stack',
            badge:
                viewerState.sequenceCount > 99
                    ? '99+'
                    : viewerState.sequenceCount,
            wide: true,
            rows: sequenceRows,
        },
        {
            key: 'locale',
            show: showLocalePicker,
            flyout: 'locale',
            label: m.locale_label(),
            glyph: 'Translate',
            wide: true,
            rows: localeRows,
        },
        {
            key: 'fullscreen',
            show: showFullscreen,
            icon: viewerState.isFullScreen ? 'CornersIn' : 'CornersOut',
            tip: viewerState.isFullScreen
                ? m.exit_full_screen()
                : m.enter_full_screen(),
            label: viewerState.isFullScreen
                ? m.exit_full_screen()
                : m.enter_full_screen(),
            pressed: viewerState.isFullScreen,
            onclick: () => viewerState.toggleFullScreen(),
        },
        {
            key: 'annotations',
            show: showAnnotations,
            icon: 'ChatCenteredText',
            tip: annotationsTooltip,
            label: annotationsTooltip,
            pressed: viewerState.showAnnotations,
            panel: 'annotations',
            onclick: () => viewerState.toggleAnnotations(),
        },
        {
            key: 'metadata',
            show: showInfo,
            icon: 'Info',
            tip: m.metadata(),
            label: m.toggle_metadata(),
            pressed: viewerState.showMetadataPanel,
            panel: 'metadata',
            onclick: () => viewerState.toggleMetadataPanel(),
        },
    ]);

    const visibleEntries = $derived(
        toolbarEntries.filter((entry) => entry.show),
    );

    /** The subset of rows that carry a whole menu. */
    type FlyoutEntry = Extract<ToolbarEntry, { flyout: BarMenu }>;

    // Whether any of the configurable built-in actions is on screen — the left
    // half of the plugin separator's condition. The sequence picker is not among
    // them: it is manifest-driven rather than configured. Keyed off the `flyout`
    // discriminant rather than the row's `key`, so the exclusion is checked
    // against the union at compile time.
    const hasBuiltInActions = $derived(
        visibleEntries.some((entry) => entry.flyout !== 'sequence'),
    );

    let sortedPluginButtons = $derived(
        viewerState.pluginMenuButtons
            .filter((button) => button.isVisible?.() !== false)
            .sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    );

    // The panel a plugin button toggles, or undefined when it toggles nothing.
    // `registerSdkChrome` pairs a `<pluginId>:toggle` button with a
    // `<pluginId>:panel` panel; a button registered on its own is a one-shot
    // action, with no pressed state to announce and nothing to return focus to.
    function toggledPanelId(pluginId: string | undefined): string | undefined {
        if (!pluginId) return undefined;
        const panelId = `${pluginId}:panel`;
        return viewerState.pluginPanels.some((panel) => panel.id === panelId)
            ? panelId
            : undefined;
    }

    function findFlyout(domId: string | undefined) {
        if (!domId) return undefined;
        return viewerState.pluginFlyouts.find((f) => f.domId === domId);
    }

    // Built-in toolbar dropdowns (viewing mode, gallery, sequence
    // picker) use the same non-top-layer flyout pattern as plugin flyouts, so
    // tooltips paint above them too. Only one is open at a time.
    //
    // Held on viewer state rather than here, so a host can open one from
    // config. The transport's caption list shares that member; these four are
    // the toolbar's own, and are the only ones it may dismiss.
    const TOOLBAR_MENUS = [
        'gallery',
        'viewing-mode',
        'sequence',
        'locale',
    ] as const satisfies readonly BarMenu[];
    const openMenu = $derived(viewerState.openMenu);
    let toolbarRootEl: HTMLElement | undefined = $state();

    function toggleMenu(name: BarMenu) {
        viewerState.toggleMenu(name);
    }

    // When a built-in flyout opens, move keyboard focus into it (menu behavior).
    // Escape restores focus to the toggle (see handleWindowKeydown). Runs after
    // the DOM updates so the `.open` panel and its items exist.
    $effect(() => {
        if (!openMenu) return;
        const name = openMenu;
        requestAnimationFrame(() => {
            if (openMenu !== name) return;
            const panel = toolbarRootEl?.querySelector(
                '[data-flyout-panel].open',
            );
            const first = panel?.querySelector<HTMLElement>(
                '[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"], button, [href], input, select',
            );
            first?.focus();
        });
    });

    // Roving arrow-key navigation within a built-in flyout menu (ArrowUp/Down,
    // Home/End). Enter/Space activate natively; Escape is handled globally.
    function onFlyoutMenuKeydown(e: KeyboardEvent) {
        const menu = e.currentTarget as HTMLElement;
        const items = Array.from(
            menu.querySelectorAll<HTMLElement>(
                '[role="menuitemradio"], [role="menuitemcheckbox"]',
            ),
        );
        const root = menu.getRootNode() as Document | ShadowRoot;
        const active = root.activeElement as HTMLElement | null;
        const next = nextRovingIndex(
            e.key,
            items.indexOf(active as HTMLElement),
            items.length,
        );
        if (next < 0) return;
        e.preventDefault();
        items[next].focus();
    }

    function closeAllOverlays() {
        if (TOOLBAR_MENUS.some((menu) => menu === openMenu)) {
            viewerState.setOpenMenu(null);
        }
        viewerState.closePluginFlyouts();
    }

    function handleWindowKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            // Restore focus to the toggle of whichever flyout is open before
            // dismissing it, so keyboard focus is never dropped to <body>.
            const openToggle = toolbarRootEl?.querySelector<HTMLElement>(
                '[data-flyout-toggle][aria-expanded="true"]',
            );
            closeAllOverlays();
            openToggle?.focus();
        }
    }

    function toggleOpen() {
        viewerState.toggleToolbar();
    }

    // Carry focus across the floating↔rail hand-off. That swap tears this
    // toolbar down and builds an identical one (see the `dockRailLeft` comment
    // in TriiiceratopsViewer), which drops focus to <body> if the reader was
    // standing on a panel toggle — including the toggle a panel just returned
    // focus to on close, since the rail only unmounts once the column has
    // finished sliding shut. Re-focus the twin of that toggle here.
    //
    // Deferred to a microtask so the whole flush has finished first: if the
    // panel that opened took focus instead (`dismissible`'s `'orphaned'` mode),
    // focus is no longer orphaned and this stands down.
    onMount(() => {
        if (!toolbarRootEl || !focusMemory) return;
        // Scoped to this viewer's own memory, so a viewer mounting beside
        // another one never acts on a toggle that was never in it.
        const previous = focusMemory.lastFocused();
        const panelId = previous?.dataset.panelToggle;
        if (!panelId) return;
        queueMicrotask(() => {
            if (previous.isConnected) return;
            if (!toolbarRootEl?.isConnected || !focusIsOrphaned(toolbarRootEl))
                return;
            toolbarRootEl
                .querySelector<HTMLElement>(panelToggleSelector(panelId))
                ?.focus();
        });
    });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- ===== Shared flyout markup =====
     Every flyout toggle — the built-in menus' and the plugins' — is this one
     button. `anchor` is the identity the pair agrees on: the panel's DOM id
     (`tri-flyout-<anchor>`) and its CSS anchor (`--anchor-<anchor>`) are both
     derived from it, so they cannot drift apart. What differs is the popup a
     toggle announces (`menu` for a built-in, `dialog` for a plugin's), the
     plugin id it carries for plugin chrome, and which glyph table its icon
     comes from. -->
{#snippet flyoutToggle(
    anchor: string,
    label: string,
    haspopup: 'menu' | 'dialog',
    open: boolean,
    onclick: () => void,
    glyph: IconName | undefined,
    descriptor: IconDescriptor | undefined = undefined,
    pluginId: string | undefined = undefined,
    badge: string | number | undefined = undefined,
    edgeClass: string = '',
)}
    <button
        class="tri-menu-item tooltip {tooltipPlacement} {edgeClass}"
        class:indicator={badge !== undefined}
        class:is-active={open}
        data-tip={label}
        data-flyout-toggle
        data-plugin-toggle={pluginId}
        aria-label={label}
        aria-haspopup={haspopup}
        aria-controls="tri-flyout-{anchor}"
        aria-expanded={open}
        style="anchor-name:--anchor-{anchor}"
        {onclick}
    >
        {#if badge !== undefined}
            <span class="indicator-item count-badge">{badge}</span>
        {/if}
        {#if glyph}
            <Icon name={glyph} size={24} />
        {/if}
        {#if descriptor}
            <PluginIcon {descriptor} size={24} />
        {/if}
    </button>
{/snippet}

<!-- One built-in menu, toggle and panel. Both live in the `<li>` the
     `dismissible` action is attached to, so a press on either is "inside" and
     only a press elsewhere light-dismisses.

     A menu panel stays mounted while closed, which is what the other two
     options are about: outside-pointer dismissal is armed only while the menu
     is open (otherwise every press anywhere on the page would dismiss, and
     return focus with it), and nothing here may take focus on mount. Escape is
     handled at the window instead of here, because a host can open a menu from
     config with focus nowhere near it. -->
{#snippet flyoutMenu(entry: FlyoutEntry, edgeClass: string = '')}
    {@const name = entry.flyout}
    {@const open = openMenu === name}
    <li
        use:dismissible={{
            onDismiss: closeAllOverlays,
            escape: false,
            focusOnMount: false,
            outsidePointer: open,
        }}
    >
        {@render flyoutToggle(
            name,
            entry.label,
            'menu',
            open,
            () => toggleMenu(name),
            entry.glyph,
            undefined,
            undefined,
            entry.badge,
            edgeClass,
        )}
        <ul
            id="tri-flyout-{name}"
            data-flyout-panel
            role="menu"
            tabindex="-1"
            aria-label={entry.label}
            class="tri-menu tri-menu-surface menu-flyout {flyoutPlacement}"
            class:wide={entry.wide}
            class:open
            style="position-anchor: --anchor-{name};"
            onkeydown={onFlyoutMenuKeydown}
        >
            {#each entry.rows as row (row.key)}
                <!-- The glyph name goes through a local binding because
                     `check-icon-coverage` only resolves a dynamic
                     `<Icon name={…}>` from a bare identifier; given a member
                     expression it fails the build rather than guess which
                     glyphs this file renders. -->
                {@const glyph = row.icon}
                <li role="none">
                    <button
                        class="tri-menu-item"
                        class:text-start={row.textStart}
                        role={row.role ?? 'menuitemradio'}
                        lang={row.lang}
                        aria-checked={row.checked}
                        class:is-active={row.checked}
                        onclick={row.onclick}
                    >
                        {#if glyph}
                            <Icon name={glyph} size={16} />
                        {/if}
                        <span>{row.label}</span>
                        {#if row.checked}
                            <Icon name="Check" size={16} />
                        {/if}
                    </button>
                </li>
            {/each}
        </ul>
    </li>
{/snippet}

<div
    bind:this={toolbarRootEl}
    class="toolbar-root"
    class:top-right={position === 'top-right'}
    class:top-left={position === 'top-left'}
    class:side={!isTop}
    class:left={position === 'left'}
    class:right={position === 'right'}
    class:docked
    class:inline
>
    <!-- Collapsible Toolbar -->
    <!-- The placement/animation state classes are for the floating and docked
         variants only: in `inline` mode the configured toolbar side is
         meaningless (the buttons live in the nav bar) and e.g. `closed-left`'s
         translateX(-100%) would fling the group sideways on close. -->
    <div
        bind:this={shellEl}
        class="toolbar-shell"
        class:top-right={!inline && position === 'top-right'}
        class:top-left={!inline && position === 'top-left'}
        class:side={!inline && !isTop}
        class:docked
        class:inline
        class:open-top={!inline && isOpen && isTop}
        class:open-side={!inline && isOpen && !isTop}
        class:closed-top={!inline && !isOpen && isTop}
        class:closed-left={!inline && !isOpen && position === 'left'}
        class:closed-right={!inline && !isOpen && position === 'right'}
        class:inline-closed={inline && !isOpen}
        class:settled={inline && settled}
    >
        <!-- Scrollable Actions -->
        <ul
            bind:this={actionsEl}
            class="tri-menu actions"
            class:horizontal={isTop || inline}
            class:top-right={!inline && position === 'top-right'}
            class:top-left={!inline && position === 'top-left'}
            class:left={!inline && position === 'left'}
            class:right={!inline && position === 'right'}
            class:docked
            class:inline
            class:collapsed={inline && !settled && !(animating && !isOpen)}
        >
            <!-- --- Close Button (hidden in inline mode; the buttons live in the
                 nav bar without a collapse affordance) --- -->
            {#if viewerState.showToggle && !inline}
                <li>
                    <button
                        class="tri-menu-item tooltip {tooltipPlacement}"
                        data-tip={m.close_menu()}
                        onclick={toggleOpen}
                        aria-label={m.close_menu()}
                    >
                        <Icon name="X" size={24} />
                    </button>
                </li>
            {/if}

            <!-- --- Standard Actions ---
                 One shared button per `toolbarEntries` row, or one shared menu
                 for a row naming a flyout: a further flyout is a row in the
                 descriptor and nothing here. -->
            {#each visibleEntries as entry, i (entry.key)}
                {@const edgeClass = i === 0 ? leadTooltipEdge : ''}
                {#if !entry.flyout}
                    <!-- The glyph name goes through a local binding because
                         `check-icon-coverage` only resolves a dynamic
                         `<Icon name={…}>` from a bare identifier; given a member
                         expression it fails the build rather than guess which
                         glyphs this file renders. -->
                    {@const glyph = entry.icon}
                    <li>
                        <button
                            class="tri-menu-item tooltip {tooltipPlacement} {edgeClass}"
                            class:indicator={entry.indicator}
                            class:is-active={entry.pressed}
                            data-tip={entry.tip}
                            aria-label={entry.label}
                            aria-pressed={entry.pressed}
                            data-panel-toggle={entry.panel}
                            onclick={entry.onclick}
                        >
                            <Icon name={glyph} size={24} />
                        </button>
                    </li>
                {:else}
                    {@render flyoutMenu(entry, edgeClass)}
                {/if}
            {/each}

            <!-- Separator if both groups exist. An <li role="separator"> (not a
                 bare <div>) so the actions <ul> only ever directly contains <li>
                 — a bare <div> child trips the axe "list" rule once a plugin adds
                 a toolbar button (epic restore-plugin-toolbar-chrome). -->
            {#if hasBuiltInActions && sortedPluginButtons.length > 0}
                <li
                    class="divider"
                    class:horizontal={isTop || inline}
                    role="separator"
                    aria-hidden="true"
                ></li>
            {/if}

            <!-- --- Plugin Actions --- -->
            {#each sortedPluginButtons as button, i (button.id)}
                {@const edgeClass =
                    visibleEntries.length === 0 && i === 0
                        ? leadTooltipEdge
                        : ''}
                <!-- Plugins that declared a `title` carry a live label thunk
                     already resolved against their OWN catalog; the rest
                     fall through to the core-catalog lookup of `tooltip`. -->
                {@const tooltipText =
                    button.label?.() ?? resolveChromeName(m, button.tooltip)}
                <!-- Every plugin registers both a panel and a flyout entry;
                     render the anchored flyout only when the plugin's
                     effective target is 'flyout', otherwise a plain toggle
                     (the panel renders in the viewer chrome). -->
                {@const flyout =
                    button.pluginId &&
                    viewerState.getPluginTarget(button.pluginId) === 'flyout'
                        ? findFlyout(button.flyoutDomId)
                        : undefined}
                {#if flyout}
                    {@const open = button.isActive?.() ?? false}
                    <!-- Light-dismissed on the same terms as a built-in menu
                         (see `flyoutMenu`), except that a flyout declaring
                         `dismiss: 'explicit'` closes only through its own
                         affordance and so never arms it. -->
                    <li
                        use:dismissible={{
                            onDismiss: closeAllOverlays,
                            escape: false,
                            focusOnMount: false,
                            outsidePointer:
                                open && flyout.dismiss !== 'explicit',
                        }}
                    >
                        {@render flyoutToggle(
                            flyout.domId,
                            tooltipText,
                            'dialog',
                            open,
                            () => button.onClick(),
                            undefined,
                            button.iconDescriptor,
                            button.pluginId,
                            undefined,
                            edgeClass,
                        )}
                        <!-- A normal (non-top-layer) anchored element so
                             tooltips always paint above it. The plugin's
                             content-only container mounts on open and
                             unmounts on close. -->
                        <div
                            id="tri-flyout-{flyout.domId}"
                            class="menu-flyout {flyoutPlacement}"
                            class:open
                            data-flyout-panel
                            role="dialog"
                            aria-label={tooltipText}
                            style="position-anchor:--anchor-{flyout.domId}"
                        >
                            {#if flyout.mount && open}
                                <PluginMountHost mount={flyout.mount} />
                            {/if}
                        </div>
                    </li>
                {:else}
                    <!-- `data-panel-toggle` carries the id of the panel this
                         toggle opens, so the panel can find its way back to it
                         after a toolbar rebuild. Only a button that actually
                         toggles a panel gets it, or a pressed state: a plain
                         action button is not a toggle and announcing one as
                         unpressed is a lie. -->
                    {@const panelId = toggledPanelId(button.pluginId)}
                    <li>
                        <button
                            class="tri-menu-item tooltip {tooltipPlacement} {edgeClass}"
                            class:is-active={button.isActive?.()}
                            data-tip={tooltipText}
                            aria-label={tooltipText}
                            aria-pressed={panelId
                                ? (button.isActive?.() ?? false)
                                : undefined}
                            data-plugin-toggle={button.pluginId}
                            data-panel-toggle={panelId}
                            onclick={() => button.onClick()}
                        >
                            {#if button.iconDescriptor}
                                <PluginIcon
                                    descriptor={button.iconDescriptor}
                                    size={24}
                                />
                            {/if}
                        </button>
                    </li>
                {/if}
            {/each}
        </ul>
    </div>

    <!-- Unified Bar collapse toggle: a persistent button living in the nav bar,
         placed after (inline-end of) the collapsible group so the actions
         expand out to its left. Only in `inline` mode; the floating/side/docked
         layouts use the handle or the in-menu close button instead. -->
    {#if inline && viewerState.showToggle}
        <button
            class="tri-menu-item inline-toggle tooltip {tooltipPlacement}"
            data-tip={isOpen ? m.close_menu() : m.open_menu()}
            aria-label={isOpen ? m.close_menu() : m.open_menu()}
            aria-expanded={isOpen}
            onclick={toggleOpen}
        >
            {#if isOpen}
                <Icon name="X" size={24} />
            {:else}
                <Icon name="List" size={24} />
            {/if}
        </button>
    {/if}

    <!-- Toggle Handle (floating open button shown only when closed; never in the
         docked rail or inline modes). -->
    {#if viewerState.showToggle && !docked && !inline}
        <Button
            square
            size="sm"
            class={handleClass}
            style="--size: var(--ui-hit, 2rem);"
            aria-label={m.open_menu()}
            data-tip={m.open_menu()}
            onclick={toggleOpen}
        >
            <Icon name="List" size={20} />
        </Button>
    {/if}
</div>

<style>
    /* ===== Outer root ===== */
    .toolbar-root {
        position: absolute;
        z-index: 50;
        pointer-events: none;
        display: flex;
        top: 0;
    }
    .toolbar-root.top-right {
        width: 100%;
        align-items: flex-end;
        flex-direction: column;
        padding-top: 0;
        padding-right: var(--ui-inset);
    }
    .toolbar-root.top-left {
        width: 100%;
        align-items: flex-start;
        flex-direction: column;
        padding-top: 0;
        padding-left: var(--ui-inset);
    }
    .toolbar-root.side {
        height: 100%;
        align-items: flex-start;
    }
    .toolbar-root.left {
        left: var(--ui-inset);
    }
    .toolbar-root.right {
        right: var(--ui-inset);
    }
    /* Floating card sits `--ui-inset` from the top edge (flush when inset is 0). */
    .toolbar-shell {
        margin-top: var(--ui-inset);
    }

    /* ===== Docked rail (same-side fix) =====
       When the toolbar shares a side with a panel/gallery it is rendered in-flow
       as the outermost (screen-edge) column of the side bar rather than floating
       over the image. Its collapse handle is gone (it collapses via the in-menu
       close button), so its only close affordance sits a full panel-width away
       from the panel's own close button. */
    .toolbar-root.docked {
        position: relative;
        inset: auto;
        z-index: auto;
        height: 100%;
        align-items: stretch;
        pointer-events: auto;
        padding: 0;
    }
    .toolbar-shell.docked {
        margin: 0;
        height: 100%;
        flex-direction: column;
        opacity: 1;
        transform: none;
    }
    .actions.docked {
        height: 100%;
        flex-wrap: nowrap;
        overflow-y: auto;
        overflow-x: hidden;
        border-radius: 0;
        box-shadow: none;
        backdrop-filter: none;
        /* Solid edge furniture rather than translucent floating glass. */
        background-color: var(--tri-toolbar-bg);
        align-items: stretch;
        justify-content: flex-start;
    }
    /* Square on every corner: the rail spans the column's full height flush
       against the viewer frame, so its outer corners are frame edges, and its
       inner edge butts the panel it reads as one piece with. The explicit zero
       is needed to outrank the floating `.actions.left` / `.actions.right`
       rules further down, which round the canvas-side corner. */
    .actions.docked.left {
        border-radius: 0;
        border-right: var(--tri-border) solid var(--tri-surface-border);
        padding-right: 0;
    }
    .actions.docked.right {
        border-radius: 0;
        border-left: var(--tri-border) solid var(--tri-surface-border);
        padding-left: 0;
    }

    /* ===== Unified Bar: toolbar buttons embedded in the canvas nav =====
       In `inline` mode the toolbar renders its action list as a transparent
       horizontal group next to a persistent toggle. `display: contents` on the
       root collapses that wrapper so the toggle + shell participate directly in
       the control-bar flex row. */
    .toolbar-root.inline {
        display: contents;
    }
    /* The shell holds the action group and reveals/collapses it by animating a
       max-width CLIP (driven imperatively from the open/close effect). The group
       is aligned to the inline-end (toggle side) via `justify-items: end`, so the
       clip eats from the far edge — the icons emerge to the LEFT of the toggle.
       `grid-template-columns` is static (no reflow); the JS freezes the group's
       width during the animation so the wrapped layout is preserved exactly. */
    .toolbar-shell.inline {
        display: grid;
        grid-template-columns: 1fr;
        justify-items: end;
        align-items: center;
        /* Clipped while closed/animating so the frozen block is revealed rather
           than spilling; opened up to `visible` once settled (below) so plugin
           flyouts can escape. */
        overflow: hidden;
        /* Gap sits on the toggle side (inline-end); it collapses with the group
           so the toggle butts against the nav divider when closed. */
        margin-inline-end: var(--ui-gap);
        transition-property: max-width, opacity, margin-inline-end;
        transition-duration: 0.2s;
        transition-timing-function: var(--ui-ease);
    }
    /* Resting closed state (JS clears its inline max-width so this applies). */
    .toolbar-shell.inline-closed {
        max-width: 0;
        opacity: 0;
        margin-inline-end: 0;
        pointer-events: none;
    }
    /* Settled = open and the transition has finished: release the clip and let
       flyouts escape the bar. (Wrapping is re-enabled in parallel on the list.) */
    .toolbar-shell.inline.settled {
        overflow: visible;
        max-width: none;
    }
    /* The persistent toggle matches the action buttons' icon-button look.
       `.toolbar-root` sets `pointer-events: none` (so the floating overlay never
       blocks the canvas); as a direct child of the root, the toggle must opt
       back in — the shell does the same for the action buttons. */
    .inline-toggle {
        flex-shrink: 0;
        pointer-events: auto;
    }
    .actions.inline {
        flex-direction: row;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* min-width:0 lets the closed 0fr grid track resolve to zero width
           (overriding the grid item's automatic min-content minimum) so the
           group truly collapses. */
        min-width: 0;
        /* Allowed to wrap; balanceInlineRows() caps the width so the wrap
           splits evenly instead of flexbox's greedy first-row fill. row-gap
           matches the column gap so stacked icon rows sit evenly. */
        flex-wrap: wrap;
        gap: var(--ui-gap);
        padding: 0;
        background: none;
        box-shadow: none;
        backdrop-filter: none;
        border-radius: 0;
    }
    /* While collapsed, force a single row: the shrinking track would otherwise
       reflow the icons into a tall vertical column (ballooning the bar). Open,
       the row wraps normally so the balancer can split it across rows. */
    .actions.inline.collapsed {
        flex-wrap: nowrap;
    }

    /* ===== Collapsible shell ===== */
    .toolbar-shell {
        pointer-events: auto;
        transition-property: all;
        transition-duration: 0.2s;
        transition-timing-function: var(--ui-ease);
        display: flex;
    }
    .toolbar-shell.top-right {
        flex-direction: row-reverse;
        height: 3rem;
        width: auto;
        max-width: 100%;
        transform-origin: top;
    }
    .toolbar-shell.top-left {
        flex-direction: row;
        height: 3rem;
        width: auto;
        max-width: 100%;
        transform-origin: top;
    }
    .toolbar-shell.side {
        flex-direction: column;
        height: auto;
        max-height: 100%;
    }
    /* Animation states */
    .toolbar-shell.open-top {
        opacity: 1;
        transform: translateY(0);
    }
    .toolbar-shell.open-side {
        opacity: 1;
        transform: translateX(0);
    }
    .toolbar-shell.closed-top {
        height: 0;
        opacity: 0;
        transform: translateY(-100%);
    }
    .toolbar-shell.closed-left {
        opacity: 0;
        transform: translateX(-100%);
        pointer-events: none;
    }
    .toolbar-shell.closed-right {
        opacity: 0;
        transform: translateX(100%);
        pointer-events: none;
    }

    /* Every action button pads its icon, in every mode, so the fill behind a
       pressed one reads as a target rather than a shrink-wrapped glyph.
       Anchored flyouts are excluded: their inner padding belongs to the panel
       itself (`.tri-menu`) so it lands inside the glass, and the gap between panel
       and button is the placement margin below. */
    .actions :where(li) > :global(:not(.menu-flyout)) {
        padding: 0.25rem;
    }
    .text-start {
        text-align: start;
    }

    /* ===== Actions list look ===== */
    .actions {
        position: relative;
        color: var(--tri-toolbar-content);
        box-shadow: var(--ui-chrome-shadow, var(--ui-shadow-lg));
        justify-content: center;
        align-items: center;
    }
    /* The glass lives on a ::before layer (a sibling of the buttons/popovers,
       not an ancestor) so `.actions` itself does NOT establish a backdrop-filter
       isolation root. That lets the anchored popovers inside it run their own
       backdrop-filter against the image behind them. The pseudo paints behind
       the positioned <li> children by tree order. Excludes docked (solid rail)
       and inline (glass comes from the nav control-bar). */
    .actions:not(.docked):not(.inline)::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background-color: var(--ui-glass-bg);
        backdrop-filter: blur(8px);
    }
    .actions.horizontal {
        flex-direction: row;
        display: inline-flex;
    }
    .actions.horizontal :where(li) {
        padding-bottom: 0;
    }
    .actions.top-right {
        flex-direction: row-reverse;
        border-bottom-left-radius: var(--tri-radius-toolbar);
        /* Zero the canvas-side (bottom) padding — mirroring the side rails'
           inboard-padding zeroing — so the flyout's placement margin reads as a
           real gap instead of merely cancelling this chrome padding. */
        padding-bottom: 0;
    }
    .actions.top-right > :global(* + *) {
        margin-left: 1px;
    }
    .actions.top-left {
        flex-direction: row;
        border-bottom-right-radius: var(--tri-radius-toolbar);
        /* See .actions.top-right: zero the canvas-side padding so the flyout gap
           shows. */
        padding-bottom: 0;
    }
    .actions.top-left > :global(* + *) {
        margin-left: 1px;
    }
    .actions.left {
        border-bottom-right-radius: var(--tri-radius-toolbar);
        padding-right: 0.25rem;
    }
    .actions.left > :global(* + *) {
        margin-top: 1px;
    }
    .actions.right {
        border-bottom-left-radius: var(--tri-radius-toolbar);
        padding-left: 0.25rem;
    }
    .actions.right > :global(* + *) {
        margin-top: 1px;
    }

    /* ===== Indicator scaffolding ===== */
    .indicator {
        position: relative;
        display: inline-flex;
        width: max-content;
    }
    .indicator-item {
        position: absolute;
        top: 0;
        right: 0;
        translate: 50% -50%;
        z-index: 1;
        white-space: nowrap;
    }
    .count-badge {
        --size: calc(var(--tri-size-selector, 0.25rem) * 5);
        border-radius: var(--tri-radius-selector);
        vertical-align: middle;
        color: var(--tri-color-primary-content);
        border: var(--tri-border) solid var(--tri-color-primary);
        background-color: var(--tri-color-primary);
        height: var(--size);
        min-width: 1.25rem;
        padding-inline: 0.25rem;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        display: inline-flex;
    }

    /* ===== Anchored flyout / menu overlay (shared) =====
       Used by plugin flyouts AND the built-in dropdowns. Deliberately NOT a
       top-layer popover: a low z-index keeps the toolbar tooltips (z-index: 2)
       painting above it. Placement is deterministic via CSS anchor positioning
       and centered on the button along the perpendicular axis. When open, the
       element's own display applies (`.tri-menu` → flex; a plain flyout → block). */
    .menu-flyout {
        position: absolute;
        inset: auto;
        margin: 0;
        color: var(--tri-toolbar-content);
        z-index: 1;
        opacity: 0;
        scale: 95%;
    }
    /* In the docked rail the actions list is a scroll container (overflow-y:auto
       forces overflow-x to clip too), which would cut off these anchored flyouts
       as they extend toward the canvas. Promote them to `fixed` so CSS anchor
       positioning still glues them to the button while they escape the rail's
       overflow. No transformed ancestor, so `fixed` is viewport-relative and
       unclipped; the rail host's z-index keeps them above a same-side panel. */
    .actions.docked .menu-flyout {
        position: fixed;
    }
    .menu-flyout:not(.open) {
        display: none;
    }
    .menu-flyout.open {
        opacity: 1;
        scale: 100%;
    }
    @media (prefers-reduced-motion: no-preference) {
        .menu-flyout {
            transition-behavior: allow-discrete;
            transition-property: opacity, scale, display;
            transition-duration: 0.2s;
            transition-timing-function: var(--ui-ease);
        }
    }
    /* Keep neighboring toolbar and flyout targets' 24px WCAG safe regions apart. */
    .menu-flyout.up {
        bottom: anchor(top);
        left: anchor(center);
        transform: translateX(-50%);
        margin-bottom: 1.5rem;
        transform-origin: bottom center;
    }
    .menu-flyout.down {
        top: anchor(bottom);
        left: anchor(center);
        transform: translateX(-50%);
        margin-top: 1.5rem;
        transform-origin: top center;
    }
    .menu-flyout.left {
        right: anchor(left);
        top: anchor(center);
        transform: translateY(-50%);
        margin-right: 1.5rem;
        transform-origin: center right;
    }
    .menu-flyout.right {
        left: anchor(right);
        top: anchor(center);
        transform: translateY(-50%);
        margin-left: 1.5rem;
        transform-origin: center left;
    }

    /* ===== Divider ===== A solid bar, oriented across the list's cross-axis —
       matching the nav bar's `.divider-v` treatment (ViewerControls.svelte)
       used to separate zoom/nav controls, so both read consistently. */
    .divider {
        /* Non-positioned elements paint BEHIND the .actions::before glass layer
           (which is position:absolute), the same reason .tri-menu li carries
           position:relative — without this the divider is fully hidden under
           the frosted background. */
        position: relative;
        flex-shrink: 0;
        align-self: center;
        width: 100%;
        height: 1px;
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-content) 20%,
            transparent
        );
    }
    .divider.horizontal {
        width: 1px;
        height: 1rem;
    }

    /* ===== Toggle handle =====
       A `Button square size="sm"` wearing the floating chrome's frosted glass.
       The overrides are the button's own custom properties wherever one exists,
       so hover, active and focus keep the button's behaviour over the glass
       fill. The hit-target floor rides on the element's own `style`, because
       `size` writes `--size` inline and nothing in a stylesheet can outrank
       that. `position` must beat the `position: relative` the shared tooltip
       layer sets; the tooltip pseudo-elements work from any positioned
       element. */
    .toolbar-root :global(.handle) {
        position: absolute;
        pointer-events: auto;
        z-index: 40;
        backdrop-filter: blur(8px);
        --btn-color: var(--ui-glass-bg);
        --btn-fg: var(--tri-toolbar-content);
        --btn-border: var(--tri-surface-border);
        --btn-shadow: var(--ui-chrome-shadow, var(--ui-shadow-md));
        /* `--btn-color` is also the button's outline colour, and the glass fill
           makes an invisible focus ring. */
        outline-color: var(--tri-content);
        transition-property:
            color, background-color, border-color, box-shadow, opacity;
        transition-duration: 0.3s;
        opacity: 1;
    }
    .toolbar-root :global(.handle.invisible) {
        opacity: 0;
        pointer-events: none;
    }
    /* The open button reads as a flush tab on the viewer edge it is anchored
       to: pin flush to that edge and drop the border touching it (so it doesn't
       double up with the viewer's own border). A single corner is rounded —
       always a bottom corner, on the side facing the canvas: bottom-right when
       anchored left, bottom-left when anchored right. Top and Sides share this
       treatment. */
    .toolbar-root :global(.handle.start) {
        left: var(--ui-inset, 0.375rem);
        --join-ss: 0;
        --join-se: 0;
        --join-es: 0;
    }
    .toolbar-root :global(.handle.end) {
        right: var(--ui-inset, 0.375rem);
        --join-ss: 0;
        --join-se: 0;
        --join-ee: 0;
    }
    .toolbar-root :global(.handle.top) {
        top: 0;
        border-top-width: 0;
    }
    .toolbar-root :global(.handle.start:not(.top)) {
        left: 0;
        border-left-width: 0;
    }
    .toolbar-root :global(.handle.end:not(.top)) {
        right: 0;
        border-right-width: 0;
    }
    .toolbar-root :global(.handle svg) {
        width: var(--ui-icon, 20px);
        height: var(--ui-icon, 20px);
    }

    /* ===== Tooltip edge corrections =====
       The bubble, tail, reveal and placements come from `src/styles/tooltip.css`;
       only the corrections below are specific to where this toolbar puts its
       buttons. */

    /* The outermost button of a top-anchored toolbar sits in the viewer corner,
       so its centered bottom-tooltip bubble would overflow the viewer border.
       Anchor just that bubble to the button's outer edge (the tail keeps
       pointing at the button center). */
    .actions.top-left > li:first-child .tooltip.place-bottom::before {
        transform: translateX(0) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) auto auto 0;
    }
    .actions.top-right > li:first-child .tooltip.place-bottom::before {
        transform: translateX(0) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) 0 auto auto;
    }
    /* The Unified Bar's leading button takes the same correction from the
       shared sheet's `tt-edge-start` modifier (see `leadTooltipEdge`). */
</style>
