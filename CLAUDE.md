# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **reference architecture guide** for implementing secure JWT authentication with Google OAuth in a Symfony + Nuxt 4 stack. It contains documentation and code examples — not a running application.

The main guide lives at `docs/symfony-nuxt4-jwt-oauth-auth.md`.

## Tech Stack

- **Backend:** Symfony with `lexik/jwt-authentication-bundle`, `gesdinet/jwt-refresh-token-bundle`, `knpuniversity/oauth2-client-bundle`, `league/oauth2-google`
- **Frontend:** Nuxt 4 (Vue 3 + Nitro)
- **Auth pattern:** BFF (Backend for Frontend) — Nitro server proxies all API calls, JWT stored in HTTP-only cookies, client JS never touches tokens

## Architecture

### Authentication Flow (JWT)
Browser → Nuxt server route (`/api/auth/login`) → Symfony (`/api/login_check`) → JWT + refresh token returned → Nuxt sets `jwt` (1h) + `jwt_refresh` (30d) HTTP-only cookies → Nitro proxy attaches JWT to all subsequent API requests → on 401, proxy auto-refreshes via `jwt_refresh` and retries transparently

### Google OAuth Flow
Browser → Nuxt (`/api/auth/google`) → Symfony (`/connect/google`) → Google consent → Symfony generates JWT + refresh token → stores both in Redis behind one-time code (60s TTL) → redirects to Nuxt callback → Nuxt exchanges code → sets jwt + jwt_refresh HTTP-only cookies

### Key Design Decisions
- HTTP-only cookies prevent XSS token theft (no localStorage)
- Cookie `secure` flag is environment-driven (`process.env.NODE_ENV === 'production'`) — shared via `server/utils/cookie.ts` (`jwtCookieOptions()`) to avoid duplication
- Server-side proxy eliminates CORS issues (browser only talks to Nuxt domain)
- One-time authorization codes prevent JWT leakage via browser history/referrer headers
- Same cookie structure for both login methods — all downstream auth logic is provider-agnostic
- OAuth is delegated to Symfony (not Nuxt) because Symfony owns the user database and auth authority
- Route protection is opt-out: all routes are protected by default; add paths to `publicRoutes` in `middleware/auth.global.ts` to make them public
- Guest-only pages (e.g. login): use named middleware `middleware/guest.ts` + `definePageMeta({ middleware: ['guest'] })` on the page — redirects authenticated users to `/dashboard`; global middleware always runs first so `user` state is already populated, no extra `fetchUser()` needed
- Token refresh is fully server-side and transparent: proxy retries on 401, client never handles expiry
- Concurrent 401 refresh race prevented by module-level `refreshLocks` Map in proxy — deduplicates in-flight refresh calls keyed by refresh token value
- Auth middleware uses `auth_initialized` flag (`useState<boolean>`) so `fetchUser()` runs only once per SSR/client lifecycle, not on every navigation
- Login route validates/destructures body (`{ username, password }`) before forwarding — never passes raw client body to Symfony

## Token Refresh

Proxy (`frontend/server/api/[...proxy].ts`) automatycznie odświeża JWT przy 401: wywołuje Symfony `/api/token/refresh` z `jwt_refresh` cookie, ustawia nowe cookies i ponawia oryginalny request. Transparentne dla klienta. `readBody` czytany przed pierwszym fetchem (stream jednorazowy). Równoległe requesty 401 nie powodują wyścigu — `refreshLocks` Map deduplikuje in-flight refresh calls (jeden refresh na token, reszta czeka na wynik).

## Known Gotchas

- **SSR cookie forwarding** — `$fetch` inside composables/middleware does NOT forward browser cookies to internal Nitro routes during SSR. Always pass `headers: useRequestHeaders(['cookie'])` when the internal route depends on the `jwt` cookie (e.g. `fetchUser`). Without it: proxy gets no token → Symfony 401 → redirect loop even when user is authenticated.
- **Programmatic refresh tokens** — `gesdinet/jwt-refresh-token-bundle` only auto-generates refresh tokens via its event listener on `/api/login_check`. For custom endpoints (e.g. Google OAuth), inject `RefreshTokenGeneratorInterface` and call `->createForUserWithTtl($user, $ttl)`. Inject TTL with `#[Autowire(param: 'gesdinet_jwt_refresh_token.ttl')]` to avoid duplicating the value from config.
- **`readBody` is a one-time stream** — in `[...proxy].ts`, body must be read before the first `$fetch` call and stored in a variable; otherwise it's unavailable for the retry request on 401.
- **Cookie options shared via utility** — all cookie-setting handlers use `jwtCookieOptions()` from `server/utils/cookie.ts`. When adding new auth routes, always use this utility instead of inlining cookie options.
- **OAuth base URL** — Google rejects `.test` TLDs, so the OAuth redirect uses a separate `oauthBaseUrl` runtime config (`NUXT_OAUTH_BASE_URL`, defaults to `http://localhost`), distinct from `apiBaseUrl`.
