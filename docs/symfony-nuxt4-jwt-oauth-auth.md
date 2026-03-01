# JWT Auth & Google OAuth: Symfony Backend → Nuxt 4 Frontend

A complete guide to implementing JWT authentication with a BFF (Backend for Frontend) pattern, plus Google OAuth integration.

---

## Part 1: JWT Authentication

### Backend Side (Symfony)

Assuming you're using `lexik/jwt-authentication-bundle` — your login endpoint returns something like:

```json
POST /api/login_check
{ "username": "...", "password": "..." }

→ { "token": "eyJ...", "refresh_token": "..." }
```

If you haven't added refresh tokens yet, strongly consider `gesdinet/jwt-refresh-token-bundle` — without it, users get logged out every time the token expires.

### Nuxt 4 Side

Nuxt 4 (built on Nitro + Vue 3) doesn't have a de facto auth module like Nuxt 2 had. The cleanest approach is a composable + server-side proxy pattern.

#### 1. Store tokens in HTTP-only cookies (secure approach)

Don't store JWTs in `localStorage` — it's XSS-vulnerable. Instead, create a **Nitro server route** that proxies the login and sets an HTTP-only cookie.

First, centralize cookie options in a shared utility so every handler stays consistent:

```ts
// server/utils/cookie.ts
export const jwtCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});
```

Nitro auto-imports everything from `server/utils/`, so no explicit import is needed.

Then the login route destructures only the expected fields before forwarding — never pass the raw client body to Symfony:

```ts
// server/api/auth/login.post.ts
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { username, password } = await readBody(event);

  const response = await $fetch<{ token: string; refresh_token?: string }>(
    `${config.apiBaseUrl}/api/login_check`,
    { method: 'POST', body: { username, password } },
  );

  setCookie(event, 'jwt', response.token, {
    ...jwtCookieOptions(),
    maxAge: 60 * 60,
  });

  if (response.refresh_token) {
    setCookie(event, 'jwt_refresh', response.refresh_token, {
      ...jwtCookieOptions(),
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return { success: true };
});
```

#### 2. Proxy API calls through Nitro (attach token server-side)

The proxy attaches the JWT to every Symfony request. On 401, it automatically attempts to refresh the token using `jwt_refresh` cookie and retries the original request — transparent to the caller.

Key implementation details:
- `readBody` is read before the first fetch because the request body is a stream that can only be consumed once; the cached value is reused on retry.
- `Content-Type: application/json` is only sent when there is a body — some strict backends reject it on GET/DELETE requests.
- A module-level `refreshLocks` Map deduplicates concurrent refresh attempts. If two parallel requests both get 401, only one actual refresh call is made; the second awaits the same Promise. This prevents a race condition where `gesdinet` rotates the refresh token on first use, causing the second concurrent refresh to fail.

```ts
// server/api/[...proxy].ts
import { FetchError } from 'ofetch';

const refreshLocks = new Map<string, Promise<{ token: string; refresh_token?: string }>>();

function doRefresh(apiBaseUrl: string, refreshToken: string) {
  const existing = refreshLocks.get(refreshToken);
  if (existing) return existing;

  const promise = $fetch<{ token: string; refresh_token?: string }>(
    `${apiBaseUrl}/api/token/refresh`,
    { method: 'POST', body: { refresh_token: refreshToken } },
  ).finally(() => refreshLocks.delete(refreshToken));

  refreshLocks.set(refreshToken, promise);
  return promise;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const jwt = getCookie(event, 'jwt');

  const path = getRouterParam(event, 'proxy');
  const query = getQuery(event);

  const method = event.method;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = hasBody ? await readBody(event) : undefined;

  const makeRequest = (token: string | undefined): Promise<unknown> =>
    $fetch(`${config.apiBaseUrl}/api/${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(hasBody && { 'Content-Type': 'application/json' }),
      },
      query,
      body,
    });

  try {
    return await makeRequest(jwt);
  } catch (err) {
    if (err instanceof FetchError && err.response?.status === 401) {
      const refreshToken = getCookie(event, 'jwt_refresh');
      if (!refreshToken) throw createError({ statusCode: 401, data: err.data });

      try {
        const refreshed = await doRefresh(config.apiBaseUrl, refreshToken);

        setCookie(event, 'jwt', refreshed.token, {
          ...jwtCookieOptions(),
          maxAge: 60 * 60,
        });

        if (refreshed.refresh_token) {
          setCookie(event, 'jwt_refresh', refreshed.refresh_token, {
            ...jwtCookieOptions(),
            maxAge: 60 * 60 * 24 * 30,
          });
        }

        return await makeRequest(refreshed.token);
      } catch {
        throw createError({ statusCode: 401 });
      }
    }

    if (err instanceof FetchError && err.response) {
      throw createError({ statusCode: err.response.status, data: err.data });
    }
    throw err;
  }
});
```

This way your frontend never sees or handles the raw JWT, and sessions are automatically extended without any client-side logic.

#### 3. Auth composable

```ts
// composables/useAuth.ts
interface User {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
}

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null);

  const fetchUser = async () => {
    try {
      // useRequestHeaders forwards browser cookies to internal Nitro $fetch during SSR.
      // Without this, the proxy can't read the jwt cookie server-side → Symfony 401 → redirect loop.
      user.value = await $fetch<User>('/api/me', {
        headers: useRequestHeaders(['cookie']),
      });
    } catch {
      user.value = null;
    }
  };

  const login = async (email: string, password: string) => {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username: email, password },
    });
    await fetchUser();
  };

  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      user.value = null;
      await navigateTo('/login');
    }
  };

  return { user, login, logout, fetchUser };
};
```

The `logout` uses `try/finally` so the user is always redirected and state is cleared, even if the server call fails (e.g. network error).

#### 4. Auth middleware

```ts
// middleware/auth.global.ts
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser } = useAuth();
  const initialized = useState<boolean>('auth_initialized', () => false);

  if (!initialized.value) {
    await fetchUser();
    initialized.value = true;
  }

  const publicRoutes = ['/login'];
  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login');
  }
});
```

The `auth_initialized` flag ensures `fetchUser()` runs exactly once per SSR/client lifecycle — without it, unauthenticated users trigger a server round-trip on every route navigation.

**Model dostępu:** domyślna ochrona (opt-out) — każda strona wymaga zalogowania, chyba że jest jawnie wymieniona w `publicRoutes`. Aby dodać publiczną stronę, wystarczy dopisać jej ścieżkę do tablicy.

Alternatywnie, przy dużej liczbie publicznych stron, można użyć `definePageMeta` per-strona zamiast centralnej tablicy:

```ts
// pages/regulamin.vue — deklaracja na poziomie strony
definePageMeta({ auth: false })
```

```ts
// middleware/auth.global.ts — czytanie meta danych
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.meta.auth === false) return; // strona jawnie publiczna

  const { user, fetchUser } = useAuth();
  if (!user.value) await fetchUser();
  if (!user.value) return navigateTo('/login');
});
```

#### 5. Token refresh

Token refresh is handled entirely inside the proxy (section 2 above) — there is no separate `/api/auth/refresh` route. The proxy's `doRefresh` function handles everything transparently, including deduplication of concurrent refresh attempts via the `refreshLocks` Map. No client-side code is needed.

### Why this pattern?

- **SSR-compatible** — cookies are available in Nitro server-side context, but internal `$fetch` calls (e.g. from middleware) do **not** forward them automatically. You must pass `headers: useRequestHeaders(['cookie'])` explicitly — otherwise the proxy has no JWT and Symfony returns 401, causing a redirect loop back to `/login` even when the user is authenticated
- **Secure** — JWT never touches client JS (`httpOnly`), eliminating XSS token theft
- **Transparent token refresh** — when JWT expires, the proxy automatically refreshes it via `jwt_refresh` cookie and retries the original request; the browser never sees a 401 and no client-side logic is needed
- **Simple** — no extra auth libraries needed, just Nitro routes + a composable
- **CORS-free** — the browser talks to Nuxt's own domain, Nitro talks to Symfony server-to-server

This is basically the BFF (Backend for Frontend) pattern, which is the recommended approach for SPAs/SSR apps talking to token-based APIs.

---

## Part 2: Adding Google OAuth

The idea: keep the entire OAuth dance on the server side (Symfony handles it), and Nuxt just redirects the user and catches the result.

### Flow Overview

```
Browser → Nuxt /api/auth/google → redirect to Symfony /connect/google
→ Symfony redirects to Google → user consents
→ Google redirects back to Symfony /connect/google/check
→ Symfony creates/finds user, generates JWT + refresh token
→ Symfony stores both tokens in Redis behind a short-lived one-time code
→ Symfony redirects to Nuxt callback with the code
→ Nuxt exchanges code → sets jwt + jwt_refresh cookies → redirects to app
```

### 1. Symfony Side — `knpuniversity/oauth2-client-bundle`

```bash
composer require knpuniversity/oauth2-client-bundle league/oauth2-google
```

```yaml
# config/packages/knpu_oauth2_client.yaml
knpu_oauth2_client:
  clients:
    google:
      type: google
      client_id: '%env(GOOGLE_CLIENT_ID)%'
      client_secret: '%env(GOOGLE_CLIENT_SECRET)%'
      redirect_route: connect_google_check
      access_type: online
```

#### Controller

```php
// src/Controller/GoogleController.php
use Gesdinet\JWTRefreshTokenBundle\Generator\RefreshTokenGeneratorInterface;

class GoogleController extends AbstractController
{
    public function __construct(
        private CacheItemPoolInterface $oauthCodesCache,
        private RefreshTokenGeneratorInterface $refreshTokenGenerator,
        #[Autowire(param: 'gesdinet_jwt_refresh_token.ttl')]
        private int $refreshTokenTtl,
        #[Autowire(env: 'NUXT_URL')]
        private string $nuxtUrl,
    ) {}

    #[Route('/connect/google', name: 'connect_google_start')]
    public function connect(ClientRegistry $clientRegistry): RedirectResponse
    {
        return $clientRegistry->getClient('google')->redirect(['openid', 'email', 'profile'], []);
    }

    #[Route('/connect/google/check', name: 'connect_google_check')]
    public function check(
        Request $request,
        ClientRegistry $clientRegistry,
        EntityManagerInterface $em,
        JWTTokenManagerInterface $jwtManager,
    ): RedirectResponse {
        $client     = $clientRegistry->getClient('google');
        $googleUser = $client->fetchUser();

        $user = $em->getRepository(User::class)
            ->findOneBy(['email' => $googleUser->getEmail()]);

        if (!$user) {
            $user = new User();
            $user->setEmail($googleUser->getEmail());
            $user->setName($googleUser->getName());
            $user->setGoogleId($googleUser->getId());
            $em->persist($user);
            $em->flush();
        } elseif ($user->getGoogleId() === null) {
            $user->setGoogleId($googleUser->getId());
            $em->flush();
        }

        // Generate JWT and refresh token — same result as standard /api/login_check
        $jwt          = $jwtManager->create($user);
        $refreshToken = $this->refreshTokenGenerator->createForUserWithTtl($user, $this->refreshTokenTtl);

        // Store both tokens in Redis behind a 60-second one-time code
        // (avoids putting raw tokens in a URL that could leak via browser history/referrer)
        $code = bin2hex(random_bytes(32));
        $item = $this->oauthCodesCache->getItem("oauth_code_{$code}");
        $item->set([
            'token'         => $jwt,
            'refresh_token' => $refreshToken->getRefreshToken(),
        ])->expiresAfter(60);
        $this->oauthCodesCache->save($item);

        return new RedirectResponse($this->nuxtUrl . '/api/auth/google/callback?code=' . $code);
    }

    #[Route('/api/auth/exchange-code', name: 'exchange_oauth_code', methods: ['POST'])]
    public function exchangeCode(Request $request): JsonResponse
    {
        $code = $request->getPayload()->get('code');
        if (!$code) {
            return new JsonResponse(['error' => 'Missing code'], 400);
        }

        $item = $this->oauthCodesCache->getItem("oauth_code_{$code}");
        if (!$item->isHit()) {
            return new JsonResponse(['error' => 'Invalid or expired code'], 401);
        }

        $data = $item->get();
        $this->oauthCodesCache->deleteItem("oauth_code_{$code}"); // one-time use

        return new JsonResponse([
            'token'         => $data['token'],
            'refresh_token' => $data['refresh_token'],
        ]);
    }
}
```

The one-time code pattern avoids putting raw tokens in a URL that could leak through browser history or referrer headers. Both the JWT and refresh token are generated upfront and stored together in Redis under the code key.

### 2. Nuxt Side

#### Initiate the flow

```ts
// server/api/auth/google.get.ts
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  // oauthBaseUrl must be http://localhost (not sfl-api.test) because Google rejects .test TLDs.
  // Nginx routes unmatched server_name requests to the first vhost (Symfony).
  return sendRedirect(event, `${config.oauthBaseUrl}/connect/google`, 302);
});
```

The `oauthBaseUrl` is a separate server-only runtime config key (`NUXT_OAUTH_BASE_URL`, defaults to `http://localhost`), distinct from `apiBaseUrl`, because Google rejects `.test` TLD redirect URIs.

#### Handle the callback

```ts
// server/api/auth/google/callback.get.ts
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { code } = getQuery(event);

  if (!code || typeof code !== 'string') {
    return sendRedirect(event, '/login?error=missing_code');
  }

  try {
    const response = await $fetch<{ token: string; refresh_token?: string }>(
      `${config.apiBaseUrl}/api/auth/exchange-code`,
      { method: 'POST', body: { code } },
    );

    setCookie(event, 'jwt', response.token, {
      ...jwtCookieOptions(),
      maxAge: 60 * 60,
    });

    if (response.refresh_token) {
      setCookie(event, 'jwt_refresh', response.refresh_token, {
        ...jwtCookieOptions(),
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return sendRedirect(event, '/dashboard');
  } catch (err) {
    console.error('[OAuth callback] Code exchange failed:', err);
    return sendRedirect(event, '/login?error=oauth_failed');
  }
});
```

Note the `catch (err)` — always log OAuth errors server-side before redirecting. A bare `catch {}` makes debugging production OAuth issues nearly impossible.

#### Login page button

```vue
<!-- pages/login.vue -->
<template>
  <div>
    <form @submit.prevent="handleLogin">
      <!-- existing email/password form -->
    </form>

    <a href="/api/auth/google" class="google-btn">
      Sign in with Google
    </a>
  </div>
</template>
```

It's a plain `<a>` link, not a `$fetch` — the user needs to physically navigate through Google's consent screen.

### Why This Pattern Works

The key insight is that **nothing changes in your existing Nuxt auth setup**. The Google flow ends up setting the same `jwt` and `jwt_refresh` HTTP-only cookies as regular form login. After that, the proxy, composable, middleware, and token refresh — everything works identically regardless of how the user authenticated.

The `RefreshTokenGeneratorInterface` from `gesdinet/jwt-refresh-token-bundle` handles programmatic token creation (unique hex string, DB persistence) using the same TTL configured in `gesdinet_jwt_refresh_token.yaml`. The `#[Autowire(param: 'gesdinet_jwt_refresh_token.ttl')]` attribute pulls the configured value directly, so there's no duplication.

To add more providers (GitHub, Facebook, etc.), you just repeat the Symfony side with a new `knpu_oauth2_client` entry and add a matching pair of Nuxt routes (`/api/auth/{provider}` + `/api/auth/{provider}/callback`). The cookie-setting logic stays the same.
