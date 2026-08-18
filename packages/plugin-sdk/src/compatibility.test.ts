// Compatibility negotiation: the three range styles the SDK implements, and the
// loud refusal of every other one.
//
// The refusal is the load-bearing case. `satisfies` answers a boolean, so a
// range style it did not understand could only ever answer `false` — which core
// would present as "this plugin is incompatible with this viewer" and take a
// working plugin off the page for a reason that is not true. Throwing routes the
// authoring mistake to the host's `pluginerror` channel naming the range.

import { describe, expect, it } from 'vitest';

import { runActivation } from './activate.js';
import {
    PluginCompatibilityError,
    negotiateCompatibility,
    satisfies,
} from './compatibility.js';
import {
    createStubLocaleService,
    createStubStyleService,
    createStubSurfaceService,
    createStubUiService,
} from './testing/stubs.js';
import type {
    PluginErrorReport,
    PluginHost,
    SdkPluginMeta,
    ViewerState,
} from 'triiiceratops';

const CORE = '1.0.0-rc.36';

describe('satisfies — exact pin', () => {
    it('matches only that version', () => {
        expect(satisfies(CORE, CORE)).toBe(true);
        expect(satisfies('1.0.0-rc.37', CORE)).toBe(false);
        expect(satisfies('1.0.0', CORE)).toBe(false);
        expect(satisfies('2.0.0', CORE)).toBe(false);
    });
});

describe('satisfies — caret range', () => {
    it('accepts up to the next major', () => {
        expect(satisfies('1.2.0', '^1.2.0')).toBe(true);
        expect(satisfies('1.9.9', '^1.2.0')).toBe(true);
        expect(satisfies('1.1.9', '^1.2.0')).toBe(false);
        expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
    });

    it('treats a 0.x minor as the breaking boundary', () => {
        expect(satisfies('0.2.5', '^0.2.0')).toBe(true);
        expect(satisfies('0.3.0', '^0.2.0')).toBe(false);
    });

    // A prerelease is lower than its release, so a caret on the release does not
    // let an rc in — the rule `@triiiceratops/plugin-av`'s exact pin relies on.
    it('excludes a prerelease of the lower bound', () => {
        expect(satisfies('1.0.0-rc.36', '^1.0.0')).toBe(false);
        expect(satisfies('1.0.0', '^1.0.0')).toBe(true);
    });
});

describe('satisfies — `>=` lower bound', () => {
    it('accepts anything at or above the bound, prereleases ordered', () => {
        expect(satisfies(CORE, '>=1.0.0-rc.0')).toBe(true);
        expect(satisfies('1.0.0', '>=1.0.0-rc.0')).toBe(true);
        expect(satisfies('99.0.0', '>=1.0.0-rc.0')).toBe(true);
        expect(satisfies('0.9.0', '>=1.0.0-rc.0')).toBe(false);
        expect(satisfies('1.0.0-rc.36', '>=1.0.0')).toBe(false);
    });

    it('tolerates whitespace after the operator', () => {
        expect(satisfies('1.2.3', '>= 1.0.0')).toBe(true);
        expect(satisfies('1.2.3', '^ 1.0.0')).toBe(true);
    });
});

describe('satisfies — an unparseable version', () => {
    it('answers false rather than throwing', () => {
        expect(satisfies('not-a-version', '>=1.0.0')).toBe(false);
        expect(satisfies('', '>=1.0.0')).toBe(false);
    });
});

describe('satisfies — an unsupported range', () => {
    // Every style the SDK deliberately does not implement. None of these may
    // answer `false`: a wrong "incompatible" is indistinguishable from a real one.
    const unsupported = [
        '',
        '*',
        'x',
        'X',
        '1.x',
        '~1.0.0',
        '>1.0.0',
        '<2.0.0',
        '<=1.0.0',
        '=1.0.0',
        '1.0',
        '^1.0.0 || ^2.0.0',
        '>=1.0.0 <2.0.0',
        'latest',
    ];

    for (const range of unsupported) {
        it(`throws for ${JSON.stringify(range)}`, () => {
            expect(() => satisfies('1.2.3', range)).toThrow(
                /Unsupported version range/,
            );
        });
    }

    // A plain-JS plugin that omits or typos `coreRange` arrives here with
    // `undefined`, which must take the named refusal rather than a `TypeError`.
    it('throws for a non-string range', () => {
        expect(() =>
            satisfies('1.2.3', undefined as unknown as string),
        ).toThrow(/Unsupported version range/);
    });

    it('names the offending range and the three styles that work', () => {
        let message = '';
        try {
            satisfies('1.2.3', '~1.0.0');
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).toContain('"~1.0.0"');
        expect(message).toContain('^1.2.3');
        expect(message).toContain('>=1.2.3');
    });
});

// ---------------------------------------------------------------------------
// Negotiation
// ---------------------------------------------------------------------------

const viewerState = {
    subscribe: () => () => {},
} as unknown as ViewerState;

function makeMeta(overrides: Partial<SdkPluginMeta> = {}): SdkPluginMeta {
    return {
        name: '@triiiceratops/plugin-compat-test',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: { kind: 'svg', inner: '', viewBox: '0 0 1 1' },
        target: 'panel',
        view: { mount: () => () => {} },
        ...overrides,
    };
}

function makeHost(
    overrides: Partial<PluginHost> = {},
    report: (r: PluginErrorReport) => void = () => {},
): PluginHost {
    return {
        container: document.createElement('div'),
        viewerState,
        coreVersion: CORE,
        pluginApiVersion: '1.2.0',
        capabilities: ['canvas-claim'],
        styles: createStubStyleService(),
        locale: createStubLocaleService(),
        ui: createStubUiService(),
        surface: createStubSurfaceService('compat-test'),
        reportError: report,
        ...overrides,
    };
}

describe('negotiateCompatibility', () => {
    it('passes silently for a compatible plugin', () => {
        expect(() =>
            negotiateCompatibility(
                makeMeta({ requiredCapabilities: ['canvas-claim'] }),
                makeHost(),
            ),
        ).not.toThrow();
    });

    it('names the failed core range in one formatted error', () => {
        let thrown: unknown;
        try {
            negotiateCompatibility(
                makeMeta({ coreRange: '^99.0.0' }),
                makeHost(),
            );
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(PluginCompatibilityError);
        const error = thrown as PluginCompatibilityError;
        expect(error.code).toBe('PLUGIN_INCOMPATIBLE');
        expect(error.pluginName).toBe('@triiiceratops/plugin-compat-test');
        expect(error.message).toContain('^99.0.0');
        expect(error.message).toContain(CORE);
    });

    it('collects every failed check into the one message', () => {
        let message = '';
        try {
            negotiateCompatibility(
                makeMeta({
                    pluginApiRange: '^9.0.0',
                    requiredCapabilities: ['canvas-claim', 'does-not-exist'],
                }),
                makeHost(),
            );
        } catch (error) {
            message = (error as Error).message;
        }

        expect(message).toContain('^9.0.0');
        expect(message).toContain('does-not-exist');
        // The capability the host DOES provide is not reported as a failure.
        expect(message).not.toContain('"canvas-claim"');
    });
});

describe('an unsupported declared range at activation', () => {
    it('is reported as a setup failure naming the range, and nothing mounts', () => {
        const reports: PluginErrorReport[] = [];
        let mounted = false;

        const activation = runActivation(
            makeMeta({
                coreRange: '~1.0.0',
                view: {
                    mount: () => {
                        mounted = true;
                        return () => {};
                    },
                },
            }),
            makeHost({}, (report) => reports.push(report)),
        );

        expect(reports).toHaveLength(1);
        expect(reports[0]?.phase).toBe('setup');
        expect((reports[0]?.error as Error).message).toContain(
            'Unsupported version range "~1.0.0"',
        );
        expect(mounted).toBe(false);

        // The inert handle a failed setup returns is still safe to deactivate.
        expect(() => activation.deactivate()).not.toThrow();
    });
});
