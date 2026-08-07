export function hello_world(inputs?: {}, options?: {
    locale?: "en" | "de";
}): LocalizedString;
export type LocalizedString = import("../runtime.js").LocalizedString;
