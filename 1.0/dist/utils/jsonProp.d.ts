type ParseJsonPropOptions<T> = {
    fallback: T;
    label: string;
    onError?: (message: string) => void;
};
export declare function parseJsonProp<T>(value: string, options: ParseJsonPropOptions<T>): T;
export {};
