import type { PanelStackItem } from './PanelStack.svelte';
interface Props {
    panel: PanelStackItem;
    scrollOnMount?: boolean;
    /** Which edge the close button sits on ('end' trailing, 'start' leading). */
    closeAlign?: 'start' | 'end';
}
declare const PanelStackSection: import("svelte").Component<Props, {}, "">;
type PanelStackSection = ReturnType<typeof PanelStackSection>;
export default PanelStackSection;
