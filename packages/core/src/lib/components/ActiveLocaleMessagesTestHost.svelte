<script lang="ts">
    import {
        createHostCatalogs,
        getMessages,
        provideActiveLocale,
        type HostCatalogConfig,
    } from '../state/i18n.svelte';

    let {
        locale,
        messageKey,
        messages = undefined,
        loadMessages = undefined,
    }: {
        /** The viewer's active locale, as the viewer root would publish it. */
        locale: string;
        /** A message name looked up by string, as a host-driven label would. */
        messageKey: string;
    } & HostCatalogConfig = $props();

    const hostCatalogs = createHostCatalogs(() => ({
        messages,
        loadMessages,
    }));

    provideActiveLocale({
        get current() {
            return locale;
        },
        host: hostCatalogs,
    });
    const m = getMessages();
    const byName = m as unknown as Record<string, () => string>;

    $effect(() => {
        hostCatalogs.request(locale);
    });
</script>

<span data-testid="interpolated">{m.annotations_count({ count: 3 })}</span>
<span data-testid="dynamic">{byName[messageKey]()}</span>
