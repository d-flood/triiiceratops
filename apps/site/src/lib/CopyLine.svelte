<script lang="ts">
    import { getCodeLanguageClass, highlightCodeToHtml } from 'uncial/render';

    /**
     * A block of code with a control that copies exactly what is rendered.
     *
     * The control reads the text it is next to rather than a second copy of the
     * string, so the two cannot disagree — a copy button that pastes something
     * other than what the reader is looking at is the specific failure this
     * shape exists to make impossible. Highlighting is markup around the same
     * characters, so `textContent` still yields the source verbatim.
     */
    let {
        text,
        label,
        language,
    }: {
        text: string;
        label: string;
        /**
         * Which grammar to colour by. Omitted means no colour at all rather
         * than a guess: the blocks here that carry no language are a share
         * link and a bare path, and auto-detection colours those as if they
         * were code.
         */
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
            // A denied permission, or an insecure origin. Saying so beats a
            // control that silently does nothing.
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
