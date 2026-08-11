const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API paths must start with a slash: ${path}`);
  }

  if (!configuredApiBaseUrl) {
    return path;
  }

  return new URL(path, configuredApiBaseUrl).toString();
}

export function socketUrl(): string {
  return configuredApiBaseUrl || window.location.origin;
}
