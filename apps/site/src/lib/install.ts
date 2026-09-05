/**
 * The two install forms the front page carries, declared once.
 *
 * Installing is the conversion, so these lines are the front page's call to
 * action and the thing most likely to be copied wrong. The package name is the
 * published one; the CDN pair is the no-build-step route, and names the same
 * artifact the package's `element` entrypoint resolves to.
 */

export const PACKAGE_NAME = 'triiiceratops';

export type PackageManager = {
    /** Tab label, and the identifier a test names the tab by. */
    readonly id: 'npm' | 'pnpm' | 'bun' | 'yarn';
    readonly command: string;
};

/**
 * npm first, because it is the one a reader who does not care will copy.
 *
 * Each manager's own verb: `npm install`, and `add` for the other three. A line
 * that is nearly right is worse than one a reader has to translate, because it
 * fails in their terminal rather than in their head.
 */
export const PACKAGE_MANAGERS: readonly PackageManager[] = [
    { id: 'npm', command: `npm install ${PACKAGE_NAME}` },
    { id: 'pnpm', command: `pnpm add ${PACKAGE_NAME}` },
    { id: 'bun', command: `bun add ${PACKAGE_NAME}` },
    { id: 'yarn', command: `yarn add ${PACKAGE_NAME}` },
];

/**
 * The script tag and the element it defines, as one copyable block.
 *
 * The pair travels together on purpose: the script alone defines a tag nobody
 * has written, and the tag alone is an unknown element that renders nothing.
 */
export const CDN_SNIPPET = `<script src="https://unpkg.com/${PACKAGE_NAME}/dist/triiiceratops-element.iife.js"></script>
<triiiceratops-viewer manifest-id="https://example.org/manifest.json"></triiiceratops-viewer>`;
