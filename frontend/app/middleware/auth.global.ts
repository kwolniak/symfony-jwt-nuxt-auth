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