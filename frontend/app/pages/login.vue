<script setup lang="ts">
definePageMeta({ middleware: ['guest'] });

const { login } = useAuth();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const handleLogin = async () => {
  error.value = '';
  loading.value = true;
  try {
    await login(email.value, password.value);
    await navigateTo('/dashboard');
  } catch {
    error.value = 'Invalid credentials.';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="layout">

    <!-- Brand panel -->
    <aside class="brand">
      <div class="brand-glow" />
      <div class="brand-content">
        <span class="brand-tag">Auth Reference</span>
        <h1 class="brand-title">
          <span>SIGN</span>
          <span class="brand-title-accent">IN</span>
        </h1>
        <p class="brand-stack">
          Symfony 8 × Nuxt 4<br>
          JWT + Google OAuth<br>
          BFF architecture
        </p>
        <div class="brand-lines">
          <span class="brand-line brand-line--accent" />
          <span class="brand-line" style="--w: 72%" />
          <span class="brand-line" style="--w: 50%" />
          <span class="brand-line" style="--w: 34%" />
          <span class="brand-line" style="--w: 20%" />
        </div>
      </div>
    </aside>

    <!-- Form panel -->
    <main class="panel">
      <div class="form-wrap">
        <p class="form-kicker">— access terminal</p>

        <form @submit.prevent="handleLogin" class="form">
          <div class="field">
            <label class="field-label">EMAIL</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="field-input"
            />
          </div>

          <div class="field">
            <label class="field-label">PASSWORD</label>
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••••••"
              class="field-input"
            />
          </div>

          <p v-if="error" class="error-msg">{{ error }}</p>

          <button type="submit" class="btn-primary" :class="{ 'btn-loading': loading }" :disabled="loading">
            <span>{{ loading ? 'VERIFYING…' : 'LOG IN' }}</span>
            <span class="btn-arrow">→</span>
          </button>
        </form>

        <div class="divider"><span>or</span></div>

        <!-- Plain <a> — browser must navigate for OAuth redirect, not $fetch -->
        <a href="/api/auth/google" class="btn-google">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </a>
      </div>
    </main>

  </div>
</template>

<style scoped>
/* Layout */
.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
}

/* Brand panel */
.brand {
  background: var(--bg);
  border-right: 1px solid var(--border);
  display: flex;
  align-items: flex-end;
  padding: 3.5rem;
  position: relative;
  overflow: hidden;
}

.brand-glow {
  position: absolute;
  top: -15%;
  right: -20%;
  width: 65%;
  height: 65%;
  background: radial-gradient(ellipse, rgba(0, 212, 170, 0.07) 0%, transparent 65%);
  pointer-events: none;
}

.brand-content {
  position: relative;
  z-index: 1;
}

.brand-tag {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 2rem;
}

.brand-title {
  font-family: var(--font-display);
  font-size: clamp(5.5rem, 10vw, 9.5rem);
  line-height: 0.82;
  display: flex;
  flex-direction: column;
  margin-bottom: 2.5rem;
}

.brand-title-accent {
  color: var(--accent);
  padding-left: 1.5rem;
}

.brand-stack {
  font-size: 11px;
  line-height: 2.1;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  margin-bottom: 3rem;
}

.brand-lines {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.brand-line {
  display: block;
  height: 1px;
  background: var(--border);
  width: var(--w, 88%);
}

.brand-line--accent {
  background: var(--accent);
  opacity: 0.6;
  width: 88%;
}

/* Form panel */
.panel {
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3.5rem;
}

.form-wrap {
  width: 100%;
  max-width: 340px;
}

.form-kicker {
  font-size: 11px;
  letter-spacing: 0.15em;
  color: var(--text-muted);
  margin-bottom: 3rem;
}

/* Form */
.form {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-bottom: 2rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--text-muted);
}

.field-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 14px;
  padding: 0.65rem 0;
  outline: none;
  width: 100%;
  transition: border-color 0.2s;
}

.field-input::placeholder {
  color: var(--text-muted);
  opacity: 0.45;
}

.field-input:focus {
  border-bottom-color: var(--accent);
}

.error-msg {
  font-size: 11px;
  color: var(--danger);
  letter-spacing: 0.06em;
  margin-top: -0.75rem;
}

/* Primary button */
.btn-primary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 0.9rem 1.25rem;
  font-size: 12px;
  letter-spacing: 0.18em;
  font-weight: 500;
  margin-top: 0.5rem;
  transition: opacity 0.2s, transform 0.15s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.88;
  transform: translateX(3px);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-arrow {
  font-size: 16px;
  transition: transform 0.2s;
}

.btn-primary:hover:not(:disabled) .btn-arrow {
  transform: translateX(4px);
}

/* Divider */
.divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.75rem 0;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.12em;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* Google button */
.btn-google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  border: 1px solid var(--border);
  padding: 0.85rem;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--text);
  transition: border-color 0.2s, background 0.2s;
}

.btn-google:hover {
  border-color: var(--text-muted);
  background: var(--surface-2);
}

/* Responsive */
@media (max-width: 768px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .brand {
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 2.5rem;
  }

  .brand-title {
    font-size: 5.5rem;
  }

  .panel {
    padding: 2.5rem;
  }
}
</style>