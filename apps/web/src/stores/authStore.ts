import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  realName?: string;
  province?: string;
  score?: number;
  rank?: number;
  vipLevel?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  setAuth: (data: { user: User; accessToken: string; refreshToken: string; expiresIn?: string }) => void;
  setAccessToken: (token: string) => void;
  updateUser: (data: Partial<User>) => void;
  logout: () => void;
}

// Sync token to cookie so Next.js middleware can read it for auth routing
function setTokenCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  if (token) {
    document.cookie = `access_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  } else {
    document.cookie = 'access_token=; path=/; max-age=0';
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,

      setAuth: (data) => {
        setTokenCookie(data.accessToken);
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isLoggedIn: true,
        });
      },

      setAccessToken: (token) => {
        setTokenCookie(token);
        set({ accessToken: token });
      },

      updateUser: (data) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...data } });
        }
      },

      logout: () => {
        setTokenCookie(null);
        // 清空跟当前用户绑定的学生位次缓存（避免共享设备污染）
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('vh:student-rank');
          }
        } catch {}
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isLoggedIn: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          return sessionStorage;
        }
        // SSR fallback
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          setTokenCookie(state.accessToken);
        }
      },
    }
  )
);
