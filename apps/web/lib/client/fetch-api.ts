/**
 * Typed fetch wrapper for internal API routes. Handles 401 by redirecting
 * to /login, and converts non-OK responses to thrown errors.
 */
export async function fetchApi<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);

  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Session expired");
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = (json as Record<string, unknown>)?.error;
    throw new Error(typeof msg === "string" ? msg : `Request failed (${res.status})`);
  }

  return json as T;
}
