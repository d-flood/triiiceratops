export interface RequestConfig {
    /**
     * Extra headers to send with the IIIF manifest request
     */
    headers?: Record<string, string>;
    /**
     * Whether to use credentials (cookies) for the request
     */
    withCredentials?: boolean;
}
