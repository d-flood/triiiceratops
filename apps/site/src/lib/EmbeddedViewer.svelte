<script lang="ts">
    import { onMount } from 'svelte';
    import ChromeSkeleton from './ChromeSkeleton.svelte';
    import type { Example } from './examples';
    import type { ViewerConfig } from './viewerConfig';
    import { SITE_VIEWER_THEME } from './viewerTheme';

    /**
     * A viewer embedded in a marketing page.
     *
     * The box reserves its own height from the first canvas's aspect ratio,
     * the first canvas is painted into it as an image where the site has one to
     * serve, and the viewer's chrome is drawn around that as plain markup — so
     * the page is complete and stable before any viewer code has run. Nothing
     * moves when the viewer arrives, it lands its controls where they already
     * appeared to be, and a reader whose script never runs still sees a viewer.
     *
     * The viewer itself — its code, its stylesheet and its manifest — is
     * fetched after the page has loaded, and for an embed below the fold only
     * once its box is scrolled to. Both deferrals are the argument the site is
     * making: the page saying the viewer is light must not put the viewer's
     * weight on its own critical path.
     */
    let {
        example,
        config,
        label,
        eager = false,
    }: {
        example: Example;
        config?: ViewerConfig;
        /** Names the region for a screen reader; every embed needs one. */
        label: string;
        /**
         * Start as soon as the page has loaded rather than waiting to be
         * scrolled to. For a viewer above the fold, which a reader is looking
         * at already.
         */
        eager?: boolean;
    } = $props();

    type ViewerComponent =
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer'];

    const first = $derived(example.firstCanvas);
    const prerender = $derived(first.prerender);
    const reserved = $derived(example.reserve ?? first);

    /**
     * The viewer draws on the host's ground rather than its own.
     *
     * This is what lets the first-canvas image do its job: with an opaque stage
     * the image would be covered before the renderer had anything to show, and
     * the reader would watch an empty box until the manifest arrived.
     */
    const applied = $derived({ ...config, transparentBackground: true });

    let box: HTMLDivElement;
    let Viewer = $state<ViewerComponent | undefined>(undefined);

    async function start() {
        const module = await import('triiiceratops/svelte');
        await import('triiiceratops/style.css');
        Viewer = module.TriiiceratopsViewer;
    }

    /** Run `then` once the page has finished loading, or at once if it has. */
    function afterLoad(then: () => void): () => void {
        if (document.readyState === 'complete') {
            then();
            return () => {};
        }
        addEventListener('load', then, { once: true });
        return () => removeEventListener('load', then);
    }

    onMount(() => {
        /*
         * Nothing starts inside the editor. The same document is rendered
         * there for whoever is writing its prose, and an embed is read-only to
         * them: five viewers fetching somebody else's material buy an author
         * nothing, and cost them an editing surface that stutters under the
         * keystrokes it exists to take. The reserved box and the chrome stay,
         * so the shape of the page is still what they are editing.
         *
         * The editing surface is a shadow root and the published page is the
         * document, which is the only thing that tells one rendering of one
         * document from the other.
         */
        if (box.getRootNode() !== document) return;

        if (eager) return afterLoad(() => void start());

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                observer.disconnect();
                void start();
            },
            // A margin, so a viewer is loading while its box is still
            // approaching rather than only once it has arrived.
            { rootMargin: '300px' },
        );
        // Observing is deferred too: an observer installed during load fires
        // immediately for anything already on screen, which would put an
        // above-the-fold lazy embed back on the page's own load.
        const cancel = afterLoad(() => observer.observe(box));
        return () => {
            cancel();
            observer.disconnect();
        };
    });
</script>

<div
    class="vw"
    bind:this={box}
    style="aspect-ratio: {reserved.width} / {reserved.height}"
    role="group"
    aria-label={label}
>
    {#if prerender}
        <img
            class="vw__first"
            src={prerender.src}
            alt={prerender.alt}
            width={first.width}
            height={first.height}
            decoding="async"
            fetchpriority={eager ? 'high' : 'auto'}
            loading={eager ? 'eager' : 'lazy'}
        />
    {/if}
    {#if Viewer === undefined}
        <ChromeSkeleton canvases={example.canvases} />
    {:else}
        <div class="vw__live">
            <Viewer
                manifestId={example.manifest}
                config={applied}
                themeConfig={SITE_VIEWER_THEME}
                plugins={false}
            />
        </div>
    {/if}
</div>
