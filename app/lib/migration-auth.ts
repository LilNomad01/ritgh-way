import { env } from "cloudflare:workers";

export function hasMigrationAccess(request: Request) {
  const secret = (env as unknown as { MIGRATION_EXPORT_SECRET?: string }).MIGRATION_EXPORT_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}
