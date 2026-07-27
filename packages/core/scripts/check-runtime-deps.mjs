import { readFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const entryFiles = [
    path.join(distDir, 'state', 'manifestoRuntime.browser.js'),
    path.join(distDir, 'triiiceratops-bundle.js'),
    path.join(distDir, 'plugins', 'image-manipulation.js'),
    path.join(distDir, 'plugins', 'annotation-editor.js'),
];

const forbiddenSpecifiers = new Set(['manifesto.js', 'openseadragon']);
const forbiddenRuntimeStrings = [
    'manifesto.js/dist-umd/manifesto.js',
    "new Function('s', 'return import(s)')",
];
const importRegex = /import\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g;

const visitedFiles = new Set();
const bareImports = [];

async function visitFile(filePath) {
    const normalizedPath = path.resolve(filePath);

    if (visitedFiles.has(normalizedPath)) {
        return;
    }

    visitedFiles.add(normalizedPath);

    const source = await readFile(normalizedPath, 'utf8');

    for (const forbiddenRuntimeString of forbiddenRuntimeStrings) {
        if (source.includes(forbiddenRuntimeString)) {
            bareImports.push({
                filePath: normalizedPath,
                specifier: forbiddenRuntimeString,
            });
        }
    }

    for (const match of source.matchAll(importRegex)) {
        const specifier = match[1];

        if (forbiddenSpecifiers.has(specifier)) {
            bareImports.push({ filePath: normalizedPath, specifier });
            continue;
        }

        if (!specifier.startsWith('.')) {
            continue;
        }

        if (!specifier.endsWith('.js')) {
            continue;
        }

        const importedFilePath = path.resolve(path.dirname(normalizedPath), specifier);
        await visitFile(importedFilePath);
    }
}

for (const entryFile of entryFiles) {
    await visitFile(entryFile);
}

if (bareImports.length > 0) {
    const details = bareImports
        .map(({ filePath, specifier }) => `- ${path.relative(process.cwd(), filePath)} imports ${specifier}`)
        .join('\n');

    throw new Error(
        `Runtime entry graph still leaks forbidden bare imports:\n${details}`,
    );
}

console.log('Runtime entry graph bundles manifesto.js and openseadragon.');
