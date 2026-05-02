const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPostStream<T>(
  path: string,
  body: unknown,
  token: string,
  onEvent: (event: T) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`POST ${path} stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) onEvent(JSON.parse(trimmed) as T);
    }
  }

  const trailing = buffer.trim();
  if (trailing) onEvent(JSON.parse(trailing) as T);
}

export async function apiUpload<T>(
  path: string,
  file: File,
  token: string,
): Promise<T> {
  const body = new FormData();
  body.append("file", file);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`UPLOAD ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string, token: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}
