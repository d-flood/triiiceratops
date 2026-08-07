import type { ClassValue, SvelteHTMLElements } from 'svelte/elements';
interface Props {
    html?: string;
    class?: ClassValue;
    tag?: keyof SvelteHTMLElements;
}
declare const SanitizedHtml: import("svelte").Component<Props, {}, "">;
type SanitizedHtml = ReturnType<typeof SanitizedHtml>;
export default SanitizedHtml;
