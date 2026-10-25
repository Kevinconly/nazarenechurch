export const roles = ['Contributor', 'Editor', 'Administrator'] as const
export type Role = typeof roles[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (roles as readonly string[]).includes(value)
}

// Prompt 06 establishes identity, role enforcement, and user administration.
// No archive-editing operations are granted before those features are implemented.
export const permissions = {
  'Contributor': ['auth:use'],
  'Editor': ['auth:use'],
  'Administrator': ['auth:use', 'users:read', 'users:create', 'users:update-role', 'users:update-status'],
} as const satisfies Record<Role, readonly string[]>

export type Permission = typeof permissions[Role][number]

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return isRole(role) && (permissions[role] as readonly string[]).includes(permission)
}
