// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createApp, defineComponent, h, type PropType } from 'vue';
import { useViewerSelector } from '@triiiceratops/plugin-sdk/vue';
import type { PluginContext } from 'triiiceratops';

const PluginUI = defineComponent({
    props: {
        context: { type: Object as PropType<PluginContext>, required: true },
    },
    setup(props) {
        const open = useViewerSelector(props.context, (s) => s.toolbarOpen);
        return () => h('span', open.value ? 'open' : 'closed');
    },
});

function mount(container: HTMLElement, context: PluginContext): () => void {
    const app = createApp(PluginUI, { context });
    app.mount(container);
    return () => app.unmount();
}
