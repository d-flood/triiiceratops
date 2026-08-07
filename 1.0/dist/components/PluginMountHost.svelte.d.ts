import type { PluginMountThunk } from '../types/plugin';
interface Props {
    /** Core-owned DOM-mount thunk: renders content into the node, returns cleanup. */
    mount: PluginMountThunk;
    [key: string]: unknown;
}
declare const PluginMountHost: import("svelte").Component<Props, {}, "">;
type PluginMountHost = ReturnType<typeof PluginMountHost>;
export default PluginMountHost;
