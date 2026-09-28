// Shared CSP-fixture helpers.

/** Collect `securitypolicyviolation` events; call before `page.goto`. */
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

/** Format violations for assertion output. */
export function formatViolations(violations) {
    return violations
        .map(
            (v) =>
                `${v.directive} blocked=${v.blockedURI} sample="${v.sample}" @ ${v.sourceFile}:${v.lineNumber}`,
        )
        .join('\n');
}
