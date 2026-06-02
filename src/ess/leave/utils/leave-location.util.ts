import { DataSource } from 'typeorm';
import { LocationConfiguration } from '../../../employees/entities/location-configuration.entity';

/**
 * Resolve employment businessUnit (location UUID or legacy branch name) to locationId.
 */
export async function resolveEmployeeLocationId(
  dataSource: DataSource,
  organizationId: string,
  businessUnit?: string | null,
): Promise<string | null> {
  const raw = String(businessUnit ?? '').trim();
  if (!raw) return null;

  const locRepo = dataSource.getRepository(LocationConfiguration);
  const locations = await locRepo.find({ where: { organizationId } });

  const byId = locations.find((l) => l.id === raw);
  if (byId) return byId.id;

  const lower = raw.toLowerCase();
  const byName = locations.find(
    (l) => String(l.name ?? '').trim().toLowerCase() === lower,
  );
  return byName?.id ?? null;
}
