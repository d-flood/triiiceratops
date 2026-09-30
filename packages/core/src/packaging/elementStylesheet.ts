import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

const STYLED_ROOTS = ['packages/core/src/lib', 'packages/ui/src'];

const STYLE_BLOCK = /^<style[\s>]/m;

const PLACEHOLDER = '__TRI_ELEMENT_COMPONENT_CSS_7c1e__';

const GLOBAL_SHEET = /\/app\.css\?inline$/;

export function styledComponents(repoRoot: string): string[] {
    return STYLED_ROOTS.flatMap((root) =>
        readdirSync(join(repoRoot, root), { recursive: true, encoding: 'utf8' })
            .filter((file) => file.endsWith('.svelte'))
            .map((file) => `${root}/${file.replaceAll('\\', '/')}`)
            .filter((file) =>
                STYLE_BLOCK.test(readFileSync(join(repoRoot, file), 'utf8')),
            ),
    ).sort();
}

export function elementCssHash(
    repoRoot: string,
): (input: { filename?: string }) => string {
    const index = new Map(
        styledComponents(repoRoot).map((file, i) => [
            file,
            `_${i.toString(36)}`,
        ]),
    );
    return ({ filename }) => {
        const file = relative(repoRoot, resolve(filename ?? '')).replaceAll(
            '\\',
            '/',
        );
        const hash = index.get(file);
        if (hash === undefined) {
            throw new Error(
                `${file} has a <style> block but is not in the element build's styled-component index ` +
                    `(every .svelte file with a <style> block under ${STYLED_ROOTS.join(' or ')}). ` +
                    `Move it under one of those roots, or add its root to STYLED_ROOTS in src/packaging/elementStylesheet.ts.`,
            );
        }
        return hash;
    };
}

export function escapeForLiteral(css: string, quote: string): string {
    const escaped = css
        .replaceAll('\\', '\\\\')
        .replaceAll(quote, `\\${quote}`);
    return quote === '`'
        ? escaped.replaceAll('${', '\\${')
        : escaped.replaceAll('\n', '\\n').replaceAll('\r', '\\r');
}

interface AstNode {
    type: string;
    start: number;
    end: number;
    value?: unknown;
}

function literalsContaining(
    node: unknown,
    text: string,
    found: AstNode[],
): AstNode[] {
    if (Array.isArray(node)) {
        for (const child of node) literalsContaining(child, text, found);
    } else if (node !== null && typeof node === 'object') {
        const n = node as AstNode;
        if (
            (n.type === 'Literal' && typeof n.value === 'string') ||
            n.type === 'TemplateElement'
        ) {
            const value =
                n.type === 'Literal'
                    ? (n.value as string)
                    : (n.value as { cooked: string }).cooked;
            if (value.includes(text)) found.push(n);
        }
        for (const child of Object.values(n)) {
            if (child !== null && typeof child === 'object') {
                literalsContaining(child, text, found);
            }
        }
    }
    return found;
}

// The terser pass has already folded the element's `<style>${styles}</style>`
// template into one literal by generateBundle, so the placeholder sits inside
// a string whose quote only the parsed chunk can tell.
export function elementStylesheet(): Plugin {
    let appended = false;
    return {
        name: 'triiiceratops:element-stylesheet',
        apply: 'build',
        enforce: 'post',
        transform(code, id) {
            if (!GLOBAL_SHEET.test(id)) return null;
            const program = this.parse(code) as unknown as {
                body: { type: string; declaration: AstNode }[];
            };
            const declaration = program.body.find(
                (statement) => statement.type === 'ExportDefaultDeclaration',
            )?.declaration;
            if (
                declaration?.type !== 'Literal' ||
                typeof declaration.value !== 'string'
            ) {
                throw new Error(
                    `${id} no longer compiles to \`export default "<css>"\`; the element stylesheet cannot append component CSS to it.`,
                );
            }
            appended = true;
            return {
                code:
                    code.slice(0, declaration.start) +
                    JSON.stringify(declaration.value + PLACEHOLDER) +
                    code.slice(declaration.end),
                map: null,
            };
        },
        generateBundle(_options, bundle) {
            if (!appended) {
                throw new Error(
                    'No module matching app.css?inline reached the element build, so component CSS has no stylesheet to join.',
                );
            }
            let css = '';
            for (const [fileName, asset] of Object.entries(bundle)) {
                if (asset.type === 'asset' && fileName.endsWith('.css')) {
                    css += (
                        typeof asset.source === 'string'
                            ? asset.source
                            : Buffer.from(asset.source).toString('utf8')
                    ).trimEnd();
                    delete bundle[fileName];
                }
            }
            if (css === '') {
                throw new Error(
                    'The element build extracted no component CSS; check that the Svelte plugin sets `emitCss: true`.',
                );
            }
            const chunks = Object.values(bundle).filter(
                (chunk) => chunk.type === 'chunk',
            );
            const hits = chunks.flatMap((chunk) =>
                literalsContaining(this.parse(chunk.code), PLACEHOLDER, []).map(
                    (node) => ({ chunk, node }),
                ),
            );
            if (hits.length !== 1) {
                throw new Error(
                    `Expected the element stylesheet placeholder in exactly one string literal, found ${hits.length}.`,
                );
            }
            const [{ chunk, node }] = hits;
            const quote =
                node.type === 'TemplateElement' ? '`' : chunk.code[node.start];
            const raw = chunk.code.slice(node.start, node.end);
            if (raw.split(PLACEHOLDER).length !== 2) {
                throw new Error(
                    'The element stylesheet placeholder is escaped or repeated inside its literal.',
                );
            }
            chunk.code =
                chunk.code.slice(0, node.start) +
                raw.replace(PLACEHOLDER, () => escapeForLiteral(css, quote)) +
                chunk.code.slice(node.end);
        },
    };
}
