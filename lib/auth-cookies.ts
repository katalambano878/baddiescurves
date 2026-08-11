/** Browser cookie helpers for sb-* session tokens (middleware reads these). */

function secureFlag(): string {
  if (typeof window === "undefined") return "";
  return window.location.protocol === "https:" ? "; Secure" : "";
}

export function setAuthCookies(accessToken: string, refreshToken?: string | null) {
  const secure = secureFlag();
  document.cookie = `sb-access-token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
  if (refreshToken) {
    document.cookie = `sb-refresh-token=${refreshToken}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
  }
}

export function clearAuthCookies() {
  const secure = secureFlag();
  document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
  document.cookie = `sb-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
}
