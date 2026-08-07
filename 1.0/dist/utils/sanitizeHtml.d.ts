export declare function escapeHtml(value: string): string;
export declare function hasNativeHtmlSanitizer(): boolean;
export declare function sanitizeHtmlSync(html: string): string | null;
export declare function sanitizeHtml(html: string): Promise<string>;
