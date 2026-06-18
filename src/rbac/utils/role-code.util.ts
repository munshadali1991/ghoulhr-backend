import { DataSource } from 'typeorm';
import { RbacRole } from '../entities/rbac-role.entity';

/** Generate a unique uppercase role code slug from a display name. */
export async function generateUniqueRoleCode(
  dataSource: DataSource,
  name: string,
): Promise<string> {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'CUSTOM_ROLE';

  const roleRepo = dataSource.getRepository(RbacRole);
  let candidate = base;
  let suffix = 2;
  while (await roleRepo.findOne({ where: { code: candidate } })) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}
