/**
 * Semver compatibility negotiation.
 *
 * A plugin declares `coreRange`, `pluginApiRange`, and `requiredCapabilities`.
 * At activation the SDK checks them against the host's declared `coreVersion`,
 * `pluginApiVersion`, and `capabilities` and, on any mismatch, throws a
 * structured, actionable {@link PluginCompatibilityError}.
 *
 * A small self-contained semver implementation is used deliberately: the base
 * SDK is dependency-light and framework-neutral, so it takes on no runtime
 * dependency (not even `semver`). It supports the range styles plugin authors
 * actually declare: exact versions, `*`/`x`, caret (`^`), tilde (`~`),
 * comparators (`>=`, `>`, `<=`, `<`, `=`), space-joined AND, and `||` OR.
 * Prereleases compare per semver ordering (a prerelease is lower than its
 * release), so `1.0.0-rc.25` satisfies `>=1.0.0-rc.0` but not `^1.0.0`.
 */

import type { PluginHost, SdkPluginMeta } from 'triiiceratops';

interface SemVer {
    major: number;
    minor: number;
    patch: number;
    prerelease: Array<string | number>;
}

type Op = '<' | '<=' | '>' | '>=' | '=';

interface Comparator {
    op: Op;
    ver: SemVer;
}

const VERSION_RE =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;

function parseVersion(raw: string): SemVer | null {
    const match = VERSION_RE.exec(raw.trim());
    if (!match) return null;
    const [, major, minor, patch, pre] = match;
    const prerelease = pre
        ? pre.split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id))
        : [];
    return {
        major: Number(major),
        minor: Number(minor),
        patch: Number(patch),
        prerelease,
    };
}

function compareMain(a: SemVer, b: SemVer): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function comparePrerelease(a: SemVer, b: SemVer): number {
    // A version without a prerelease outranks one with a prerelease.
    if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
    if (a.prerelease.length === 0) return 1;
    if (b.prerelease.length === 0) return -1;

    const len = Math.max(a.prerelease.length, b.prerelease.length);
    for (let i = 0; i < len; i++) {
        const x = a.prerelease[i];
        const y = b.prerelease[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        if (x === y) continue;
        const xNum = typeof x === 'number';
        const yNum = typeof y === 'number';
        if (xNum && yNum) return x < y ? -1 : 1;
        // Numeric identifiers always have lower precedence than alphanumeric.
        if (xNum) return -1;
        if (yNum) return 1;
        return String(x) < String(y) ? -1 : 1;
    }
    return 0;
}

function compareVersions(a: SemVer, b: SemVer): number {
    return compareMain(a, b) || comparePrerelease(a, b);
}

function caretUpperBound(v: SemVer): SemVer {
    if (v.major > 0)
        return { major: v.major + 1, minor: 0, patch: 0, prerelease: [] };
    if (v.minor > 0)
        return { major: 0, minor: v.minor + 1, patch: 0, prerelease: [] };
    return { major: 0, minor: 0, patch: v.patch + 1, prerelease: [] };
}

function expandComparator(token: string): Comparator[] | null {
    if (token === '' || token === '*' || token === 'x' || token === 'X') {
        return []; // matches anything
    }

    let m: RegExpExecArray | null;

    if ((m = /^\^\s*(.+)$/.exec(token))) {
        const v = parseVersion(m[1] ?? '');
        if (!v) return null;
        return [
            { op: '>=', ver: v },
            { op: '<', ver: caretUpperBound(v) },
        ];
    }

    if ((m = /^~\s*(.+)$/.exec(token))) {
        const v = parseVersion(m[1] ?? '');
        if (!v) return null;
        return [
            { op: '>=', ver: v },
            {
                op: '<',
                ver: {
                    major: v.major,
                    minor: v.minor + 1,
                    patch: 0,
                    prerelease: [],
                },
            },
        ];
    }

    if ((m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(token))) {
        const v = parseVersion(m[2] ?? '');
        if (!v) return null;
        return [{ op: (m[1] ?? '=') as Op, ver: v }];
    }

    return null;
}

function testComparator(v: SemVer, c: Comparator): boolean {
    const cmp = compareVersions(v, c.ver);
    switch (c.op) {
        case '<':
            return cmp < 0;
        case '<=':
            return cmp <= 0;
        case '>':
            return cmp > 0;
        case '>=':
            return cmp >= 0;
        case '=':
            return cmp === 0;
    }
}

function satisfiesSet(v: SemVer, set: string): boolean {
    const trimmed = set.trim();
    if (trimmed === '' || trimmed === '*' || trimmed === 'x') return true;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        const comparators = expandComparator(token);
        if (comparators === null) return false; // unparseable comparator
        if (!comparators.every((c) => testComparator(v, c))) return false;
    }
    return true;
}

/**
 * Does `version` satisfy the npm-style `range`? Returns `false` for an
 * unparseable version. An empty range matches any version.
 */
export function satisfies(version: string, range: string): boolean {
    const v = parseVersion(version);
    if (!v) return false;

    const orSets = range
        .split('||')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (orSets.length === 0) return true;

    return orSets.some((set) => satisfiesSet(v, set));
}

/** A single failed compatibility check. */
export interface PluginCompatibilityReason {
    kind: 'core' | 'pluginApi' | 'capability';
    /** The plugin's declared requirement (range or capability id). */
    required: string;
    /** What the host actually provides. */
    actual: string;
    /** Human-readable, actionable explanation. */
    message: string;
}

/**
 * Structured, actionable error thrown when a plugin cannot activate against the
 * host. Carries every failed check so a host/UI can render precise guidance,
 * routed through the `pluginerror` channel.
 */
export class PluginCompatibilityError extends Error {
    readonly code = 'PLUGIN_INCOMPATIBLE' as const;
    readonly pluginName: string;
    readonly pluginVersion: string;
    readonly reasons: readonly PluginCompatibilityReason[];

    constructor(
        pluginName: string,
        pluginVersion: string,
        reasons: readonly PluginCompatibilityReason[],
    ) {
        super(formatMessage(pluginName, pluginVersion, reasons));
        this.name = 'PluginCompatibilityError';
        this.pluginName = pluginName;
        this.pluginVersion = pluginVersion;
        this.reasons = reasons;
        // Restore prototype chain for instanceof across transpilation targets.
        Object.setPrototypeOf(this, PluginCompatibilityError.prototype);
    }
}

function formatMessage(
    name: string,
    version: string,
    reasons: readonly PluginCompatibilityReason[],
): string {
    const details = reasons.map((r) => `  - ${r.message}`).join('\n');
    return (
        `Plugin "${name}"@${version} cannot activate — incompatible with this ` +
        `viewer:\n${details}\n` +
        `Update the plugin or the core viewer so their declared ranges and ` +
        `capabilities overlap.`
    );
}

/**
 * Check a plugin's declared requirements against the host. Returns the list of
 * failed checks (empty when fully compatible).
 */
export function collectIncompatibilities(
    plugin: SdkPluginMeta,
    host: PluginHost,
): PluginCompatibilityReason[] {
    const reasons: PluginCompatibilityReason[] = [];

    if (!satisfies(host.coreVersion, plugin.coreRange)) {
        reasons.push({
            kind: 'core',
            required: plugin.coreRange,
            actual: host.coreVersion,
            message: `requires core ${plugin.coreRange} but this viewer is core ${host.coreVersion}`,
        });
    }

    if (!satisfies(host.pluginApiVersion, plugin.pluginApiRange)) {
        reasons.push({
            kind: 'pluginApi',
            required: plugin.pluginApiRange,
            actual: host.pluginApiVersion,
            message: `requires plugin API ${plugin.pluginApiRange} but this viewer provides plugin API ${host.pluginApiVersion}`,
        });
    }

    const hostCapabilities = new Set(host.capabilities);
    for (const capability of plugin.requiredCapabilities) {
        if (!hostCapabilities.has(capability)) {
            reasons.push({
                kind: 'capability',
                required: capability,
                actual: host.capabilities.join(', ') || '(none)',
                message: `requires capability "${capability}" which this viewer does not provide (has: ${host.capabilities.join(', ') || 'none'})`,
            });
        }
    }

    return reasons;
}

/**
 * Negotiate compatibility, throwing a {@link PluginCompatibilityError} when the
 * plugin cannot activate against the host.
 */
export function negotiateCompatibility(
    plugin: SdkPluginMeta,
    host: PluginHost,
): void {
    const reasons = collectIncompatibilities(plugin, host);
    if (reasons.length > 0) {
        throw new PluginCompatibilityError(
            plugin.name,
            plugin.version,
            reasons,
        );
    }
}
