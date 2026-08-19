/**
 * Guard: the message table ships WHOLE, and drift in either direction is silent.
 *
 * `createLocalizedMessages` (src/lib/state/i18n.svelte.ts) reaches messages
 * through a Proxy `get` trap, i.e. a runtime string index. No bundler can
 * tree-shake that, so every key in `messages/*.json` is bytes in the element
 * bundle whether or not anything renders it — and the same indirection means a
 * key that does NOT exist is a `get` returning `undefined`, not a compile or
 * type error. Both failures are invisible at build time:
 *
 *   - a key nothing references costs bytes forever (the leak this file exists to
 *     stop recurring; see SPEC.md, "Runtime string indexing defeats
 *     tree-shaking");
 *   - a reference to a key that was renamed or deleted throws
 *     `m.foo is not a function` at the moment that chrome first renders.
 *
 * So this asserts both directions between `messages/en.json` and the `m.<key>`
 * references under `src/lib`. It runs at the head of `build:element`, beside
 * `check-icon-coverage`, which guards the same class of hole in the icon table.
 *
 * Scope notes:
 *
 *   1. Test files under `src/lib` count as references. A key exercised only by a
 *      test is still dead weight in the bundle, but the reverse direction has to
 *      read tests — a test calling a deleted message is exactly the runtime
 *      `undefined` above — and one file set for both directions keeps the guard
 *      honest about what it checked.
 *   2. Comments are blanked first. Component and test prose quotes `m.<key>` as
 *      illustration, and a scan that read those would keep a key alive on the
 *      strength of a sentence about it.
 *   3. `Toolbar.svelte`'s `resolvePluginTooltip` indexes `m[tooltip]` with a
 *      plugin-supplied string, falling back to the string itself when it names
 *      no message. That path is deliberately outside this guard: the keys it can
 *      reach are whatever a third-party plugin passes, which no scan of this
 *      repo can enumerate. No first-party plugin names a core message key there.
 *
 * Run directly: `node ./scripts/check-message-coverage.mjs`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(here, '..');
const repoRoot = path.resolve(coreRoot, '..', '..');

/** The source language file; the compiler's own lint rules keep de.json level. */
const CATALOG = path.join(coreRoot, 'messages', 'en.json');

/** The only tree whose `m.<key>` calls resolve against that catalog. */
const ROOT = path.join(coreRoot, 'src', 'lib');

/** Generated output, and the Proxy that indexes it — neither names a key. */
const EXCLUDED = new Set(['paraglide', 'generated']);

const rel = (p) => path.relative(repoRoot, p);

const problems = [];

/* ------------------------------------------------------------------ catalog */

let keys = new Set();
if (!existsSync(CATALOG)) {
    problems.push(`${rel(CATALOG)} does not exist.`);
} else {
    keys = new Set(
        Object.keys(JSON.parse(readFileSync(CATALOG, 'utf8'))).filter(
            (key) => !key.startsWith('$'),
        ),
    );
    if (keys.size === 0) {
        problems.push(`${rel(CATALOG)} declares no messages.`);
    }
}

/* ------------------------------------------------------------------ sources */

function collectSources(dir) {
    const found = [];
    for (const entry of readdirSync(dir)) {
        if (EXCLUDED.has(entry)) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
            found.push(...collectSources(full));
        } else if (entry.endsWith('.svelte') || entry.endsWith('.ts')) {
            found.push(full);
        }
    }
    return found;
}

/** Blank comments, keeping line breaks so reported line numbers stay true. */
function stripComments(text) {
    const blank = (m) => m.replace(/[^\n]/g, ' ');
    return text
        .replace(/<!--[\s\S]*?-->/g, blank)
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(
            /(^|[^:\w])\/\/[^\n]*/g,
            (m, lead) => lead + blank(m.slice(lead.length)),
        );
}

/**
 * Whether a file declares `m` as a binding — imported from the i18n module or
 * the compiled output, returned by `getMessages()`, or assigned from an injected
 * namespace the way `canvasRenderer` takes `const m = options.messages`.
 *
 * The scan below is a text match on `m.<name>`, and `m` is an unremarkable name
 * for a callback PARAMETER: `matches.map((m) => m.index)` would otherwise read
 * as a reference to a message called `index` and fail the reverse direction on a
 * file that has nothing to do with messages. A parameter is never a declaration,
 * so requiring one separates the two cases without enumerating import styles.
 */
function bindsMessageNamespace(text) {
    return (
        /\b(?:const|let|var)\s+m\s*=/.test(text) ||
        /\bm\b[^\n]*from\s*['"][^'"]*(?:i18n|paraglide\/messages)/.test(text)
    );
}

/** name -> Set<"file:line"> for every `m.<name>` in the tree. */
const referenced = new Map();

if (!existsSync(ROOT)) {
    problems.push(`source root ${rel(ROOT)} does not exist.`);
} else {
    for (const file of collectSources(ROOT)) {
        const text = stripComments(readFileSync(file, 'utf8'));
        if (!bindsMessageNamespace(text)) continue;
        text.split('\n').forEach((line, index) => {
            for (const match of line.matchAll(
                /(?<![\w.$])m\.([A-Za-z_]\w*)/g,
            )) {
                const name = match[1];
                if (!referenced.has(name)) referenced.set(name, new Set());
                referenced.get(name).add(`${rel(file)}:${index + 1}`);
            }
        });
    }
}

if (referenced.size === 0) {
    problems.push(
        `no \`m.<key>\` references found under ${rel(ROOT)}; the guard would ` +
            `pass vacuously. Has the chrome moved, or the accessor been renamed?`,
    );
}

/* --------------------------------------------------- forward: keys are used */

const orphans = [...keys].filter((key) => !referenced.has(key)).sort();
for (const key of orphans) {
    problems.push(
        `"${key}" is in ${rel(CATALOG)} but nothing under ${rel(ROOT)} calls ` +
            `\`m.${key}\`. The Proxy puts it in the element bundle regardless, ` +
            `so delete it from messages/en.json and messages/de.json — or, if it ` +
            `belongs to the demo chrome, to src/demo/i18n.svelte.ts.`,
    );
}

/* ------------------------------------------ reverse: references are keys */

const unresolved = [...referenced.keys()].filter((n) => !keys.has(n)).sort();
for (const name of unresolved) {
    problems.push(
        `\`m.${name}\` is called from ${[...referenced.get(name)].sort().join(', ')} ` +
            `but is not a key in ${rel(CATALOG)}. The Proxy makes this ` +
            `\`undefined\` at render time, not a build error.`,
    );
}

/* --------------------------------------------------------------- reporting */

if (problems.length > 0) {
    console.error(
        'check-message-coverage: the message table and the chrome disagree\n',
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log(
    `check-message-coverage: all ${keys.size} message(s) in ${rel(CATALOG)} are ` +
        `called from ${rel(ROOT)}, and all ${referenced.size} \`m.<key>\` ` +
        `reference(s) resolve.`,
);
