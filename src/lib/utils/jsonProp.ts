type ParseJsonPropOptions<T> = {
    fallback: T;
    label: string;
    onError?: (message: string) => void;
};

export function parseJsonProp<T>(
    value: string,
    options: ParseJsonPropOptions<T>,
): T {
    try {
        return JSON.parse(value) as T;
    } catch {
        options.onError?.(`Invalid ${options.label} JSON: "${value}". Ignoring.`);
        return options.fallback;
    }
}
