import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadSource } from './lead-source.enum';
import { Role } from '../roles/roles.enum';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

describe('LeadsController', () => {
  it('is restricted to SUPER_ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, LeadsController);
    expect(roles).toEqual([Role.SUPER_ADMIN]);
  });

  it('delegates list queries to LeadsService', async () => {
    const payload = {
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
      counts: { all: 0, contactUs: 0, requestForDemo: 0 },
    };
    const leadsService = {
      listLeads: jest.fn().mockResolvedValue(payload),
    };
    const controller = new LeadsController(leadsService as unknown as LeadsService);
    const query = { page: 1, limit: 10, source: LeadSource.ALL };

    await expect(controller.list(query)).resolves.toEqual(payload);
    expect(leadsService.listLeads).toHaveBeenCalledWith(query);
  });
});
