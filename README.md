# Symfony + Nuxt 4 JWT Authentication with Google OAuth

A reference implementation of secure JWT authentication using the **BFF (Backend for Frontend) pattern** — Symfony 8 as the auth authority, Nuxt 4 as a server-side proxy that keeps tokens in HTTP-only cookies. Client JavaScript never touches JWTs.

## Architecture

```
Browser ──► Nuxt (Nitro proxy) ──► Symfony API
                │                       │
                │  jwt + jwt_refresh    │
                │  HTTP-only cookies    │
                │◄──────────────────────│
                │                       │
                ▼                       ▼
          Cookie jar              PostgreSQL / Redis
```

**Key principles:**
- HTTP-only cookies prevent XSS token theft (no localStorage)
- Server-side proxy eliminates CORS issues — browser only talks to the Nuxt domain
- Token refresh is fully transparent — the proxy auto-refreshes on 401, client never handles expiry
- Google OAuth tokens pass through a one-time Redis code (60s TTL), never exposed in browser history
- Same cookie structure for both login methods — downstream logic is provider-agnostic

### Auth Flows

**Credential login:** Browser → Nuxt `/api/auth/login` → Symfony `/api/login_check` → JWT + refresh token → HTTP-only cookies

**Google OAuth:** Browser → Nuxt `/api/auth/google` → Symfony `/connect/google` → Google consent → Symfony stores tokens in Redis behind one-time code → redirect to Nuxt callback → exchange code → HTTP-only cookies

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Symfony 8, PHP 8.5-FPM |
| Frontend | Nuxt 4 (Vue 3 + Nitro) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 (OAuth codes, refresh tokens) |
| Web server | Nginx 1.27 (reverse proxy for both services) |
| JWT | `lexik/jwt-authentication-bundle` |
| Refresh tokens | `gesdinet/jwt-refresh-token-bundle` |
| OAuth | `knpuniversity/oauth2-client-bundle` + `league/oauth2-google` |

## Project Structure

```
├── backend/                  # Symfony application
│   └── src/
│       ├── Controller/
│       │   ├── GoogleController.php    # OAuth flow + code exchange
│       │   ├── UserController.php      # /api/me endpoint
│       │   └── AdminController.php     # Admin endpoints
│       └── Entity/
│           ├── User.php
│           └── RefreshToken.php
├── frontend/                 # Nuxt 4 application
│   ├── app/
│   │   ├── composables/useAuth.ts      # Auth state + fetchUser
│   │   ├── middleware/
│   │   │   ├── auth.global.ts          # Route guard (opt-out model)
│   │   │   └── guest.ts               # Guest-only pages
│   │   └── pages/
│   │       ├── login.vue
│   │       ├── dashboard.vue
│   │       └── admin/users.vue
│   └── server/
│       ├── api/
│       │   ├── [...proxy].ts           # BFF proxy with auto-refresh
│       │   └── auth/
│       │       ├── login.post.ts       # Credential login
│       │       ├── logout.post.ts      # Logout
│       │       ├── google.get.ts       # OAuth redirect
│       │       └── google/callback.get.ts  # OAuth callback
│       └── utils/cookie.ts             # Shared cookie options
├── docker/
│   ├── php/Dockerfile                  # PHP 8.5-FPM + extensions
│   ├── php/php.ini                     # OPcache, JIT, UTC
│   └── nginx/default.conf             # Dual vhost config
├── docs/
│   ├── symfony-nuxt4-jwt-oauth-auth.md # Full architecture guide
│   └── implementation-plan.md          # Step-by-step dev guide
├── docker-compose.yml                  # 5 services
├── Makefile                            # Dev shortcuts
└── .env.example                        # All env vars documented
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Google OAuth credentials ([Google Cloud Console](https://console.cloud.google.com/apis/credentials)) — optional, only needed for Google login

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/symfony-jwt-nuxt-auth.git
cd symfony-jwt-nuxt-auth
cp .env.example .env
```

Edit `.env` with your database password, JWT passphrase, and (optionally) Google OAuth credentials.

### 2. Add local domains to `/etc/hosts`

```
127.0.0.1  sfl.test sfl-api.test
```

### 3. Start services

```bash
make build
make up
```

### 4. Install dependencies and set up the backend

```bash
# Install Composer packages
make composer CMD="install"

# Generate JWT keys
make jwt-keys

# Run database migrations
make db-migrate
```

### 5. Create a test user

```bash
make console CMD="app:create-user"
```

Or create one manually via Symfony console.

### 6. Access the app

| URL | Service |
|-----|---------|
| `http://sfl.test` | Nuxt frontend |
| `http://sfl-api.test` | Symfony API |

## Makefile Commands

```
make help          # Show all commands
make up            # Start services
make down          # Stop services
make logs          # Follow all logs
make php           # Shell into PHP container
make node          # Shell into Node container
make jwt-keys      # Generate JWT keypair
make db-migrate    # Run migrations
make db-reset      # Drop + recreate + migrate (dev only)
```

## Security Design

- **No tokens in JavaScript** — JWTs live in HTTP-only, SameSite=Lax cookies
- **Secure flag** is environment-driven (`NODE_ENV === 'production'`)
- **Route protection is opt-out** — all routes are protected by default; explicitly whitelist public routes
- **Login body validation** — only `username` and `password` are forwarded to Symfony
- **OAuth one-time codes** — tokens never appear in URLs or browser history
- **Concurrent refresh safety** — module-level lock Map deduplicates in-flight token refreshes
- **SSR cookie forwarding** — `useRequestHeaders(['cookie'])` prevents auth loops during server-side rendering

## Documentation

The `docs/` directory contains detailed guides:

- **[Architecture Guide](docs/symfony-nuxt4-jwt-oauth-auth.md)** — complete auth flow diagrams, design decisions, and implementation details
- **[Implementation Plan](docs/implementation-plan.md)** — step-by-step development guide

## License

MIT
