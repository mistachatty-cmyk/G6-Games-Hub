import type { AuthUser } from "@workspace/api-zod";

function readAllowlist(...names: string[]): Set<string> {
  return new Set(
    names
      .flatMap((name) => (process.env[name] ?? "").split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isGsixOwner(user: AuthUser | null | undefined): boolean {
  if (!user) return false;

  const ownerIds = readAllowlist("GSIX_OWNER_IDS");
  const ownerEmails = readAllowlist("GSIX_OWNER_EMAILS", "GSIX_OWNER_EMAIL");
  return (
    ownerIds.has(user.id.toLowerCase()) ||
    (user.email != null && ownerEmails.has(user.email.toLowerCase()))
  );
}