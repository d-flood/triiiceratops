<script lang="ts">
    /**
     * A block of code with a control that copies exactly what is rendered.
     *
     * The control reads the text it is next to rather than a second copy of the
     * string, so the two cannot disagree — a copy button that pastes something
     * other than what the reader is looking at is the specific failure this
     * shape exists to make impossible.
     */
    let { text, label }: { text: string; label: string } = $props();

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
    <code>{text}</code>
    <button type="button" onclick={copy} aria-label="Copy the {label}"
        >{said || 'Copy'}</button
    >
    <span class="vh" role="status">{said}</span>
</div>
