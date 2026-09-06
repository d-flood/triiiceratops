<script lang="ts">
    import { getMessages, provideActiveLocale } from '../state/i18n.svelte';

    let {
        locale,
        messageKey,
    }: {
        /** The viewer's active locale, as the viewer root would publish it. */
        locale: string;
        /** A message name looked up by string, as a host-driven label would. */
        messageKey: string;
    } = $props();

    provideActiveLocale({
        get current() {
            return locale;
        },
    });
    const m = getMessages();
    const byName = m as unknown as Record<string, () => string>;
</script>

<span data-testid="interpolated">{m.annotations_count({ count: 3 })}</span>
<span data-testid="dynamic">{byName[messageKey]()}</span>
