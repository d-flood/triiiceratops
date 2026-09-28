export const PACKAGE_NAME = 'triiiceratops';

export const PACKAGE_MANAGER_GROUP = 'package-manager';

export type PackageManager = {
    readonly id: 'npm' | 'pnpm' | 'bun' | 'yarn';
    readonly command: string;
};

export const PACKAGE_MANAGERS: readonly PackageManager[] = [
    { id: 'npm', command: `npm install ${PACKAGE_NAME}` },
    { id: 'pnpm', command: `pnpm add ${PACKAGE_NAME}` },
    { id: 'bun', command: `bun add ${PACKAGE_NAME}` },
    { id: 'yarn', command: `yarn add ${PACKAGE_NAME}` },
];

export const CDN_SNIPPET = `<script src="https://unpkg.com/${PACKAGE_NAME}/dist/triiiceratops-element.iife.js"></script>
<triiiceratops-viewer manifest-id="https://example.org/manifest.json"></triiiceratops-viewer>`;
