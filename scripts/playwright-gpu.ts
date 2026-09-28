/** Chromium on the real GPU via Vulkan. Software fallback on CI, which has no GPU. */
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
