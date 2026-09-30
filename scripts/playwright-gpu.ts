import { chromium } from '@playwright/test';
import type { FullConfig, LaunchOptions } from '@playwright/test';

type BrowserName = 'chromium' | 'firefox' | 'webkit';

/**
 * GitHub Actions runs every browser in software. A local machine runs Chromium
 * only, on the GPU, verified before any test runs: headless Firefox and WebKit
 * on Linux paint on the CPU whatever the flags, and saturate every core.
 */
export const ON_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

const LOCAL_ONLY_CHROMIUM =
    'Firefox and WebKit run on GitHub Actions only; locally, only Chromium may run.';
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|lavapipe|softpipe|software/i;

export function launchOptions(browser: BrowserName): LaunchOptions {
    if (ON_GITHUB_ACTIONS) {
        return browser === 'chromium'
            ? {
                  args: [
                      '--use-gl=angle',
                      '--use-angle=swiftshader',
                      '--enable-unsafe-swiftshader',
                  ],
              }
            : {};
    }
    if (browser !== 'chromium') throw new Error(LOCAL_ONLY_CHROMIUM);
    return {
        channel: 'chromium',
        args: [
            '--use-angle=vulkan',
            '--enable-features=Vulkan',
            '--ignore-gpu-blocklist',
            '--enable-gpu-rasterization',
            '--disable-software-rasterizer',
        ],
    };
}

/** Fails unless local Chromium renders on the GPU. A no-op on GitHub Actions. */
export async function assertChromiumGpu() {
    if (ON_GITHUB_ACTIONS) return;
    const browser = await chromium.launch(launchOptions('chromium'));
    try {
        const page = await browser.newPage();
        const renderer = await page.evaluate(() => {
            const gl = document.createElement('canvas').getContext('webgl');
            if (!gl) return 'no WebGL';
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            return String(
                gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
            );
        });
        if (SOFTWARE_RENDERER.test(renderer) || renderer === 'no WebGL') {
            throw new Error(
                `Chromium is not rendering on the GPU (WebGL renderer: "${renderer}").`,
            );
        }
    } finally {
        await browser.close();
    }
}

export default async function globalSetup(config: FullConfig) {
    if (ON_GITHUB_ACTIONS) return;
    const forbidden = config.projects
        .filter(
            (p) =>
                (p.use.browserName ??
                    p.use.defaultBrowserType ??
                    'chromium') !== 'chromium',
        )
        .map((p) => p.name);
    if (forbidden.length) {
        throw new Error(
            `${LOCAL_ONLY_CHROMIUM} Found: ${forbidden.join(', ')}.`,
        );
    }
    await assertChromiumGpu();
}
