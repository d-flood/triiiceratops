<script>
    // Failure-isolation smoke (ticket 09) for a real SDK plugin. A plugin
    // authored on the packed SDK deliberately THROWS in `mount`. Core must
    // isolate the failure: the viewer stays live, the failed plugin presents a
    // plugin-local error state (a badged toolbar button + retry), and the
    // structured `pluginerror` is delivered to the host callback with phase
    // `mount`.
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
    import { definePlugin, svgIcon } from '@triiiceratops/plugin-sdk';

    const BrokenPlugin = definePlugin({
        name: '@triiiceratops/plugin-broken-fixture',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: svgIcon(
            '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>',
        ),
        target: 'flyout',
        view: {
            mount() {
                throw new Error('boom: forced mount failure');
            },
        },
    });

    function onpluginerror(error) {
        window.__triPluginError = {
            name: error.pluginName,
            phase: error.phase,
            message: String(error.error?.message ?? error.error),
            hasRetry: typeof error.retry === 'function',
        };
    }
</script>

<div style="width: 100vw; height: 100vh">
    <TriiiceratopsViewer
        manifestId="/manifest.json"
        plugins={[BrokenPlugin]}
        {onpluginerror}
    />
</div>
