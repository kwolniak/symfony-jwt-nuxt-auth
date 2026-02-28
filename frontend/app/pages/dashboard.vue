<script setup lang="ts">
const { user, logout } = useAuth();

const initials = computed(() => {
  if (!user.value) return '??';
  const name = user.value.name ?? user.value.email;
  return name
    .split(/[\s@.]+/)
    .map((p: string) => p[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
});
</script>

<template>
  <div class="dash">

    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-brand">
        <span class="topbar-dot" />
        sfl.test
      </div>
      <div class="topbar-right">
        <div class="user-chip">
          <span class="user-avatar">{{ initials }}</span>
          <span class="user-email">{{ user?.email }}</span>
        </div>
        <button class="logout-btn" @click="logout">LOGOUT →</button>
      </div>
    </header>

    <!-- Main -->
    <main class="main">

      <!-- Hero -->
      <section class="hero">
        <p class="hero-kicker">— authenticated session</p>
        <h1 class="hero-heading">
          HELLO,<br>
          <span class="hero-name">{{ user?.name ?? user?.email }}</span>
        </h1>
      </section>

      <!-- Info cards -->
      <div class="cards">
        <div class="card">
          <span class="card-label">IDENTITY</span>
          <span class="card-value">{{ user?.email }}</span>
          <span class="card-sub">{{ user?.name ?? '—' }}</span>
        </div>

        <div class="card">
          <span class="card-label">ROLES</span>
          <div class="card-value card-roles">
            <span v-for="role in user?.roles" :key="role" class="role-tag">
              {{ role }}
            </span>
          </div>
        </div>

        <div class="card card--lit">
          <span class="card-label">SESSION</span>
          <span class="card-value">ACTIVE</span>
          <span class="card-pulse">
            <span class="pulse-dot" />
            JWT authenticated
          </span>
        </div>
      </div>

    </main>
  </div>
</template>

<style scoped>
.dash {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

/* Topbar */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 3rem;
  border-bottom: 1px solid var(--border);
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.topbar-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--accent);
  letter-spacing: 0;
  flex-shrink: 0;
}

.user-email {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.logout-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.18em;
  padding: 0.4rem 0;
  transition: color 0.2s;
}

.logout-btn:hover {
  color: var(--danger);
}

/* Main */
.main {
  flex: 1;
  padding: 5rem 3rem;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
}

/* Hero */
.hero {
  margin-bottom: 5rem;
}

.hero-kicker {
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--accent);
  margin-bottom: 1.5rem;
}

.hero-heading {
  font-family: var(--font-display);
  font-size: clamp(4rem, 8vw, 8rem);
  line-height: 0.85;
  color: var(--text);
}

.hero-name {
  color: var(--accent);
}

/* Cards */
.cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
}

.card {
  background: var(--surface);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card--lit {
  background: var(--accent-dim);
}

.card-label {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--text-muted);
}

.card-value {
  font-size: 14px;
  color: var(--text);
}

.card-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.card-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.role-tag {
  font-size: 10px;
  letter-spacing: 0.1em;
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--border);
  color: var(--accent);
}

.card-pulse {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 11px;
  color: var(--accent);
  letter-spacing: 0.06em;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 2s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.35; transform: scale(0.75); }
}

/* Responsive */
@media (max-width: 768px) {
  .topbar { padding: 1rem 1.5rem; }
  .user-email { display: none; }
  .main { padding: 3rem 1.5rem; }
  .cards { grid-template-columns: 1fr; }
}
</style>