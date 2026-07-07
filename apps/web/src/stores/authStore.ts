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
  // backend 在 login response 里以嵌套形式返回; 前端读 user.teacherProfile?.isSupervisor
  // 判断主管, 用于 dashboard 区分 / nav 入口隐藏等
  teacherProfile?: {
    id?: number;
    school?: string | null;
    isSupervisor?: boolean;
    isPrimarySupervisor?: boolean;
  } | null;
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

// access_token cookie 现在由后端 Set-Cookie (HttpOnly) 写入和清理, 见
// apps/server/src/modules/auth/auth.controller.ts. 前端不再 document.cookie 直接写,
// 避免 XSS 偷 token. 留下这个 no-op 函数作为兼容点; 旧的 onRehydrateStorage 调用不会爆炸.
function setTokenCookie(_token: string | null) {
  // intentionally empty - cookie managed by backend Set-Cookie HttpOnly
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
        // 通知后端清 HttpOnly cookie (best effort, 失败不阻断本地清理)
        if (typeof fetch !== 'undefined') {
          void fetch('/api/v1/auth/logout', {
            method: 'POST',
            credentials: 'include',
          }).catch(() => undefined);
        }
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
