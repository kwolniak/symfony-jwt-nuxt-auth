interface User {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
}

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null);

  const fetchUser = async () => {
    try {
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