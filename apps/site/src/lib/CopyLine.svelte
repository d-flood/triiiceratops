<script lang="ts">
    import { getCodeLanguageClass, highlightCodeToHtml } from 'uncial/render';

    /* Copies `textContent` beside it, so copy and render cannot disagree. */
    let {
        text,
        label,
        language,
    }: {
        text: string;
        label: string;
        language?: string;
    } = $props();

    const highlighted = $derived(
        language === undefined
            ? undefined
            : highlightCodeToHtml(text, language),
    );

    let said = $state('');
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function copy() {
        clearTimeout(timer);
        try {
            await navigator.clipboard.writeText(text);
            said = 'Copied';
        } catch {
            said = 'Select and copy';
        }
        timer = setTimeout(() => (said = ''), 1600);
    }
</script>

<div class="cmd">
    {#if highlighted === undefined}
        <code>{text}</code>
    {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- highlighted code is escaped in Uncial's syntaxHighlight -->
        <code class={getCodeLanguageClass(language)}>{@html highlighted}</code>
    {/if}
    <button type="button" onclick={copy} aria-label="Copy the {label}"
        >{said || 'Copy'}</button
    >
    <span class="vh" role="status">{said}</span>
</div>
