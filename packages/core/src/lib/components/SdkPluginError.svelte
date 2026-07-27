<script lang="ts">
    /*
     * Plugin-local error state (ticket 09). When an SDK plugin fails in any
     * lifecycle phase, core keeps the viewer and every other plugin running and
     * presents THIS: the failed plugin's toolbar button, still visible but
     * badged with an error indicator, opening a plugin-local panel that names
     * the failure and offers a retry. There is no global viewer error UI — one
     * of these renders per failed plugin.
     *
     * Retry is manual full re-activation (CONTEXT.md **Retry**): the button
     * simply calls the payload's `retry()`, which core wired to tear the failed
     * instance down and activate fresh.
     */
    import { getMessages } from '../state/i18n.svelte';
    import PluginIcon from './PluginIcon.svelte';
    import { Button } from './ui';
    import type { IconDescriptor, PluginError } from '../types/plugin';

    interface Props {
        /** The structured failure payload (same object as the event/callback). */
        error: PluginError;
        /** The failed plugin's toolbar icon descriptor. */
        icon: IconDescriptor;
    }

    let { error, icon }: Props = $props();

    const m = getMessages();

    let open = $state(false);

    function detailText(value: unknown): string {
        if (value instanceof Error) return value.message || value.name;
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
</script>

<div
    class="plugin-error"
    data-plugin-error
    data-plugin-name={error.pluginName}
    data-phase={error.phase}
>
    <button
        type="button"
        class="plugin-error-button"
        class:menu-active={open}
        data-plugin-error-button
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={m.plugin_error_button_label({ plugin: error.pluginName })}
        onclick={() => (open = !open)}
    >
        <PluginIcon descriptor={icon} size={24} />
        <span class="plugin-error-badge" aria-hidden="true">!</span>
    </button>

    {#if open}
        <div
            class="plugin-error-panel"
            role="alertdialog"
            aria-label={m.plugin_error_heading()}
            data-plugin-error-panel
        >
            <h2 class="plugin-error-title">{m.plugin_error_heading()}</h2>
            <p class="plugin-error-desc">
                {m.plugin_error_description({ plugin: error.pluginName })}
            </p>
            <p class="plugin-error-phase">
                {m.plugin_error_phase({ phase: error.phase })}
            </p>
            <pre class="plugin-error-detail">{detailText(error.error)}</pre>
            <div class="plugin-error-actions">
                <Button
                    variant="primary"
                    size="sm"
                    data-plugin-error-retry
                    onclick={() => {
                        open = false;
                        error.retry();
                    }}
                >
                    {m.plugin_error_retry()}
                </Button>
                <Button
                    variant="default"
                    ghost
                    size="sm"
                    onclick={() => (open = false)}
                >
                    {m.plugin_error_close()}
                </Button>
            </div>
        </div>
    {/if}
</div>

<style>
    .plugin-error {
        position: relative;
        pointer-events: auto;
    }
    .plugin-error-button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--ui-hit, 2rem);
        height: var(--ui-hit, 2rem);
        padding: 0;
        cursor: pointer;
        color: var(--tri-toolbar-content);
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
        border: var(--tri-border) solid var(--tri-color-error);
        border-radius: var(--tri-radius-buttons);
        box-shadow: var(
            --ui-chrome-shadow,
            0 4px 6px -1px #0000001a,
            0 2px 4px -2px #0000001a
        );
    }
    .plugin-error-button :global(svg) {
        width: var(--ui-icon, 24px);
        height: var(--ui-icon, 24px);
    }
    /* Error indicator badge on the toolbar button. */
    .plugin-error-badge {
        position: absolute;
        top: 0;
        right: 0;
        translate: 40% -40%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1rem;
        height: 1rem;
        padding-inline: 0.2rem;
        font-size: 0.75rem;
        font-weight: 700;
        line-height: 1;
        color: var(--tri-color-error-content);
        background-color: var(--tri-color-error);
        border-radius: 999px;
    }

    .plugin-error-panel {
        position: absolute;
        z-index: 60;
        top: calc(100% + 0.5rem);
        left: 0;
        width: max-content;
        max-width: 20rem;
        padding: 0.75rem;
        color: var(--tri-toolbar-content);
        background-color: var(--tri-toolbar-bg);
        border: var(--tri-border) solid var(--tri-color-error);
        border-radius: var(--tri-radius-toolbar);
        box-shadow: var(
            --ui-chrome-shadow,
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a
        );
    }
    .plugin-error-title {
        margin: 0 0 0.25rem;
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--tri-color-error);
    }
    .plugin-error-desc,
    .plugin-error-phase {
        margin: 0 0 0.5rem;
        font-size: 0.8125rem;
        line-height: 1.35;
    }
    .plugin-error-detail {
        margin: 0 0 0.5rem;
        max-height: 6rem;
        overflow: auto;
        padding: 0.375rem 0.5rem;
        font-size: 0.75rem;
        white-space: pre-wrap;
        word-break: break-word;
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-content) 8%,
            transparent
        );
        border-radius: var(--tri-radius-buttons);
    }
    .plugin-error-actions {
        display: flex;
        gap: 0.5rem;
    }
</style>
