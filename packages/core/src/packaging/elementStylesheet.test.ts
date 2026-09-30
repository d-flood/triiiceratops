import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAst } from 'vite';

import {
    elementCssHash,
    elementStylesheet,
    escapeForLiteral,
    styledComponents,
} from './elementStylesheet';

const PLACEHOLDER = '__TRI_ELEMENT_COMPONENT_CSS_7c1e__';

type Bundle = Record<
    string,
    | { type: 'asset'; source: string | Uint8Array }
    | { type: 'chunk'; code: string }
>;

type Hooks = {
    transform: (
        this: unknown,
        code: string,
        id: string,
    ) => { code: string } | null;
    generateBundle: (this: unknown, options: unknown, bundle: Bundle) => void;
};

const context = { parse: (code: string) => parseAst(code) };

function plugin() {
    const hooks = elementStylesheet() as unknown as Hooks;
    return {
        transform: (code: string, id: string) =>
            hooks.transform.call(context, code, id),
        generateBundle: (bundle: Bundle) =>
            hooks.generateBundle.call(context, {}, bundle),
    };
}

function joined() {
    const p = plugin();
    p.transform('export default "a{}";', '/abs/src/app.css?inline');
    return p;
}

describe('styledComponents and elementCssHash', () => {
    let root: string;

    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), 'element-stylesheet-'));
        const write = (file: string, body: string) => {
            mkdirSync(join(root, file, '..'), { recursive: true });
            writeFileSync(join(root, file), body);
        };
        write(
            'packages/core/src/lib/B.svelte',
            '<div></div>\n<style>b{}</style>',
        );
        write(
            'packages/core/src/lib/nested/A.svelte',
            '<style lang="css">a{}</style>',
        );
        write('packages/core/src/lib/Plain.svelte', '<div>no style</div>');
        write('packages/core/src/lib/notes.txt', '<style></style>');
        write('packages/ui/src/C.svelte', '<style>\nc{}</style>');
    });

    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('lists every .svelte file with a <style> block, sorted', () => {
        expect(styledComponents(root)).toEqual([
            'packages/core/src/lib/B.svelte',
            'packages/core/src/lib/nested/A.svelte',
            'packages/ui/src/C.svelte',
        ]);
    });

    it('hashes a component by its index position', () => {
        const hash = elementCssHash(root);
        expect(
            hash({ filename: join(root, 'packages/core/src/lib/B.svelte') }),
        ).toBe('_0');
        expect(hash({ filename: join(root, 'packages/ui/src/C.svelte') })).toBe(
            '_2',
        );
    });

    it('fails on a styled component outside the index', () => {
        const hash = elementCssHash(root);
        expect(() =>
            hash({ filename: join(root, 'elsewhere/D.svelte') }),
        ).toThrow(/elsewhere\/D\.svelte.*STYLED_ROOTS/s);
        expect(() => hash({})).toThrow(/not in the element build/);
    });
});

describe('escapeForLiteral', () => {
    it('escapes for a template literal', () => {
        expect(escapeForLiteral('a\\b`c${d}\n', '`')).toBe(
            'a\\\\b\\`c\\${d}\n',
        );
    });

    it('escapes for a quoted string', () => {
        expect(escapeForLiteral('a"b\\c\n\r${d}', '"')).toBe(
            'a\\"b\\\\c\\n\\r${d}',
        );
    });
});

describe('elementStylesheet', () => {
    it('leaves every module but the inline global sheet alone', () => {
        expect(
            plugin().transform('export default "x";', '/abs/app.css'),
        ).toBeNull();
    });

    it('appends the placeholder to the global sheet', () => {
        const result = plugin().transform(
            'export default "a{}";',
            '/abs/src/app.css?inline',
        );
        expect(result?.code).toBe(`export default "a{}${PLACEHOLDER}";`);
    });

    it('fails when the global sheet is no longer a string default export', () => {
        expect(() =>
            plugin().transform('export default 1;', '/abs/app.css?inline'),
        ).toThrow(/no longer compiles/);
        expect(() =>
            plugin().transform('export const a = "";', '/abs/app.css?inline'),
        ).toThrow(/no longer compiles/);
    });

    it('fails when the global sheet never reached the build', () => {
        expect(() => plugin().generateBundle({})).toThrow(/app\.css\?inline/);
    });

    it('fails when no component CSS was extracted', () => {
        expect(() =>
            joined().generateBundle({
                'a.js': { type: 'chunk', code: `x("${PLACEHOLDER}");` },
            }),
        ).toThrow(/emitCss/);
    });

    it('joins component CSS into a quoted literal and drops the assets', () => {
        const bundle: Bundle = {
            'a.css': { type: 'asset', source: '.a{}\n' },
            'b.css': {
                type: 'asset',
                source: new TextEncoder().encode('.b{content:"q"}'),
            },
            'logo.svg': { type: 'asset', source: '<svg/>' },
            'a.js': { type: 'chunk', code: `x("g{}${PLACEHOLDER}");` },
        };
        joined().generateBundle(bundle);
        expect(Object.keys(bundle)).toEqual(['logo.svg', 'a.js']);
        expect((bundle['a.js'] as { code: string }).code).toBe(
            'x("g{}.a{}.b{content:\\"q\\"}");',
        );
    });

    it('joins component CSS into a template literal', () => {
        const bundle: Bundle = {
            'a.css': { type: 'asset', source: '.a{content:"${x}"}' },
            'a.js': {
                type: 'chunk',
                code: `x(\`<style>${PLACEHOLDER}</style>\${y}\`);`,
            },
        };
        joined().generateBundle(bundle);
        expect((bundle['a.js'] as { code: string }).code).toBe(
            'x(`<style>.a{content:"\\${x}"}</style>${y}`);',
        );
    });

    it('fails unless the placeholder sits in exactly one literal', () => {
        const css = { type: 'asset', source: '.a{}' } as const;
        expect(() =>
            joined().generateBundle({
                'a.css': css,
                'a.js': { type: 'chunk', code: 'x("");' },
            }),
        ).toThrow(/found 0/);
        expect(() =>
            joined().generateBundle({
                'a.css': css,
                'a.js': { type: 'chunk', code: `x("${PLACEHOLDER}");` },
                'b.js': { type: 'chunk', code: `y('${PLACEHOLDER}');` },
            }),
        ).toThrow(/found 2/);
    });

    it('fails when the placeholder is repeated inside its literal', () => {
        expect(() =>
            joined().generateBundle({
                'a.css': { type: 'asset', source: '.a{}' },
                'a.js': {
                    type: 'chunk',
                    code: `x("${PLACEHOLDER}${PLACEHOLDER}");`,
                },
            }),
        ).toThrow(/escaped or repeated/);
    });
});
