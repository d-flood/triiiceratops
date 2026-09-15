<script lang="ts">
    import Icon from './Icon.svelte';
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages } from '../state/i18n.svelte';
    import {
        hasDescriptiveDetail,
        normalizeDescriptiveMetadata,
    } from '../utils/metadataNormalization';
    import SanitizedHtml from './SanitizedHtml.svelte';
    import { Button } from './ui';
    import { dismissible } from '../utils/dismissible';

    let {
        tooltipPlacement = 'place-top',
        tooltipEdgeClass = '',
    }: { tooltipPlacement?: string; tooltipEdgeClass?: string } = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    const m = getMessages();
    let viewerLocale = $derived(viewerState.activeLocale);

    let canvas = $derived.by(() => {
        const idx = viewerState.currentCanvasIndex;
        return viewerState.canvases[idx] ?? null;
    });

    // Raw IIIF Canvas JSON, v2 or v3 as authored. The version mapping is the
    // same one the metadata panel reads a manifest through.
    let described = $derived(
        normalizeDescriptiveMetadata(canvas, viewerLocale),
    );

    let label = $derived(described.title);
    let summary = $derived(described.summary);
    let metadata = $derived(described.metadata);
    let rendering = $derived(described.rendering);

    let hasAdditionalContent = $derived(hasDescriptiveDetail(described));

    let showButton = $derived(
        viewerState.config.information?.showButton !== false,
    );

    // Focus and dismissal (WCAG 2.1.2 / 2.4.3) come from the shared `dismissible`
    // action: remember the trigger, move focus in, Escape and outside-pointer
    // close, focus returns. It replaces the backdrop `<button>` this used to
    // need, which was a focusable element in the tab order that announced
    // nothing useful.
    let invoker = $state<HTMLElement | null>(null);

    function openInfo(e: MouseEvent) {
        invoker = e.currentTarget as HTMLElement;
        viewerState.toggleCanvasInfo();
    }

    // Filled by the `dismissible` action; the close button goes through it so it
    // returns focus by the same rule Escape does.
    const dismissal: { dismiss?: () => void } = {};

    function closeInfo() {
        if (viewerState.showCanvasInfo) viewerState.toggleCanvasInfo();
    }

    /** Breathing room between the popover and the viewer's own edge. */
    const VIEWER_GUTTER_PX = 8;

    let popover = $state<HTMLElement | null>(null);

    /*
     * Keep the popover inside the viewer.
     *
     * It hangs off the trigger button, so the trigger is its containing block
     * and CSS has no way to express "centred on the button, but never past the
     * viewer's edge" — the box it must stay inside is three ancestors up, and a
     * percentage here resolves against a 24px button. So the cap and the nudge
     * are measured: the popover gets at most the viewer's width, and slides
     * back inside by however far centring would have pushed it out. A viewer
     * narrower than the popover's minimum gets a popover the width of the
     * viewer, which is the point at which sideways scrolling is the honest
     * answer.
     */
    $effect(() => {
        if (!viewerState.showCanvasInfo) return;

        const el = popover;
        const trigger = invoker;
        const root = el?.closest('.viewer-root');
        if (!el || !trigger || !root) return;

        const place = () => {
            const bounds = root.getBoundingClientRect();
            const available = Math.max(0, bounds.width - VIEWER_GUTTER_PX * 2);
            el.style.maxWidth = `${available}px`;

            // Reading the width applies the cap just set, so the nudge below is
            // computed against the width the popover will actually have.
            const width = el.offsetWidth;
            const anchor = trigger.getBoundingClientRect();
            const centred = anchor.left + anchor.width / 2 - width / 2;
            const min = bounds.left + VIEWER_GUTTER_PX;
            const max = Math.max(min, bounds.right - VIEWER_GUTTER_PX - width);
            const clamped = Math.min(Math.max(centred, min), max);

            el.style.setProperty('--info-shift', `${clamped - centred}px`);
        };

        place();

        const observer = new ResizeObserver(place);
        observer.observe(root);
        return () => observer.disconnect();
    });
</script>

{#if hasAdditionalContent && showButton}
    <div class="wrapper">
        <Button
            circle
            size="xs"
            ghost
            class="trigger tooltip {tooltipPlacement} {tooltipEdgeClass}"
            data-tip={m.canvas_info_tooltip()}
            onclick={openInfo}
            aria-label={m.canvas_info_tooltip()}
        >
            <Icon name="Info" size={14} weight="bold" />
        </Button>

        {#if viewerState.showCanvasInfo}
            <!-- Popover -->
            <div
                bind:this={popover}
                use:dismissible={{
                    onDismiss: closeInfo,
                    controls: dismissal,
                    invoker,
                    within: [invoker],
                }}
                class="popover"
                role="dialog"
                aria-label={m.canvas_info()}
                tabindex="-1"
            >
                <div class="scroll">
                    <div class="head">
                        <h4 class="title">{m.canvas_info()}</h4>
                        <Button
                            size="xs"
                            circle
                            ghost
                            class="close"
                            onclick={() => dismissal.dismiss?.()}
                            aria-label={m.close()}
                        >
                            <Icon name="X" size={14} />
                        </Button>
                    </div>

                    {#if label}
                        <p class="canvas-label">{label}</p>
                    {/if}

                    {#if summary}
                        <SanitizedHtml
                            tag="div"
                            html={summary}
                            class="viewer-html summary"
                        />
                    {/if}

                    {#if metadata.length > 0}
                        <dl class="metadata">
                            {#each metadata as item, i (i)}
                                <dt class="meta-label">
                                    {item.label}
                                </dt>
                                <SanitizedHtml
                                    tag="dd"
                                    html={item.value}
                                    class="viewer-html meta-value"
                                />
                            {/each}
                        </dl>
                    {/if}

                    {#if rendering.length > 0}
                        <div class="rendering">
                            <span class="rendering-title">{m.rendering()}</span>
                            {#each rendering as item (item.id)}
                                <a
                                    href={item.id}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="rendering-link">{item.label}</a
                                >
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .wrapper {
        position: relative;
        display: inline-flex;
    }

    /* Trigger button: ghost circle with primary-colored icon (text-primary). */
    .wrapper :global(.trigger) {
        color: var(--tri-color-primary-text);
    }

    .popover {
        position: absolute;
        bottom: 100%;
        /* Centred on the trigger, then nudged by `--info-shift` so the box
           stays inside the viewer. The shift is measured — see the effect. */
        left: 50%;
        transform: translateX(calc(-50% + var(--info-shift, 0px)));
        z-index: 1001;
        margin-bottom: 0.5rem;
        background-color: var(--tri-panel-bg);
        border-width: 1px;
        border-style: solid;
        border-color: var(--tri-surface-border);
        border-radius: var(--tri-radius-panels);
        box-shadow: var(--ui-shadow-xl);
        width: 18rem;
        max-height: 16rem;
        overflow: hidden;
    }

    .scroll {
        overflow-y: auto;
        max-height: 16rem;
        padding: 1rem;
    }

    .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .title {
        font-weight: 700;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }

    .canvas-label {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
        /* A language map may hold several strings for one property, all of
           which must be shown; plain-text properties join them with newlines. */
        white-space: pre-line;
        overflow-wrap: break-word;
    }

    .scroll :global(.summary) {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.8;
        margin-bottom: 0.5rem;
    }

    .metadata {
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .meta-label {
        font-weight: 700;
        opacity: 0.7;
        margin-top: 0.5rem;
        white-space: pre-line;
        overflow-wrap: break-word;
    }

    .metadata :global(.meta-value) {
        padding-inline-start: 0.5rem;
    }

    .rendering {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top-width: 1px;
        border-top-style: solid;
        border-top-color: var(--tri-surface-border);
    }

    .rendering-title {
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 700;
        opacity: 0.7;
    }

    .rendering-link {
        color: var(--tri-color-primary-text);
        text-decoration-line: underline;
        cursor: pointer;
        font-size: 0.75rem;
        line-height: 1rem;
        display: block;
        margin-top: 0.25rem;
        word-break: break-all;
    }
</style>
