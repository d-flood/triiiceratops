<script lang="ts">
    import { sanitizeHtml, sanitizeHtmlSync } from '../utils/sanitizeHtml';
    import type { ClassValue } from 'svelte/elements';

    interface Props {
        html?: string;
        class?: ClassValue;
        tag?: keyof HTMLElementTagNameMap;
    }

    let {
        html = '',
        class: className = undefined,
        tag = 'div',
    }: Props = $props();

    let sanitizedHtml = $state('');

    $effect(() => {
        const content = html || '';
        const syncSanitized = sanitizeHtmlSync(content);

        if (syncSanitized !== null) {
            sanitizedHtml = syncSanitized;
            return;
        }

        sanitizedHtml = '';

        if (!content) {
            return;
        }

        let cancelled = false;

        sanitizeHtml(content)
            .then((result) => {
                if (!cancelled && html === content) {
                    sanitizedHtml = result;
                }
            })
            .catch(() => {
                if (!cancelled && html === content) {
                    sanitizedHtml = '';
                }
            });

        return () => {
            cancelled = true;
        };
    });
</script>

<svelte:element this={tag} class={className}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html sanitizedHtml}
</svelte:element>

<style>
    :global(.viewer-html) {
        line-height: 1.5;
    }

    :global(.viewer-html a) {
        color: var(--color-primary);
        text-decoration: underline;
        text-underline-offset: 0.2em;
    }

    :global(.viewer-html a:hover) {
        color: color-mix(in oklab, var(--color-primary) 85%, black);
    }

    :global(.viewer-html a:focus-visible) {
        outline: 2px solid var(--color-primary);
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
