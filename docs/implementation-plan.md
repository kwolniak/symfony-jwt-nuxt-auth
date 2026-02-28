# Symfony 8 + Nuxt 4 JWT Auth — Implementation Plan

A step-by-step guide to building and running the full stack locally with Docker.
All commands run inside Docker containers — no local PHP or Node installation required.

**Source architecture guide:** `docs/symfony-nuxt4-jwt-oauth-auth.md`

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Directory Structure](#2-directory-structure)
3. [One-Time Host Setup (Local Domains)](#3-one-time-host-setup-local-domains)
4. [Docker Environment](#4-docker-environment)
5. [Symfony 8 Installation](#5-symfony-8-installation)
6. [Database & User Entity](#6-database--user-entity)
7. [JWT Authentication](#7-jwt-authentication)
8. [Refresh Tokens](#8-refresh-tokens)
9. [Security Configuration](#9-security-configuration)
10. [CORS](#10-cors)
11. [Google OAuth](#11-google-oauth)
12. [Redis Cache for OAuth Codes](#12-redis-cache-for-oauth-codes)
13. [Nuxt 4 Installation](#13-nuxt-4-installation)
14. [Nuxt Server Routes](#14-nuxt-server-routes)
15. [Composable & Middleware](#15-composable--middleware)
16. [Pages](#16-pages)
17. [End-to-End Testing](#17-end-to-end-testing)
18. [Environment Variables Reference](#18-environment-variables-reference)

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker Desktop | 4.x+ | Container runtime |
| Docker Compose | v2 (bundled) | Multi-container orchestration |
| Google Cloud account | — | OAuth credentials |

No local PHP, Composer, or Node is needed — everything runs inside the containers.

---

## 2. Directory Structure

```
symfony-jwt-nuxt-auth/
├── backend/                   # Symfony 8 application (created in step 5)
├── frontend/                  # Nuxt 4 application (created in step 13)
├── docker/
│   ├── php/
│   │   ├── Dockerfile         # PHP 8.5-FPM image
│   │   └── php.ini            # Custom PHP config
│   └── nginx/
│       └── default.conf       # Two vhosts: sfl-api.test + sfl.test
├── docker-compose.yml
├── .env                       # Local secrets (not committed)
├── .env.example               # Template (committed)
└── docs/
    ├── symfony-nuxt4-jwt-oauth-auth.md
    └── implementation-plan.md (this file)
```

---

## 3. One-Time Host Setup (Local Domains)

We use `.test` TLD (IETF-reserved per RFC 6761) to avoid conflicts with real domains.

| Domain | Target |
|--------|--------|
| `sfl-api.test` | Symfony backend (Nginx → PHP-FPM) |
| `sfl.test` | Nuxt frontend (Nginx → Node :3000) |

### Add to /etc/hosts

```bash
sudo sh -c 'echo "127.0.0.1 sfl-api.test sfl.test" >> /etc/hosts'
```

Verify:
```bash
ping -c1 sfl-api.test   # should return 127.0.0.1
```

> **Alternative (wildcard, no hosts file):** Use dnsmasq — once set up, every `*.test` domain
> resolves automatically with no per-project `/etc/hosts` edits.

#### dnsmasq wildcard setup (macOS)

**Step 1 — Install dnsmasq**

```bash
brew install dnsmasq
```

**Step 2 — Configure dnsmasq for `.test`**

```bash
echo "address=/.test/127.0.0.1" >> $(brew --prefix)/etc/dnsmasq.conf
```

**Step 3 — Start the service**

```bash
sudo brew services start dnsmasq
```

**Step 4 — Create a macOS resolver** (the step most guides skip)

macOS won't use dnsmasq unless you tell it to via a resolver file:

```bash
sudo mkdir -p /etc/resolver
sudo bash -c 'echo "nameserver 127.0.0.1" > /etc/resolver/test'
```

**Step 5 — Verify**

```bash
ping -c 3 anything.test   # should reply from 127.0.0.1
```

From now on every `*.test` domain resolves locally — no further `/etc/hosts` edits needed.

---

## 4. Docker Environment

### 4.1 Copy and configure .env

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, JWT_PASSPHRASE, GOOGLE_CLIENT_ID/SECRET
```

### 4.2 Build and start containers

```bash
docker compose up -d --build
```

### 4.3 Verify all services are healthy

```bash
docker compose ps
```

Expected output — all services `running` or `healthy`:

```
NAME           STATUS          PORTS
sfl_nginx      running         0.0.0.0:80->80/tcp
sfl_php        running         9000/tcp
sfl_postgres   healthy         5432/tcp
sfl_redis      healthy         6379/tcp
sfl_node       running         3000/tcp
```

### 4.4 Confirm PHP version

```bash
docker compose exec php php -v
# PHP 8.5.x (fpm-fcgi)
```

### 4.5 Confirm Redis

```bash
docker compose exec redis redis-cli ping
# PONG
```

---

## 5. Symfony 8 Installation

All Composer commands run inside the `php` container.

### 5.1 Create the Symfony project

```bash
docker compose exec php composer create-project symfony/skeleton:"8.0.*" .
```

> The `.` installs into the current `WORKDIR` (`/app/backend`), which is bind-mounted to `./backend/` on your host.

### 5.2 Install required bundles

```bash
docker compose exec php composer require \
  symfony/orm-pack \
  lexik/jwt-authentication-bundle:"^3.2" \
  gesdinet/jwt-refresh-token-bundle:"^2.0" \
  knpuniversity/oauth2-client-bundle:"^2.20" \
  league/oauth2-google \
  nelmio/cors-bundle \
  symfony/cache \
  predis/predis

# Dev tools
docker compose exec php composer require --dev \
  symfony/maker-bundle \
  doctrine/doctrine-fixtures-bundle
```

### 5.3 Run database migrations skeleton

```bash
docker compose exec php php bin/console doctrine:database:create --if-not-exists
```

---

## 6. Database & User Entity

### 6.1 Generate the User entity

```bash
docker compose exec php php bin/console make:user
```

Respond to prompts:
- Class name: `User`
- Store in database: `yes`
- Unique display name property: `email`
- Hash passwords: `yes` (even for OAuth-only users, leave a random hash)

### 6.2 Add OAuth fields to the entity

Edit `backend/src/Entity/User.php` and add these properties:

```php
#[ORM\Column(length: 255, nullable: true)]
private ?string $googleId = null;

#[ORM\Column(length: 255, nullable: true)]
private ?string $name = null;

#[ORM\Column(length: 255, unique: true)]
private string $email;
```

Add corresponding getters/setters (or run `make:entity User` to add fields interactively).

### 6.3 Full User entity example

```php
<?php
// backend/src/Entity/User.php

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: '`user`')]
#[ORM\UniqueConstraint(name: 'UNIQ_IDENTIFIER_EMAIL', fields: ['email'])]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 180, unique: true)]
    private string $email;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $name = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $googleId = null;

    /** @var list<string> */
    #[ORM\Column]
    private array $roles = [];

    #[ORM\Column(nullable: true)]
    private ?string $password = null;

    public function getId(): ?int { return $this->id; }

    public function getEmail(): string { return $this->email; }
    public function setEmail(string $email): static { $this->email = $email; return $this; }

    public function getName(): ?string { return $this->name; }
    public function setName(?string $name): static { $this->name = $name; return $this; }

    public function getGoogleId(): ?string { return $this->googleId; }
    public function setGoogleId(?string $googleId): static { $this->googleId = $googleId; return $this; }

    public function getUserIdentifier(): string { return $this->email; }

    public function getRoles(): array
    {
        $roles = $this->roles;
        $roles[] = 'ROLE_USER';
        return array_unique($roles);
    }

    public function setRoles(array $roles): static { $this->roles = $roles; return $this; }

    public function getPassword(): ?string { return $this->password; }
    public function setPassword(?string $password): static { $this->password = $password; return $this; }

    public function eraseCredentials(): void {}
}
```

### 6.4 Generate and run the migration

```bash
docker compose exec php php bin/console make:migration
docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction
```

### 6.5 Create a test user (optional fixture)

```php
// backend/src/DataFixtures/UserFixtures.php
<?php

namespace App\DataFixtures;

use App\Entity\User;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class UserFixtures extends Fixture
{
    public function __construct(private UserPasswordHasherInterface $hasher) {}

    public function load(ObjectManager $manager): void
    {
        $user = new User();
        $user->setEmail('test@example.com');
        $user->setName('Test User');
        $user->setPassword($this->hasher->hashPassword($user, 'password'));
        $manager->persist($user);
        $manager->flush();
    }
}
```

```bash
docker compose exec php php bin/console doctrine:fixtures:load --no-interaction
```

---

## 7. JWT Authentication

### 7.1 Generate RSA key pair

```bash
docker compose exec php php bin/console lexik:jwt:generate-keypair
# Creates backend/config/jwt/private.pem and public.pem
```

### 7.2 `config/packages/lexik_jwt_authentication.yaml`

```yaml
lexik_jwt_authentication:
    secret_key: '%env(resolve:JWT_SECRET_KEY)%'
    public_key: '%env(resolve:JWT_PUBLIC_KEY)%'
    pass_phrase: '%env(JWT_PASSPHRASE)%'
    token_ttl: 3600  # 1 hour

    # Token extracted from Authorization: Bearer header
    token_extractors:
        authorization_header:
            enabled: true
            prefix: Bearer
            name: Authorization
```

### 7.3 Login endpoint

`lexik/jwt-authentication-bundle` auto-registers a JSON login listener at the route you configure in `security.yaml` (see step 9). No controller needed.

The request format:
```json
POST /api/login_check
Content-Type: application/json

{"username": "test@example.com", "password": "password"}
```

Response:
```json
{"token": "eyJ...", "refresh_token": "abc123..."}
```

---

## 8. Refresh Tokens

### 8.1 `config/packages/gesdinet_jwt_refresh_token.yaml`

```yaml
gesdinet_jwt_refresh_token:
    refresh_token_class: Gesdinet\JWTRefreshTokenBundle\Entity\RefreshToken
    ttl: 2592000          # 30 days
    ttl_update: true      # slide the window on each use
    token_parameter_name: refresh_token
```

### 8.2 Add the RefreshToken table

```bash
docker compose exec php php bin/console doctrine:migrations:diff
docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction
```

The refresh endpoint is auto-registered at `/api/token/refresh`:
```json
POST /api/token/refresh
{"refresh_token": "abc123..."}
→ {"token": "eyJ...", "refresh_token": "new_token..."}
```

---

## 9. Security Configuration

### `config/packages/security.yaml`

```yaml
security:
    password_hashers:
        App\Entity\User:
            algorithm: auto

    providers:
        app_user_provider:
            entity:
                class: App\Entity\User
                property: email

    firewalls:
        dev:
            pattern: ^/(_(profiler|wdt)|css|images|js)/
            security: false

        # Public login + refresh endpoints — no auth required
        login:
            pattern: ^/api/login_check
            stateless: true
            json_login:
                check_path: /api/login_check
                success_handler: lexik_jwt_authentication.handler.authentication_success
                failure_handler: lexik_jwt_authentication.handler.authentication_failure

        refresh:
            pattern: ^/api/token/refresh
            stateless: true

        # Google OAuth routes — publicly accessible
        oauth:
            pattern: ^/connect/
            security: false

        # Code exchange endpoint — no JWT required (it IS the exchange)
        exchange:
            pattern: ^/api/auth/exchange-code
            stateless: true

        # All other /api/* routes require a valid JWT
        api:
            pattern: ^/api/
            stateless: true
            jwt: ~

    access_control:
        - { path: ^/api/login_check, roles: PUBLIC_ACCESS }
        - { path: ^/api/token/refresh, roles: PUBLIC_ACCESS }
        - { path: ^/api/auth/exchange-code, roles: PUBLIC_ACCESS }
        - { path: ^/connect/, roles: PUBLIC_ACCESS }
        - { path: ^/api/, roles: ROLE_USER }
```

> **Load order matters.** Symfony matches firewalls top-to-bottom and uses the first match. The `login`, `refresh`, `oauth`, and `exchange` firewalls must appear before the catch-all `api` firewall.

---

## 10. CORS

### `config/packages/nelmio_cors.yaml`

```yaml
nelmio_cors:
    defaults:
        origin_regex: true
        allow_origin: ['%env(CORS_ALLOW_ORIGIN)%']
        allow_methods: ['GET', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']
        allow_headers: ['Content-Type', 'Authorization']
        expose_headers: []
        max_age: 3600
    paths:
        '^/api/':
            allow_credentials: true
        '^/connect/':
            allow_credentials: false
```

With the BFF pattern the browser only talks to Nuxt, so CORS primarily matters for direct API testing tools (curl, Postman). The `CORS_ALLOW_ORIGIN` env var is set to `^https?://sfl\.test$` in `.env`.

---

## 11. Google OAuth

### 11.1 Install bundles (already done in step 5.2)

### 11.2 `config/packages/knpu_oauth2_client.yaml`

```yaml
knpu_oauth2_client:
    clients:
        google:
            type: google
            client_id: '%env(GOOGLE_CLIENT_ID)%'
            client_secret: '%env(GOOGLE_CLIENT_SECRET)%'
            redirect_route: connect_google_check
            access_type: online
```

### 11.3 `backend/src/Controller/GoogleController.php`

```php
<?php

namespace App\Controller;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Gesdinet\JWTRefreshTokenBundle\Generator\RefreshTokenGeneratorInterface;
use KnpU\OAuth2ClientBundle\Client\ClientRegistry;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

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
        return $clientRegistry
            ->getClient('google')
            ->redirect(['openid', 'email', 'profile'], []);
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

---

## 12. Redis Cache for OAuth Codes

### 12.1 `config/packages/cache.yaml`

```yaml
framework:
    cache:
        default_redis_provider: '%env(REDIS_URL)%'

        pools:
            oauth.codes:
                adapter: cache.adapter.redis
                provider: default_redis_provider
                default_lifetime: 60
```

### 12.2 Wire the pool in `config/services.yaml`

```yaml
services:
    _defaults:
        autowire: true
        autoconfigure: true

    App\:
        resource: '../src/'
        exclude:
            - '../src/DependencyInjection/'
            - '../src/Entity/'
            - '../src/Kernel.php'

    # Bind the named pool to the constructor parameter
    App\Controller\GoogleController:
        arguments:
            $oauthCodesCache: '@oauth.codes'
```

---

## 13. Nuxt 4 Installation

### 13.1 Create the project inside the container

```bash
docker compose exec node sh -c "npx nuxi@latest init . --no-install"
```

> `nuxi` scaffolds into the current working directory (`/app/frontend`).

### 13.2 Install dependencies

```bash
docker compose exec node npm install
```

### 13.3 `frontend/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  compatibilityDate: '2025-11-01',

  runtimeConfig: {
    // Server-only (not exposed to the browser)
    apiBaseUrl: process.env.NUXT_API_BASE_URL ?? 'http://nginx',

    // Exposed to client via useRuntimeConfig().public.*
    public: {
      appUrl: process.env.NUXT_URL ?? 'http://sfl.test',
    },
  },
});
```

---

## 14. Nuxt Server Routes

All files go in `frontend/server/api/`.

### 14.1 `server/api/auth/login.post.ts`

```ts
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const response = await $fetch<{ token: string; refresh_token?: string }>(
    `${config.apiBaseUrl}/api/login_check`,
    { method: 'POST', body },
  );

  setCookie(event, 'jwt', response.token, {
    httpOnly: true,
    secure: false, // set true when using HTTPS
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  });

  if (response.refresh_token) {
    setCookie(event, 'jwt_refresh', response.refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  return { success: true };
});
```

### 14.2 `server/api/auth/logout.post.ts`

```ts
export default defineEventHandler((event) => {
  const cookieOpts = { httpOnly: true, secure: false, sameSite: 'lax' as const, path: '/' };
  setCookie(event, 'jwt', '', { ...cookieOpts, maxAge: 0 });
  setCookie(event, 'jwt_refresh', '', { ...cookieOpts, maxAge: 0 });
  return { success: true };
});
```

### 14.3 `server/api/auth/refresh.post.ts`

```ts
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const refreshToken = getCookie(event, 'jwt_refresh');

  if (!refreshToken) throw createError({ statusCode: 401, message: 'No refresh token' });

  const response = await $fetch<{ token: string; refresh_token?: string }>(
    `${config.apiBaseUrl}/api/token/refresh`,
    { method: 'POST', body: { refresh_token: refreshToken } },
  );

  setCookie(event, 'jwt', response.token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  });

  if (response.refresh_token) {
    setCookie(event, 'jwt_refresh', response.refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  return { success: true };
});
```

### 14.4 `server/api/auth/google.get.ts`

```ts
export default defineEventHandler((event) => {
  // Redirect the browser to Symfony's OAuth initiation URL
  return sendRedirect(event, `${process.env.APP_URL ?? 'http://sfl-api.test'}/connect/google`, 302);
});
```

### 14.5 `server/api/auth/google/callback.get.ts`

```ts
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
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });

    if (response.refresh_token) {
      setCookie(event, 'jwt_refresh', response.refresh_token, {
        httpOnly: true,
        secure: false,
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

### 14.6 `server/api/[...proxy].ts` — BFF catch-all

Proxies all `/api/*` calls (except the `/api/auth/*` routes above) to Symfony, attaching the JWT from the HTTP-only cookie. On 401, automatically attempts to refresh the JWT using `jwt_refresh` cookie and retries the original request — transparent to the caller. Preserves other Symfony error status codes unchanged.

Note: `readBody(event)` is called once before any fetch — request body is a stream that can only be read once, so it must be cached for the potential retry.

```ts
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

---

## 15. Composable & Middleware

### 15.1 `frontend/composables/useAuth.ts`

```ts
interface User {
  id: number;
  email: string;
  name: string | null;
  roles: string[];
}

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null);

  const fetchUser = async () => {
    try {
      // useRequestHeaders forwards browser cookies to internal Nitro $fetch during SSR.
      // Without this, the proxy can't read the jwt cookie and Symfony returns 401.
      // On the client side, useRequestHeaders returns {} — no effect.
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
    await $fetch('/api/auth/logout', { method: 'POST' });
    user.value = null;
    await navigateTo('/login');
  };

  return { user, login, logout, fetchUser };
};
```

### 15.2 `frontend/middleware/auth.global.ts`

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser } = useAuth();

  if (!user.value) {
    await fetchUser();
  }

  const publicRoutes = ['/login'];
  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login');
  }
});
```

#### Model dostępu do stron

Middleware działa na zasadzie **domyślnej ochrony** (opt-out): każda strona wymaga zalogowania, chyba że jest jawnie wymieniona w `publicRoutes`.

```
publicRoutes = ['/login']

/login      → publiczna (wymieniona w tablicy)
/dashboard  → chroniona (nie ma jej w tablicy → redirect /login)
/profile    → chroniona (nie ma jej w tablicy → redirect /login)
/regulamin  → chroniona (nie ma jej w tablicy → redirect /login)
```

**Aby dodać publiczną stronę** — dopisz jej ścieżkę do tablicy:

```ts
const publicRoutes = ['/login', '/register', '/regulamin'];
```

**Aby strona wymagała logowania** — nie rób nic. Domyślnie każda trasa jest chroniona.

#### Alternatywa: `definePageMeta` per-strona

Przy większej liczbie publicznych stron wygodniejszy jest mechanizm oparty na meta danych strony. Zamiast utrzymywać centralną tablicę, każda publiczna strona deklaruje się sama:

```ts
// pages/regulamin.vue
definePageMeta({ auth: false })
```

Middleware czyta to przez `to.meta`:

```ts
// middleware/auth.global.ts
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.meta.auth === false) return; // strona jawnie publiczna

  const { user, fetchUser } = useAuth();
  if (!user.value) await fetchUser();
  if (!user.value) return navigateTo('/login');
});
```

| Podejście | Kiedy stosować |
|-----------|----------------|
| Tablica `publicRoutes` | Mało publicznych stron (login, rejestracja) |
| `definePageMeta({ auth: false })` | Dużo publicznych stron (blog, landing, regulamin) |

Bieżąca implementacja używa tablicy — prosta i wystarczająca dla typowego SaaS z jedną stroną logowania.

---

## 16. Pages

### 16.1 `frontend/pages/login.vue`

```vue
<script setup lang="ts">
const { login } = useAuth();

const email = ref('');
const password = ref('');
const error = ref('');

const handleLogin = async () => {
  error.value = '';
  try {
    await login(email.value, password.value);
    await navigateTo('/dashboard');
  } catch {
    error.value = 'Invalid credentials.';
  }
};
</script>

<template>
  <div class="login-page">
    <h1>Sign in</h1>

    <form @submit.prevent="handleLogin">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit">Login</button>
    </form>

    <!-- Plain <a> tag — the browser must navigate (not $fetch) for OAuth redirect -->
    <a href="/api/auth/google" class="google-btn">Sign in with Google</a>
  </div>
</template>
```

### 16.2 `frontend/pages/dashboard.vue`

```vue
<script setup lang="ts">
const { user, logout } = useAuth();
</script>

<template>
  <div class="dashboard">
    <h1>Dashboard</h1>
    <p>Hello, {{ user?.name ?? user?.email }}</p>
    <button @click="logout">Logout</button>
  </div>
</template>
```

### 16.3 Symfony `/api/me` endpoint

Add a simple controller so the Nuxt middleware can identify the logged-in user:

```php
<?php
// backend/src/Controller/UserController.php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

class UserController extends AbstractController
{
    #[Route('/api/me', name: 'api_me', methods: ['GET'])]
    public function me(): JsonResponse
    {
        $user = $this->getUser();
        return new JsonResponse([
            'id'    => $user->getUserIdentifier(),
            'email' => $user->getUserIdentifier(),
            'name'  => method_exists($user, 'getName') ? $user->getName() : null,
            'roles' => $user->getRoles(),
        ]);
    }
}
```

---

## 17. End-to-End Testing

### 17.1 JWT login via Symfony directly

```bash
# Should return {"token": "eyJ...", "refresh_token": "..."}
curl -X POST http://sfl-api.test/api/login_check \
  -H 'Content-Type: application/json' \
  -d '{"username":"test@example.com","password":"password"}'
```

### 17.2 Nuxt BFF login (sets HTTP-only cookie)

```bash
curl -v -X POST http://sfl.test/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"test@example.com","password":"password"}' \
  -c cookies.txt

# Expected response headers:
# Set-Cookie: jwt=eyJ...; HttpOnly; SameSite=Lax; Path=/
```

### 17.3 Protected API call via Nuxt proxy

```bash
curl http://sfl.test/api/me -b cookies.txt
# Expected: {"id":"...","email":"test@example.com","roles":["ROLE_USER"]}
```

### 17.4 Token refresh

```bash
curl -X POST http://sfl.test/api/auth/refresh \
  -b cookies.txt -c cookies.txt

# Expected: {"success":true}
# Also updates the jwt cookie
```

### 17.5 Logout

```bash
curl -X POST http://sfl.test/api/auth/logout -b cookies.txt -c cookies.txt

# JWT and jwt_refresh cookies are cleared (maxAge=0)
```

### 17.6 Protected route after logout

```bash
curl http://sfl.test/api/me -b cookies.txt
# Expected: 401
```

### 17.7 Google OAuth flow (manual browser test)

1. Navigate to `http://sfl.test/login`
2. Click **Sign in with Google** → browser follows `<a href="/api/auth/google">`
3. Nuxt route redirects to `http://localhost/connect/google` (APP_URL=http://localhost)
4. Nginx: no `server_name localhost` match → falls back to first block → Symfony PHP-FPM
5. Symfony initiates OAuth, sends Google: `redirect_uri=http://localhost/connect/google/check` ✓ accepted
6. User consents → Google redirects to `http://localhost/connect/google/check` → Nginx → Symfony
7. Symfony creates/finds user, issues JWT + refresh token, stores both in Redis with 60s one-time code
8. Symfony redirects to `http://sfl.test/api/auth/google/callback?code=<hex>`
9. Nuxt exchanges code, sets `jwt` (1h) and `jwt_refresh` (30d) cookies, redirects to `/dashboard`
10. Dashboard loads — authenticated!
11. Verify in browser DevTools → Application → Cookies: both `jwt` and `jwt_refresh` should be present and marked HttpOnly
12. Verify in DB: `SELECT * FROM refresh_tokens ORDER BY id DESC LIMIT 1;` — new row for the user

---

## 18. Environment Variables Reference

| Variable | Where used | Example value |
|----------|-----------|---------------|
| `POSTGRES_DB` | Docker Compose, Symfony | `app` |
| `POSTGRES_USER` | Docker Compose, Symfony | `app` |
| `POSTGRES_PASSWORD` | Docker Compose, Symfony | `secret` |
| `DATABASE_URL` | Symfony (`doctrine.yaml`) | `postgresql://app:secret@postgres:5432/app` |
| `JWT_SECRET_KEY` | Symfony (`lexik_jwt_authentication.yaml`) | `%kernel.project_dir%/config/jwt/private.pem` |
| `JWT_PUBLIC_KEY` | Symfony | `%kernel.project_dir%/config/jwt/public.pem` |
| `JWT_PASSPHRASE` | Symfony | `change_me` |
| `GOOGLE_CLIENT_ID` | Symfony (`knpu_oauth2_client.yaml`) | `123.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Symfony | `GOCSPX-...` |
| `APP_URL` | Symfony (redirect after OAuth), Nuxt google route | `http://localhost` (Google rejects `.test`) |
| `NUXT_URL` | Symfony (callback redirect) | `http://sfl.test` |
| `NUXT_API_BASE_URL` | Nuxt server routes (internal Docker) | `http://nginx` |
| `CORS_ALLOW_ORIGIN` | Symfony (`nelmio_cors.yaml`) | `^https?://sfl\.test$` |
| `REDIS_URL` | Symfony cache pool | `redis://redis:6379` |

### Google Cloud Console Setup

> **Important:** Google OAuth Console rejects non-public TLDs (`.test`, `.local`, etc.).
> Use `localhost` for local development — Google explicitly accepts loopback addresses.
> This works because Nginx routes requests with no matching `server_name` to the **first server
> block** in the config, which is `sfl-api.test` → Symfony PHP-FPM.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Set:
   - **Authorized JavaScript origins:** `http://localhost`
   - **Authorized redirect URIs:** `http://localhost/connect/google/check`
4. Copy the Client ID and Secret into your `.env`
5. In your `.env`, set `APP_URL=http://localhost` (not `http://sfl-api.test`)

The OAuth chain then becomes:
- Browser → `http://sfl.test/api/auth/google` → Nuxt redirects to `http://localhost/connect/google`
- Nginx (no `server_name` match → first block → Symfony) handles the request
- Symfony sends Google: `redirect_uri=http://localhost/connect/google/check` ✓ Google accepts it
- After consent → Google → `http://localhost/connect/google/check` → Symfony → one-time code
- Symfony → `http://sfl.test/api/auth/google/callback?code=...` → Nuxt sets cookie ✓

---

## Architecture Notes

### Why BFF (Backend for Frontend)?

The browser talks only to Nuxt's domain. Nitro server routes proxy everything to Symfony server-to-server. This means:
- **No CORS issues** — browser and API share the same origin from the browser's perspective
- **JWT never touches client JS** — XSS attacks can't steal tokens
- **SSR-compatible** — but requires care: internal `$fetch` calls during SSR (e.g. from middleware or composables) do **not** automatically forward the browser's cookies. Always pass `headers: useRequestHeaders(['cookie'])` when calling routes that depend on the JWT cookie server-side. Without it, the proxy receives no token, Symfony returns 401, and the middleware redirects the user to `/login` — even though they are authenticated and their cookies are present in the browser.

### SSR cookie forwarding pitfall

This is the most common gotcha in this architecture:

```
Browser GET /dashboard (Cookie: jwt=eyJ...)
  └─ Nuxt SSR middleware calls fetchUser()
       └─ $fetch('/api/me')               ← internal Nitro request, no cookies forwarded
            └─ proxy: getCookie('jwt') → undefined
            └─ Symfony: 401 Unauthorized
       └─ user = null → navigateTo('/login') ← redirect loop!
```

Fix: forward the browser's `Cookie` header to any internal server-side fetch:

```ts
user.value = await $fetch<User>('/api/me', {
  headers: useRequestHeaders(['cookie']),
});
```

`useRequestHeaders` reads from the current incoming Nitro request (the browser's original request). On the client side it returns `{}`, so the same code works in both environments.

### Why `sameSite: 'lax'` (not `'strict'`)?

`strict` would block the JWT cookie from being sent on cross-site navigations, including the final Google OAuth redirect from `localhost` back to `sfl.test`. `lax` allows cookies on top-level navigations (GET redirects) but blocks them on cross-site AJAX — a good balance.

### Why Redis for OAuth codes?

Redis has **native TTL support** — the code expires automatically after 60 seconds with no background garbage collection job. Using a one-time code also prevents the raw JWT from appearing in browser history or referrer headers (since the URL only ever contains a random hex string).

### Why PostgreSQL?

PostgreSQL is modern, well-supported by Doctrine, and handles Symfony's refresh token table without issues. The `postgres:16-alpine` image is lightweight while providing all needed features.
