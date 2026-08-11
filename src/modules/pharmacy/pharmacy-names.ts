/** Resolve a display name from a core profile relation. */
export function profileName(
  user?: {
    core_profiles_user_id?: Array<{ first_name: string; last_name: string }>;
  } | null,
): string | null {
  const p = user?.core_profiles_user_id?.[0];
  if (!p) return null;
  const name = `${p.first_name} ${p.last_name}`.trim();
  return name || null;
}

export const USER_PROFILE_INCLUDE = {
  include: { core_profiles_user_id: true },
} as const;
