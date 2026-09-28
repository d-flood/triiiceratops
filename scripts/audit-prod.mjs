#!/usr/bin/env node
// Production-dependency audit gate: maps the workspace `pnpm audit --prod`
// onto each publishable package's own production graph.
// pnpm rejects `--filter` on `audit`, so the mapping is done here.

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packagesDir = join(repoRoot, 'packages');

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const SEVERITY_THRESHOLD = 'high';

/** @type {{ advisory: string | number, package: string, rationale: string }[]} */
const ALLOWLIST = [];

const thresholdRank = SEVERITY_RANK[SEVERITY_THRESHOLD];

function discoverPackages() {
    const packages = [];
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
        if (!existsSync(pkgJsonPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.private === true) continue;
        packages.push({ name: pkg.name, dir: entry.name });
    }
    return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function prodGraph(pkgName) {
    const raw = execFileSync(
        'pnpm',
        [
            '--filter',
            pkgName,
            'list',
            '--prod',
            '--depth',
            'Infinity',
            '--json',
        ],
        { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    const projects = JSON.parse(raw);
    const root = Array.isArray(projects) ? projects[0] : projects;
    const graph = new Map();

    const walk = (deps, trail) => {
        if (!deps) return;
        for (const [name, info] of Object.entries(deps)) {
            // Workspace-linked entries are audited under their own package.
            if (
                typeof info.version === 'string' &&
                info.version.startsWith('link:')
            ) {
                continue;
            }
            const key = `${name}@${info.version}`;
            const path = [...trail, key];
            if (!graph.has(key)) graph.set(key, path);
            walk(info.dependencies, path);
        }
    };

    walk(root && root.dependencies, []);
    return graph;
}

function runAudit() {
    let stdout;
    try {
        stdout = execSync('pnpm audit --prod --json', {
            cwd: repoRoot,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (err) {
        // pnpm exits non-zero when advisories exist; the JSON is still on stdout.
        stdout = err.stdout;
        if (!stdout) {
            console.error('Failed to run `pnpm audit --prod --json`:');
            console.error(err.stderr || err.message);
            process.exit(1);
        }
    }
    try {
        return JSON.parse(stdout);
    } catch {
        console.error('Could not parse `pnpm audit --prod --json` output.');
        console.error(stdout);
        process.exit(1);
    }
}

function isAllowlisted(advisory, pkgName) {
    return ALLOWLIST.some(
        (e) =>
            e.package === pkgName &&
            (String(e.advisory) === String(advisory.id) ||
                e.advisory === advisory.github_advisory_id),
    );
}

// ─── Evaluate ───

const packages = discoverPackages();
const graphs = new Map(packages.map((p) => [p.name, prodGraph(p.name)]));

const report = runAudit();
const advisories = Object.values(report.advisories || {});

const tallies = new Map(
    packages.map((p) => [
        p.name,
        { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    ]),
);
/** @type {{ pkg: string, advisory: any, path: string[], allowlisted: boolean }[]} */
const gating = [];

for (const advisory of advisories) {
    const severity = advisory.severity;
    const rank = SEVERITY_RANK[severity] ?? 0;
    const moduleName = advisory.module_name;

    for (const { name: pkgName } of packages) {
        const graph = graphs.get(pkgName);
        let matchedPath = null;

        for (const finding of advisory.findings || []) {
            const exact = `${moduleName}@${finding.version}`;
            if (graph.has(exact)) {
                matchedPath = graph.get(exact);
                break;
            }
        }
        // Fallback: match by name when the advisory carries no per-version finding.
        if (!matchedPath) {
            for (const [key, path] of graph) {
                if (key.startsWith(`${moduleName}@`)) {
                    matchedPath = path;
                    break;
                }
            }
        }
        if (!matchedPath) continue;

        tallies.get(pkgName)[severity] =
            (tallies.get(pkgName)[severity] || 0) + 1;

        if (rank >= thresholdRank) {
            gating.push({
                pkg: pkgName,
                advisory,
                path: matchedPath,
                allowlisted: isAllowlisted(advisory, pkgName),
            });
        }
    }
}

// ─── Report ───

console.log(
    `Production audit (fail at severity >= ${SEVERITY_THRESHOLD}) across ${packages.length} publishable package(s):\n`,
);

for (const { name } of packages) {
    const t = tallies.get(name);
    const parts = ['critical', 'high', 'moderate', 'low', 'info']
        .filter((s) => t[s] > 0)
        .map((s) => `${t[s]} ${s}`);
    const summary = parts.length > 0 ? parts.join(', ') : 'clean';
    console.log(`  ${name}: ${summary}`);
}

const failures = gating.filter((g) => !g.allowlisted);
const excepted = gating.filter((g) => g.allowlisted);

if (excepted.length > 0) {
    console.log(`\nAllowlisted advisories (reported, not gating):`);
    for (const { pkg, advisory } of excepted) {
        console.log(
            `  [allowlisted] ${pkg}: ${advisory.severity} ${advisory.github_advisory_id || advisory.id} (${advisory.module_name})`,
        );
    }
}

if (failures.length > 0) {
    console.error(
        `\nProduction advisories at severity >= ${SEVERITY_THRESHOLD}:`,
    );
    for (const { pkg, advisory, path } of failures) {
        console.error(
            `\n  package:    ${pkg}\n` +
                `  advisory:   ${advisory.severity.toUpperCase()} — ${advisory.title}\n` +
                `  id:         ${advisory.github_advisory_id || advisory.id}  (${advisory.url})\n` +
                `  module:     ${advisory.module_name} (${advisory.vulnerable_versions})\n` +
                `  dep path:   ${pkg} > ${path.join(' > ')}`,
        );
    }
    console.error(
        `\n${failures.length} production advisory(ies) at or above ${SEVERITY_THRESHOLD}. ` +
            `Fix/upgrade the dependency, or add a reviewed ALLOWLIST entry with a rationale in scripts/audit-prod.mjs.`,
    );
    process.exit(1);
}

console.log(
    `\nProduction audit OK: no advisory at severity >= ${SEVERITY_THRESHOLD} in any publishable package's production graph.`,
);
