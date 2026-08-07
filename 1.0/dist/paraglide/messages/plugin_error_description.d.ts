export function plugin_error_description(inputs: {
    plugin: NonNullable<unknown>;
}, options?: {
    locale?: "en" | "de";
}): LocalizedString;
export type LocalizedString = import("../runtime.js").LocalizedString;
