<script lang="ts">
    import { renderIiifRichText } from '../utils/sanitizeHtml';
    import type { ClassValue, SvelteHTMLElements } from 'svelte/elements';

    interface Props {
        html?: string;
        class?: ClassValue;
        tag?: keyof SvelteHTMLElements;
    }

    let {
        html = '',
        class: className = undefined,
        tag = 'div',
    }: Props = $props();

    let host: Element | undefined = $state();

    /*
     * Rich text is rendered as nodes, not markup: `renderIiifRichText` returns a
     * fragment it built itself from IIIF's allowlist, and it goes into the host
     * element by replacement. There is no `{@html}` here and no string that
     * needs certifying, so this path no longer depends on the Trusted Types
     * default policy.
     *
     * The host owns no Svelte-managed children, so `replaceChildren` is not
     * fighting the compiler over the same DOM. It is also the reset: a new
     * `html` prop clears the previous render in the same call.
     */
    $effect(() => {
        const fragment = renderIiifRichText(html || '');
        // The host's children are ours alone; the template declares none. See
        // lint-allowlist.md entry 9.
        // eslint-disable-next-line svelte/no-dom-manipulating
        host?.replaceChildren(fragment);
    });
</script>

<svelte:element this={tag} bind:this={host} class={className}></svelte:element>

<style>
    :global(.viewer-html) {
        line-height: 1.5;
    }

    :global(.viewer-html a) {
        color: var(--tri-color-primary-text);
        text-decoration: underline;
        text-underline-offset: 0.2em;
    }

    :global(.viewer-html a:hover) {
        color: var(--tri-color-primary-text);
    }

    :global(.viewer-html a:focus-visible) {
        outline: 2px solid var(--tri-color-primary);
        outline-offset: 2px;
        border-radius: 0.125rem;
    }

    :global(.viewer-html p) {
        margin: 0 0 0.75rem;
    }

    :global(.viewer-html p:last-child) {
        margin-bottom: 0;
    }

    :global(.viewer-html small) {
        font-size: 0.875em;
        opacity: 0.8;
    }

    :global(.viewer-html b) {
        font-weight: 700;
    }

    :global(.viewer-html i) {
        font-style: italic;
    }

    :global(.viewer-html sub),
    :global(.viewer-html sup) {
        font-size: 0.75em;
        line-height: 0;
        position: relative;
        vertical-align: baseline;
    }

    :global(.viewer-html sup) {
        top: -0.45em;
    }

    :global(.viewer-html sub) {
        bottom: -0.2em;
    }

    :global(.viewer-html img) {
        display: inline-block;
        max-width: 100%;
        height: auto;
        vertical-align: middle;
        border-radius: 0.25rem;
    }
</style>
