// Shared CSP-fixture helpers (ticket 24).
//
// The CSP fixtures deliver a strict Content-Security-Policy via a
// `<meta http-equiv>` in their HTML and assert that the packed viewer + plugins
// run under it with ZERO `securitypolicyviolation` events. This helper collects
// those events into the page before navigation.

/**
 * Register a `securitypolicyviolation` collector as an init script (so it is
 * installed before the page's own scripts run) and return the collected list on
 * demand. Call BEFORE `page.goto`.
 */
export async function collectCspViolations(page) {
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (e) => {
            window.__cspViolations.push({
                directive: e.violatedDirective,
                blockedURI: e.blockedURI,
                sample: (e.sample || '').slice(0, 80),
                sourceFile: e.sourceFile,
                lineNumber: e.lineNumber,
            });
        });
    });
    return {
        async read() {
            return page.evaluate(() => window.__cspViolations ?? []);
        },
    };
}

/** Format collected violations into a readable assertion message. */
export function formatViolations(violations) {
    return violations
        .map(
            (v) =>
                `${v.directive} blocked=${v.blockedURI} sample="${v.sample}" @ ${v.sourceFile}:${v.lineNumber}`,
        )
        .join('\n');
}
