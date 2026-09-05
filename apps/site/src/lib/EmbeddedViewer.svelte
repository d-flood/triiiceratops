<script lang="ts">
    import { onMount } from 'svelte';
    import ChromeSkeleton from './ChromeSkeleton.svelte';
    import type { BuiltInTheme, ThemeConfig, ViewerState } from 'triiiceratops';
    import type { Example } from './examples';
    import type { ViewerConfig } from './viewerConfig';
    import { SITE_VIEWER_THEME } from './viewerTheme';

    /**
     * A viewer embedded in a marketing page.
     *
     * The box reserves its own height before any script runs — from the first
     * canvas's aspect ratio, or from a parent that has declared one — the first
     * canvas is painted into it as an image where the site has one to serve, and the viewer's chrome is drawn around that as plain markup — so
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
        theme,
        themeConfig = SITE_VIEWER_THEME,
        fill = false,
        viewerState = $bindable(),
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
        /**
         * A built-in theme, for the one embed whose subject is theming.
         *
         * Unset everywhere else, and that is the default the site wants: a
         * built-in is declared on the viewer's own root and so beats anything
         * inherited, which would put a light island inside a dark page. Setting
         * it is only correct where a reader has asked for it.
         */
        theme?: BuiltInTheme;
        /**
         * The theme slots the viewer is given. Defaults to the site's own
         * tokens, which is what keeps every embed in the page's scheme.
         */
        themeConfig?: ThemeConfig;
        /**
         * Take the height the parent declares rather than the one the reserved
         * shape implies.
         *
         * The shape is still declared either way — it is what sizes the box at
         * the widths where the parent has no height of its own — so this
         * changes which of two already-known heights wins, never whether the
         * box is reserved before script runs. For the hero, whose band height
         * is what lets a portrait folio fill the frame instead of letterboxing
         * inside a landscape one.
         */
        fill?: boolean;
        /**
         * The running viewer's state, once it has one — for a host that drives
         * the viewer as well as configuring it. `undefined` until the viewer
         * module has been fetched, which is the whole point of the deferral
         * above, so a caller has to tolerate not having it yet.
         */
        viewerState?: ViewerState;
    } = $props();

    type ViewerComponent =
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer'];

    const first = $derived(example.firstCanvas);
    const prerender = $derived(first.prerender);
    const reserved = $derived(example.reserve ?? first);

    let box: HTMLDivElement;
    let Viewer = $state<ViewerComponent | undefined>(undefined);

    /**
     * The first-canvas image stands in only until the viewer has content of its
     * own. It cannot simply stay underneath: the stage is transparent, so once a
     * reader zooms, pans or turns the page, the image shows through everywhere
     * the live canvas does not reach — a second, stale folio behind the real
     * one.
     */
    const held = $derived(
        viewerState?.isManifestReady(example.manifest) !== true,
    );

    /**
     * The viewer draws on the host's ground only while the first-canvas image is
     * standing in for it: an opaque stage would cover the image before the
     * renderer had anything to show, and the reader would watch an empty box
     * until the manifest arrived. Once the viewer has content the stage takes
     * its own ground back, which is what makes `viewerBg` a slot that does
     * something here.
     */
    const applied = $derived({ ...config, transparentBackground: held });

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
    class:vw--fill={fill}
    bind:this={box}
    style="aspect-ratio: {reserved.width} / {reserved.height}"
    role="group"
    aria-label={label}
>
    {#if prerender && held}
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
                bind:viewerState
                manifestId={example.manifest}
                config={applied}
                {theme}
                {themeConfig}
                plugins={false}
            />
        </div>
    {/if}
</div>
