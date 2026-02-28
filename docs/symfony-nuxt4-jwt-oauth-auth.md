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

Don't store JWTs in `localStorage` — it's XSS-vulnerable. Instead, create a **Nitro server route** that proxies the login and sets an HTTP-only cookie:

```ts
// server/api/auth/login.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const response = await $fetch('https://your-api.com/api/login_check', {
    method: 'POST',
    body,
  });

  // Set HTTP-only cookie — JS can't read it, but it's sent with every request
  setCookie(event, 'jwt', response.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60, // match your token TTL
    path: '/',
  });

  if (response.refresh_token) {
    setCookie(event, 'jwt_refresh', response.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  return { success: true };
});
```

#### 2. Proxy API calls through Nitro (attach token server-side)

The proxy attaches the JWT to every Symfony request. On 401, it automatically attempts to refresh the token using `jwt_refresh` cookie and retries the original request — transparent to the caller.

`readBody` is read before the first fetch because the request body is a stream that can only be consumed once; the cached value is reused on retry.

```ts
// server/api/[...proxy].ts
import { FetchError } from 'ofetch';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const jwt = getCookie(event, 'jwt');

  const path = getRouterParam(event, 'proxy');
  const query = getQuery(event);

  const method = event.method as string;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = hasBody ? await readBody(event) : undefined;

  const makeRequest = (token: string | undefined) =>
    $fetch(`${config.apiBaseUrl}/api/${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        'Content-Type': 'application/json',
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
        const refreshed = await $fetch<{ token: string; refresh_token?: string }>(
          `${config.apiBaseUrl}/api/token/refresh`,
          { method: 'POST', body: { refresh_token: refreshToken } },
        );

        setCookie(event, 'jwt', refreshed.token, {
          httpOnly: true, secure: false, sameSite: 'lax', maxAge: 60 * 60, path: '/',
        });

        if (refreshed.refresh_token) {
          setCookie(event, 'jwt_refresh', refreshed.refresh_token, {
            httpOnly: true, secure: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
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
export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null);

  const login = async (email: string, password: string) => {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username: email, password },
    });
    await fetchUser();
  };

  const fetchUser = async () => {
    try {
      // useRequestHeaders forwards browser cookies to internal Nitro $fetch during SSR.
      // Without this, the proxy can't read the jwt cookie server-side → Symfony 401 → redirect loop.
      user.value = await $fetch('/api/me', {
        headers: useRequestHeaders(['cookie']),
      });
    } catch {
      user.value = null;
    }
  };

  const logout = async () => {
    await $fetch('/api/auth/logout', { method: 'POST' });
    user.value = null;
    navigateTo('/login');
  };

  return { user, login, logout, fetchUser };
};
```

#### 4. Auth middleware

```ts
// middleware/auth.global.ts
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser } = useAuth();

  if (!user.value) {
    await fetchUser();
  }

  const publicRoutes = ['/login', '/register'];
  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login');
  }
});
```

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

#### 5. Token refresh (server route)

```ts
// server/api/auth/refresh.post.ts
export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, 'jwt_refresh');
  if (!refreshToken) throw createError({ statusCode: 401 });

  const response = await $fetch('https://your-api.com/api/token/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });

  setCookie(event, 'jwt', response.token, {
    httpOnly: true, secure: true, sameSite: 'lax',
    maxAge: 60 * 60, path: '/',
  });

  return { success: true };
});
```

This endpoint exists as a manual escape hatch (e.g. explicit "extend session" button). Automatic refresh on expired JWT is handled transparently by the proxy — see section 2 above.

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
  // Just redirect the browser to Symfony's OAuth start
  return sendRedirect(event, 'https://your-api.com/connect/google');
});
```

#### Handle the callback

```ts
// server/api/auth/google/callback.get.ts
export default defineEventHandler(async (event) => {
  const { code } = getQuery(event);

  if (!code) {
    return sendRedirect(event, '/login?error=missing_code');
  }

  try {
    // Exchange the one-time code for JWT + refresh token
    const response = await $fetch<{ token: string; refresh_token?: string }>(
      'https://your-api.com/api/auth/exchange-code',
      { method: 'POST', body: { code } },
    );

    // Set the same HTTP-only cookies as regular login
    setCookie(event, 'jwt', response.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });

    if (response.refresh_token) {
      setCookie(event, 'jwt_refresh', response.refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
    }

    return sendRedirect(event, '/dashboard');
  } catch {
    return sendRedirect(event, '/login?error=oauth_failed');
  }
});
```

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
