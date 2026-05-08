import { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { userApi } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkUser = async () => {
    try {
      await fetchAuthSession();
      const u = await getCurrentUser();
      setUser(u);
      const { data } = await userApi.getMe().catch(err => {
        if (err?.response?.status === 404) return { data: null };
        throw err;
      });
      setProfile(data);
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUser();

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') checkUser();
      if (payload.event === 'signedOut') { setUser(null); setProfile(null); }
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    await signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
