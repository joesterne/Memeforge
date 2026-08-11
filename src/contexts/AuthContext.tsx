import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, appleProvider } from '../lib/firebase';
import { apiFetch } from '../lib/api';

export interface Entitlement {
  plan: 'free' | 'pro';
  status: string;
  currentPeriodEnd: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  entitlement: Entitlement | null;
  entitlementLoading: boolean;
  refreshEntitlement: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  entitlement: null,
  entitlementLoading: false,
  refreshEntitlement: async () => {},
  signInWithGoogle: async () => {},
  signInWithApple: async () => {},
  logOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [entitlementLoading, setEntitlementLoading] = useState(false);

  const refreshEntitlement = useCallback(async () => {
    if (!user) {
      setEntitlement(null);
      return;
    }
    setEntitlementLoading(true);
    try {
      const data = await apiFetch<{ entitlement: Entitlement }>("/api/me/entitlement", {}, { user });
      setEntitlement(data.entitlement);
    } catch {
      setEntitlement(null);
    } finally {
      setEntitlementLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void refreshEntitlement();
  }, [refreshEntitlement]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google Sign-in error:', error);
    }
  };

  const signInWithApple = async () => {
    try {
      await signInWithPopup(auth, appleProvider);
    } catch (error) {
      console.error('Apple Sign-in error:', error);
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, entitlement, entitlementLoading, refreshEntitlement, signInWithGoogle, signInWithApple, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
