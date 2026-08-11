export function configuredOrigins(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv = env.NODE_ENV,
): Set<string> {
  const split = (value?: string) => value?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];
  const values = [
    ...split(env.ALLOWED_ORIGINS),
    ...split(env.NATIVE_APP_ORIGINS),
    ...(env.APP_URL ? [env.APP_URL] : []),
    "capacitor://localhost",
    "memeforge://localhost",
  ];
  if (nodeEnv !== "production") values.push("http://localhost:3000", "http://localhost:5173");
  return new Set(values.map((value) => value.replace(/\/$/, "")));
}

export function isAllowedOrigin(origin: string | undefined, origins: Set<string>): boolean {
  return !origin || origins.has(origin.replace(/\/$/, ""));
}
