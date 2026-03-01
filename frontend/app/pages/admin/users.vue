<script setup lang="ts">
definePageMeta({ middleware: ['admin'] });

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  roles: string[];
}

const LIMIT = 15;

const users   = ref<UserRow[]>([]);
const total   = ref<number | null>(null);
const page    = ref(1);
const loading = ref(false);
const error   = ref('');

// null means "not yet loaded" — keeps hasMore true so the first fetch runs
const hasMore = computed(() => total.value === null || users.value.length < total.value);

const loadMore = async () => {
  if (loading.value || !hasMore.value) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await $fetch<{ users: UserRow[]; total: number }>(
      `/api/admin/users?page=${page.value}&limit=${LIMIT}`,
    );
    users.value.push(...data.users);
    total.value = data.total;
    page.value++;
  } catch {
    error.value = 'Failed to load users.';
  } finally {
    loading.value = false;
  }
};

// Sentinel element for IntersectionObserver
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(async () => {
  await loadMore();

  observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore(); },
    { threshold: 0.1 },
  );

  watch(sentinel, (el) => {
    if (el) observer!.observe(el);
  }, { immediate: true });
});

onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div class="page">

    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-left">
        <NuxtLink to="/dashboard" class="back-link">← DASHBOARD</NuxtLink>
        <span class="topbar-sep">/</span>
        <span class="topbar-title">USERS</span>
      </div>
      <div class="topbar-right">
        <span class="topbar-count" v-if="total > 0">{{ total }} total</span>
      </div>
    </header>

    <!-- Table -->
    <main class="main">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>EMAIL</th>
              <th>NAME</th>
              <th>ROLES</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="row">
              <td class="cell cell--id">{{ u.id }}</td>
              <td class="cell">{{ u.email }}</td>
              <td class="cell cell--muted">{{ u.name ?? '—' }}</td>
              <td class="cell">
                <div class="roles">
                  <span v-for="role in u.roles" :key="role" class="role-tag">
                    {{ role }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Empty state -->
        <div v-if="!loading && users.length === 0 && !error" class="empty">
          NO USERS FOUND
        </div>

        <!-- Error -->
        <div v-if="error" class="error-msg">{{ error }}</div>

        <!-- Loading row -->
        <div v-if="loading" class="loader">
          <span class="loader-dot" /><span class="loader-dot" /><span class="loader-dot" />
        </div>

        <!-- Infinite scroll sentinel -->
        <div ref="sentinel" class="sentinel" />
      </div>
    </main>

  </div>
</template>

<style scoped>
.page {
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

.topbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 11px;
  letter-spacing: 0.16em;
}

.back-link {
  color: var(--text-muted);
  transition: color 0.2s;
}

.back-link:hover {
  color: var(--accent);
}

.topbar-sep {
  color: var(--border);
}

.topbar-title {
  color: var(--text);
}

.topbar-right {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

/* Main */
.main {
  flex: 1;
  padding: 3rem;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
}

/* Table */
.table-wrap {
  border: 1px solid var(--border);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table thead tr {
  border-bottom: 1px solid var(--border);
}

.table th {
  padding: 0.85rem 1.25rem;
  text-align: left;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--text-muted);
  font-weight: 400;
  background: var(--surface);
}

.row {
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.row:last-child {
  border-bottom: none;
}

.row:hover {
  background: var(--surface);
}

.cell {
  padding: 0.85rem 1.25rem;
  font-size: 13px;
  color: var(--text);
  vertical-align: middle;
}

.cell--id {
  color: var(--text-muted);
  font-size: 12px;
  width: 60px;
}

.cell--muted {
  color: var(--text-muted);
}

.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.role-tag {
  font-size: 10px;
  letter-spacing: 0.1em;
  padding: 0.15rem 0.55rem;
  border: 1px solid var(--border);
  color: var(--accent);
}

/* States */
.empty,
.error-msg {
  padding: 3rem;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.18em;
}

.empty {
  color: var(--text-muted);
}

.error-msg {
  color: var(--danger);
}

.loader {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 1.5rem;
}

.loader-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: blink 1.2s ease-in-out infinite;
}

.loader-dot:nth-child(2) { animation-delay: 0.2s; }
.loader-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.2; }
  40%           { opacity: 1; }
}

.sentinel {
  height: 1px;
}

/* Responsive */
@media (max-width: 768px) {
  .topbar { padding: 1rem 1.5rem; }
  .main   { padding: 1.5rem; }

  .table th:nth-child(3),
  .table .cell:nth-child(3) { display: none; }
}
</style>