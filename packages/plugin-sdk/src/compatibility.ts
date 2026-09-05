/**
 * Semver compatibility negotiation.
 *
 * A plugin declares `coreRange`, `pluginApiRange`, and `requiredCapabilities`.
 * At activation the SDK checks them against the host's declared `coreVersion`,
 * `pluginApiVersion`, and `capabilities` and, on any mismatch, throws an
 * actionable {@link PluginCompatibilityError} naming every failed check.
 *
 * A small self-contained semver implementation is used deliberately: the base
 * SDK is dependency-light and framework-neutral, and every byte here ships in
 * every plugin bundle, so it takes on no runtime dependency (not even `semver`)
 * and implements only the three range styles a plugin declares in practice —
 * an exact version, a caret range, and a `>=` lower bound. Anything else
 * (`~`, `*`, `=`, `>`, `<`, `<=`, a space-joined AND, a `||` OR set) is REFUSED
 * with a thrown error rather than answered, because the alternative to a narrow
 * implementation is not a broad one but a silently wrong one: a range style the
 * SDK does not understand would otherwise read as "incompatible" and take a
 * working plugin off the page with no explanation.
 *
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
    return (
        a.major - b.major ||
        a.minor - b.minor ||
        a.patch - b.patch ||
        comparePrerelease(a, b)
    );
}

function caretUpperBound(v: SemVer): SemVer {
    if (v.major > 0)
        return { major: v.major + 1, minor: 0, patch: 0, prerelease: [] };
    if (v.minor > 0)
        return { major: 0, minor: v.minor + 1, patch: 0, prerelease: [] };
    return { major: 0, minor: 0, patch: v.patch + 1, prerelease: [] };
}

/**
 * Does `version` satisfy `range`? Returns `false` for an unparseable version.
 *
 * `range` is one of exactly three styles — `1.2.3`, `^1.2.3`, `>=1.2.3`. Any
 * other syntax throws, and the throw is the point: see the module note. A range
 * that is not a string at all — a plain-JS plugin that omits or typos
 * `coreRange` — takes the same refusal rather than a `TypeError`.
 */
export function satisfies(version: string, range: string): boolean {
    const trimmed = typeof range === 'string' ? range.trim() : '';
    const caret = trimmed.startsWith('^');
    const lowerBound = trimmed.startsWith('>=');
    const bound = parseVersion(
        caret ? trimmed.slice(1) : lowerBound ? trimmed.slice(2) : trimmed,
    );
    if (!bound) {
        throw new Error(
            `Unsupported version range "${range}". A plugin declares an exact ` +
                `version ("1.2.3"), a caret range ("^1.2.3"), or a ">=" lower ` +
                `bound (">=1.2.3"); no other range syntax is supported.`,
        );
    }

    const v = parseVersion(version);
    if (!v) return false;

    const cmp = compareVersions(v, bound);
    if (lowerBound) return cmp >= 0;
    if (!caret) return cmp === 0;
    return cmp >= 0 && compareVersions(v, caretUpperBound(bound)) < 0;
}

/**
 * Actionable error thrown when a plugin cannot activate against the host. The
 * message names every failed check; core surfaces it verbatim on the
 * `pluginerror` channel.
 */
export class PluginCompatibilityError extends Error {
    readonly code = 'PLUGIN_INCOMPATIBLE' as const;
    readonly pluginName: string;
    readonly pluginVersion: string;

    constructor(
        pluginName: string,
        pluginVersion: string,
        failures: readonly string[],
    ) {
        super(
            `Plugin "${pluginName}"@${pluginVersion} cannot activate — ` +
                `incompatible with this viewer:\n` +
                failures.map((failure) => `  - ${failure}`).join('\n') +
                `\nUpdate the plugin or the core viewer so their declared ` +
                `ranges and capabilities overlap.`,
        );
        this.name = 'PluginCompatibilityError';
        this.pluginName = pluginName;
        this.pluginVersion = pluginVersion;
        // Restore prototype chain for instanceof across transpilation targets.
        Object.setPrototypeOf(this, PluginCompatibilityError.prototype);
    }
}

/**
 * Negotiate compatibility, throwing a {@link PluginCompatibilityError} when the
 * plugin cannot activate against the host.
 */
export function negotiateCompatibility(
    plugin: SdkPluginMeta,
    host: PluginHost,
): void {
    const failures: string[] = [];

    if (!satisfies(host.coreVersion, plugin.coreRange)) {
        failures.push(
            `requires core ${plugin.coreRange} but this viewer is core ${host.coreVersion}`,
        );
    }

    if (!satisfies(host.pluginApiVersion, plugin.pluginApiRange)) {
        failures.push(
            `requires plugin API ${plugin.pluginApiRange} but this viewer provides plugin API ${host.pluginApiVersion}`,
        );
    }

    const hostCapabilities = new Set(host.capabilities);
    for (const capability of plugin.requiredCapabilities) {
        if (!hostCapabilities.has(capability)) {
            failures.push(
                `requires capability "${capability}" which this viewer does not provide (has: ${host.capabilities.join(', ') || 'none'})`,
            );
        }
    }

    if (failures.length > 0) {
        throw new PluginCompatibilityError(
            plugin.name,
            plugin.version,
            failures,
        );
    }
}
