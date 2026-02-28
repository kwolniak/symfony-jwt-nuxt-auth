<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap');

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg:           #080808;
  --surface:      #111111;
  --surface-2:    #1a1a1a;
  --border:       #242424;
  --text:         #ede8df;
  --text-muted:   #55524d;
  --accent:       #00d4aa;
  --accent-dim:   rgba(0, 212, 170, 0.08);
  --danger:       #e05252;
  --font-display: 'Bebas Neue', sans-serif;
  --font-body:    'DM Mono', monospace;
}

html, body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

a { color: inherit; text-decoration: none; }
button { cursor: pointer; font-family: var(--font-body); }
input { font-family: var(--font-body); }
</style>