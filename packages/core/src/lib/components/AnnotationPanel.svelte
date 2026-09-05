<script lang="ts">
    import Icon from './Icon.svelte';
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages } from '../state/i18n.svelte';
    import SanitizedHtml from './SanitizedHtml.svelte';
    import { extractBody } from '../utils/annotationAdapter';
    import { collectCanvasAnnotations } from '../utils/canvasAnnotations';
    import { getAnnotationId } from '../utils/iiifIds';
    import { isSafeUrl } from '../utils/sanitizeHtml';
    import { Button, Badge } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let { embedded = false }: { embedded?: boolean } = $props();
    const m = getMessages();

    let position = $derived(
        viewerState.config.annotations?.position ?? 'right',
    );
    /**
     * Every annotation on every canvas the reader is looking at, in layout order:
     * one canvas in `individuals`, the whole spread in `paged`, the folios the
     * viewport meets in `continuous`.
     *
     * The same collection the shape overlay draws from, through the same helper —
     * so a row exists for every shape on screen and vice versa. Without that a
     * facing page's annotations were shapeless AND rowless, and a connector, which
     * is a line from a row to a shape, had nothing to join.
     */
    let annotations = $derived(
        collectCanvasAnnotations({
            manifestId: viewerState.manifestId,
            canvasIds: viewerState.annotatableCanvasIds,
            getAnnotations: (manifestId, canvasId) =>
                viewerState.getAnnotations(manifestId, canvasId),
            searchAnnotations: viewerState.searchAnnotations,
        }).flatMap((entry) => entry.annotations),
    );

    let renderedAnnotations = $derived.by(() => {
        if (!annotations.length) return [];

        return annotations.map((anno: any) => {
            const bodies = extractBody(anno);

            return {
                id: getAnnotationId(anno),
                bodies,
                isSearchHit: Boolean(anno.isSearchHit),
                label: anno.label || '',
            };
        });
    });

    let toggleableAnnotations = $derived(
        renderedAnnotations.filter((anno) => !anno.isSearchHit),
    );

    let isAllVisible = $derived.by(() => {
        if (toggleableAnnotations.length === 0) return false;
        return toggleableAnnotations.every((anno) => {
            return !anno.id || viewerState.visibleAnnotationIds.has(anno.id);
        });
    });

    function toggleAnnotation(anno: { id: string; isSearchHit: boolean }) {
        if (anno.isSearchHit || !anno.id) {
            return;
        }

        viewerState.setAnnotationVisible(
            anno.id,
            !viewerState.visibleAnnotationIds.has(anno.id),
        );
    }

    /**
     * Whether the row itself was activated, or something inside it that has its
     * own job — the visibility eye, a link in a body, a plugin's control. Those
     * keep their own behaviour and must not also select the row.
     */
    function shouldIgnoreRowActivation(target: EventTarget | null): boolean {
        if (!(target instanceof Element)) {
            return false;
        }

        return Boolean(
            target.closest(
                'a, button, input, select, textarea, summary, [role="button"]:not([data-annotation-row]), [data-annotation-interactive="true"]',
            ),
        );
    }

    /**
     * Selecting from the panel — the counterpart to tapping the shape on the
     * image, and the same state, so a connector drawn from either stays until the
     * reader picks something else or clears it.
     *
     * The row's click means SELECT, not show/hide. Visibility has its own
     * control in every row (the eye button) and its own bulk control in the
     * toolbar; before this the row was a second, unlabelled visibility toggle,
     * so clicking the thing you wanted to look at was as likely to make it
     * disappear.
     */
    function activateAnnotation(anno: { id: string }) {
        if (!anno.id) return;
        viewerState.setActiveAnnotationId(anno.id);
    }

    /**
     * Bring the selected annotation's row into view.
     *
     * Selection happens on the IMAGE — a tap on a shape — and on a manifest with
     * more annotations than fit the panel the marked row is then usually
     * somewhere off-screen, which is a selection the reader cannot read. Scrolled
     * within the list only (`block: 'nearest'`), so it never scrolls the host
     * page around the viewer.
     *
     * Honours reduced motion: an unrequested smooth scroll is exactly the
     * motion that setting asks to be spared.
     */
    $effect(() => {
        const activeId = viewerState.activeAnnotationId;
        if (!activeId || !listEl) return;

        const row = listEl.querySelector(
            `[data-annotation-row="${CSS.escape(activeId)}"]`,
        );
        if (!(row instanceof HTMLElement)) return;

        const reducedMotion =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        row.scrollIntoView({
            block: 'nearest',
            behavior: reducedMotion ? 'auto' : 'smooth',
        });
    });

    let listEl: HTMLElement | undefined = $state();

    function toggleAllAnnotations() {
        viewerState.setAllAnnotationsVisible(!isAllVisible);
    }
</script>

<!-- Drawer / Panel -->
{#if viewerState.showAnnotations}
    <div
        data-panel-id="annotations"
        class="panel"
        class:floating={!embedded}
        class:transparent={!embedded &&
            viewerState.config.transparentBackground}
        class:border-left={!embedded &&
            !viewerState.config.transparentBackground &&
            position !== 'left'}
        class:border-right={!embedded &&
            !viewerState.config.transparentBackground &&
            position === 'left'}
        role="dialog"
        aria-label={m.settings_submenu_annotations()}
    >
        {#if !embedded}
            <div class="header">
                <div class="header-title">
                    <Icon name="ListDashes" size={20} weight="bold" />
                    <h2>
                        {m.settings_submenu_annotations()}
                    </h2>
                </div>
            </div>
        {/if}

        <!-- Toolbar / Stats -->
        <div class="toolbar">
            <div class="count">
                {m.annotations_count({ count: annotations.length })}
            </div>
            <Button
                size="sm"
                ghost
                class="toggle-all-btn"
                onclick={toggleAllAnnotations}
                disabled={toggleableAnnotations.length === 0}
            >
                {#if isAllVisible}
                    <Icon name="Eye" size={16} />
                    {m.hide_all_annotations()}
                {:else}
                    <Icon name="EyeSlash" size={16} />
                    {m.show_all_annotations()}
                {/if}
            </Button>
        </div>

        <!-- List -->
        <div bind:this={listEl} class="list" class:scrollable={!embedded}>
            {#each renderedAnnotations as anno, i (anno.id)}
                {@const isVisible =
                    anno.isSearchHit ||
                    viewerState.visibleAnnotationIds.has(anno.id)}
                {@const isActive = viewerState.activeAnnotationId === anno.id}
                <!-- List Item Row -->
                <div
                    class="row"
                    class:search-hit={anno.isSearchHit}
                    class:dimmed={!isVisible}
                    class:active={isActive}
                    role="button"
                    tabindex="0"
                    aria-current={isActive ? 'true' : undefined}
                    data-annotation-row={anno.id}
                    id="annotation-list-item-{anno.id}"
                    onmouseenter={() =>
                        viewerState.setHoveredAnnotationId(anno.id)}
                    onmouseleave={() =>
                        viewerState.setHoveredAnnotationId(null)}
                    onclick={(e) => {
                        if (shouldIgnoreRowActivation(e.target)) {
                            return;
                        }
                        e.preventDefault();
                        activateAnnotation(anno);
                    }}
                    onkeypress={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            activateAnnotation(anno);
                        }
                    }}
                >
                    <!-- Visual Toggle Indicator (eye icon button) -->
                    <Button
                        size="xs"
                        circle
                        ghost
                        class="eye-btn"
                        disabled={anno.isSearchHit}
                        onclick={(e) => {
                            e.stopPropagation();
                            toggleAnnotation(anno);
                        }}
                    >
                        {#if isVisible}
                            <Icon name="Eye" size={16} />
                        {:else}
                            <Icon name="EyeSlash" size={16} />
                        {/if}
                    </Button>

                    <div class="content">
                        <div class="content-head">
                            <span class="index">#{i + 1}</span>
                            <!-- Only show label separately if it's different from the content being displayed -->
                            {#if anno.label && !anno.bodies.some((b) => b.value === anno.label)}
                                <span class="label">{anno.label}</span>
                            {/if}
                        </div>
                        <div class="viewer-html bodies">
                            {#each anno.bodies as body, i (i)}
                                <div class="body-row">
                                    {#if body.purpose === 'tagging'}
                                        <Badge
                                            variant="primary"
                                            outline
                                            size="sm"
                                        >
                                            {body.value}
                                        </Badge>
                                    {:else if body.purpose === 'linking'}
                                        <!--
                                            The URL is the manifest's, so it gets
                                            the same scheme check an `<a>` rebuilt
                                            by the rich-text renderer gets: a
                                            `javascript:` body would otherwise be
                                            a live sink. A refused URL keeps its
                                            text but loses the anchor as well as
                                            the link: an `<a>` with no `href` is
                                            neither focusable nor activatable, so
                                            leaving one behind would offer a
                                            keyboard user a link that is not
                                            there.
                                        -->
                                        {#if isSafeUrl(body.value)}
                                            <a
                                                href={body.value}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="link"
                                                onclick={(e) =>
                                                    e.stopPropagation()}
                                            >
                                                <!-- Link Icon -->
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="12"
                                                    height="12"
                                                    fill="currentColor"
                                                    viewBox="0 0 256 256"
                                                    ><path
                                                        d="M136.37,187.53a12,12,0,0,1,0,17l-5.94,5.94a60,60,0,0,1-84.88-84.88l24.12-24.12A60,60,0,0,1,152.06,99,12,12,0,1,1,135,116a36,36,0,0,0-50.93,1.57L60,141.66a36,36,0,0,0,50.93,50.93l5.94-5.94A12,12,0,0,1,136.37,187.53Zm81.51-149.41a60,60,0,0,0-84.88,0l-5.94,5.94a12,12,0,0,0,17,17l5.94-5.94a36,36,0,0,1,50.93,50.93l-24.11,24.12A36,36,0,0,1,121,140a12,12,0,1,0-17.08,17,60,60,0,0,0,82.39,2.46l24.12-24.12A60,60,0,0,0,217.88,38.12Z"
                                                    ></path></svg
                                                >
                                                <span class="link-text"
                                                    >{body.value}</span
                                                >
                                            </a>
                                        {:else}
                                            <span class="link-text"
                                                >{body.value}</span
                                            >
                                        {/if}
                                    {:else if body.isHtml}
                                        <SanitizedHtml html={body.value} />
                                    {:else}
                                        {body.value || '(No content)'}
                                    {/if}
                                </div>
                            {/each}

                            {#if anno.bodies.length === 0}
                                <span class="no-content">{m.no_content()}</span>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="empty">
                    {m.no_annotations_available()}
                </div>
            {/each}
        </div>
    </div>
{/if}

<style>
    .panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .panel.floating {
        height: 100%;
        background-color: var(--panel-surface);
        box-shadow: 0 25px 50px -12px #00000040;
        z-index: 100;
        transition-property: width;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }

    .panel.border-left {
        border-left-width: 1px;
        border-left-style: solid;
        border-left-color: var(--tri-surface-border);
    }

    .panel.border-right {
        border-right-width: 1px;
        border-right-style: solid;
        border-right-color: var(--tri-surface-border);
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--tri-surface-border);
    }

    .header-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .header-title h2 {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
    }

    .toolbar {
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--tri-surface-border);
        background-color: color-mix(
            in oklab,
            var(--tri-input-bg) 50%,
            transparent
        );
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .count {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 500;
        opacity: 0.8;
    }

    /* btn-sm gap-2: override .btn's default gap (0.375rem) to gap-2 (0.5rem) */
    .toolbar :global(.toggle-all-btn) {
        gap: 0.5rem;
    }

    .list {
        padding: 0;
        display: flex;
        flex-direction: column;
    }

    /* divide-y divide-base-300 */
    .list > :global(* + *) {
        border-top-width: 1px;
        border-top-style: solid;
        border-top-color: var(--tri-surface-border);
    }

    .list.scrollable {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .row {
        width: 100%;
        text-align: left;
        padding: 1rem;
        transition-property:
            color, background-color, border-color, text-decoration-color, fill,
            stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        position: relative;
        cursor: pointer;
    }

    .row:focus {
        outline: none;
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 10%,
            transparent
        );
    }

    .row:hover {
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 5%,
            transparent
        );
    }

    /*
     * The SELECTED annotation's row.
     *
     * An accent bar on the panel's inner edge plus a tinted background, and
     * `aria-current` on the row itself so the selection is not colour-only. It
     * has to read as marked even while another row is hovered, which is why the
     * bar carries it rather than the background alone — a 10% tint and a 5% tint
     * are not reliably tellable apart, and the hover rule may win the cascade.
     *
     * `--tri-color-primary-text`, not the raw primary: on a panel surface only
     * the `-text` variant of the palette has a contrast guarantee, and this bar
     * is a non-text UI component (WCAG 1.4.11). Its pairing against the panel
     * background is one `pnpm test:contrast` already carries.
     */
    .row.active {
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 12%,
            transparent
        );
    }

    .row.active::before {
        content: '';
        position: absolute;
        inset-block: 0;
        inset-inline-start: 0;
        width: 3px;
        background-color: var(--tri-color-primary-text);
    }

    .row.dimmed {
        opacity: 0.6;
        background-color: color-mix(
            in oklab,
            var(--panel-surface) 50%,
            transparent
        );
    }

    /* btn-xs btn-circle btn-ghost mt-0.5 shrink-0 (shrink-0 already in .btn) */
    .row :global(.eye-btn) {
        margin-top: 0.125rem;
    }

    .content {
        flex: 1 1 0%;
        min-width: 0;
    }

    .content-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 0.25rem;
    }

    .index {
        font-weight: 700;
        font-size: 0.875rem;
        line-height: 1.25rem;
        color: var(--tri-color-primary-text);
    }

    .label {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 150px;
    }

    .bodies {
        font-size: 0.875rem;
        line-height: 1.25rem;
        overflow-wrap: break-word;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .body-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .link {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--tri-color-primary-text);
        padding: 0.25rem;
        border-radius: 0.25rem;
        margin-left: -0.25rem;
        transition-property:
            color, background-color, border-color, text-decoration-color, fill,
            stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }

    .link:hover {
        text-decoration-line: underline;
        /* text color stays --tri-color-primary on hover */
        background-color: var(--panel-surface);
    }

    .link-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 200px;
    }

    .no-content {
        opacity: 0.5;
        font-style: italic;
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .empty {
        padding: 2rem;
        text-align: center;
        opacity: 0.5;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }
</style>
