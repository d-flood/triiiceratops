/**
 * Chromium on the machine's real GPU, through Vulkan — shared by every
 * Playwright config in the repo.
 *
 * A software rasterizer is not the pipeline anyone ships to. The Canvas2D
 * renderer is the thing under test across most of `packages/core`'s suite, and
 * paint timing, tile upload cost and compositing all differ under SwiftShader,
 * so a run on it is measuring something else. Two parts are needed and neither
 * works alone:
 *
 *   - `channel: 'chromium'` selects the FULL browser. Playwright's default for
 *     headless Chromium is `chrome-headless-shell`, which has no GPU process at
 *     all and therefore rasterizes in software whatever flags it is handed.
 *   - the flags then point ANGLE at Vulkan and stop Chromium's blocklist from
 *     quietly falling back to software without saying so.
 *
 * To confirm it took, read `WEBGL_debug_renderer_info`'s unmasked renderer in a
 * launched browser: on this configuration it names ANGLE, Vulkan and the actual
 * device. Anything mentioning SwiftShader means the fallback happened.
 *
 * GitHub Actions runners have no GPU, so CI — and only CI — gets the default
 * software path. `CI` is the same switch the configs' retry and worker counts
 * already use.
 */
export const gpuChromium = process.env.CI
    ? {}
    : {
          channel: 'chromium' as const,
          launchOptions: {
              args: [
                  '--use-angle=vulkan',
                  '--enable-features=Vulkan',
                  '--ignore-gpu-blocklist',
                  '--enable-gpu-rasterization',
              ],
          },
      };
