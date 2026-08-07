export function parseJsonProp(value, options) {
    try {
        return JSON.parse(value);
    }
    catch {
        options.onError?.(`Invalid ${options.label} JSON: "${value}". Ignoring.`);
        return options.fallback;
    }
}
