export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string")
    headers.set("Content-Type", "application/json");
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) {
    let message = `Request failed (${r.status})`;
    try {
      message = (await r.json()).error ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return r.json() as Promise<T>;
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export async function uploadImage(blob: Blob) {
  const f = new FormData();
  f.append("file", blob, "notebook.jpg");
  return api<{ id: string }>("/api/images", { method: "POST", body: f });
}
export async function consumeStream(
  response: Response,
  onEvent: (type: string, data: unknown) => void,
) {
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? "The tutor request failed.");
  }
  if (!response.body)
    throw new Error("This browser did not receive a response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let i: number;
      while ((i = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        for (const l of block.split("\n"))
          if (l.startsWith("data: ")) {
            const e = JSON.parse(l.slice(6));
            if (e.type === "done" || e.type === "error") terminal = true;
            onEvent(e.type, e.data);
          }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!terminal)
    throw new Error("The connection ended early. Your draft has been kept.");
}
