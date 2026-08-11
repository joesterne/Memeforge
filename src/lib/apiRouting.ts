export function resolveApiUrl(path: string, configuredBaseUrl?: string): string {
  if (!path.startsWith("/")) throw new Error(`API paths must start with a slash: ${path}`);
  const base = configuredBaseUrl?.trim();
  return base ? new URL(path, base).toString() : path;
}

export function resolveCollaborationUrl(configuredBaseUrl: string | undefined, browserOrigin: string): string {
  const url = new URL("/api/collaboration", configuredBaseUrl?.trim() || browserOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
