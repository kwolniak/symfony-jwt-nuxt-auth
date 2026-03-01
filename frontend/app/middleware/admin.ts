export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth();

  if (!user.value?.roles.includes('ROLE_ADMIN')) {
    return navigateTo('/dashboard');
  }
});