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
