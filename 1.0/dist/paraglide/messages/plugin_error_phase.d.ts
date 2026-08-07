export function plugin_error_phase(inputs: {
    phase: NonNullable<unknown>;
}, options?: {
    locale?: "en" | "de";
}): LocalizedString;
export type LocalizedString = import("../runtime.js").LocalizedString;
