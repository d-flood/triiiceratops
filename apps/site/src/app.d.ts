declare global {
    namespace App {}

    /** The published version and its date, substituted by Vite at build time. */
    const __SITE_VERSION__: string;
    const __SITE_VERSION_DATE__: string;
}

export {};
