declare const process: { env: Record<string, string | undefined> };
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    // Server-only (not exposed to the browser)
    apiBaseUrl: process.env.NUXT_API_BASE_URL ?? 'http://nginx',
    // Separate from apiBaseUrl: Google rejects .test TLDs, so OAuth redirects use localhost.
    oauthBaseUrl: process.env.NUXT_OAUTH_BASE_URL ?? 'http://localhost',

    // Exposed to a client via useRuntimeConfig().public.*
    public: {
      appUrl: process.env.NUXT_URL ?? 'http://sfl.test',
    },
  },
})
