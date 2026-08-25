import { LeadsService } from './leads.service';
import { LeadSource } from './lead-source.enum';
import { ContactUs } from './contact-us.entity';
import { RequestForDemo } from './request-for-demo.entity';

function createService(
  contactRows: ContactUs[] = [],
  demoRows: RequestForDemo[] = [],
) {
  const contactUsRepo = {
    find: jest.fn().mockResolvedValue(contactRows),
    count: jest.fn().mockResolvedValue(contactRows.length),
  };
  const demoRepo = {
    find: jest.fn().mockResolvedValue(demoRows),
    count: jest.fn().mockResolvedValue(demoRows.length),
  };

  return new LeadsService(contactUsRepo as any, demoRepo as any);
}

describe('LeadsService', () => {
  const contact: ContactUs = {
    id: '1',
    name: 'Alice Smith',
    email: 'alice@acme.com',
    contact: 'Alice',
    mobile: '111-222',
    company: 'Acme',
    companySize: '51-200',
    message: 'Need pricing',
    createdAt: new Date('2026-08-02T10:00:00.000Z'),
  };

  const demo: RequestForDemo = {
    id: '2',
    orgName: 'Beta Corp',
    workEmail: 'ops@beta.com',
    contactDetails: '999-888',
    address: '1 Main St',
    country: 'Australia',
    city: 'Sydney',
    employeeSize: '201-500',
    companyType: 'Private',
    createdAt: new Date('2026-08-03T10:00:00.000Z'),
  };

  it('normalizes contact_us and request_for_demo into a unified shape', () => {
    const service = createService();
    expect(service.mapContactUs(contact)).toMatchObject({
      id: 'contact_us:1',
      source: LeadSource.CONTACT_US,
      name: 'Alice Smith',
      email: 'alice@acme.com',
      company: 'Acme',
      message: 'Need pricing',
    });
    expect(service.mapRequestForDemo(demo)).toMatchObject({
      id: 'request_for_demo:2',
      source: LeadSource.REQUEST_FOR_DEMO,
      name: 'Beta Corp',
      email: 'ops@beta.com',
      phone: '999-888',
      city: 'Sydney',
    });
  });

  it('merges sources newest first and paginates', async () => {
    const service = createService([contact], [demo]);
    const result = await service.listLeads({ page: 1, limit: 1 });

    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe(LeadSource.REQUEST_FOR_DEMO);
    expect(result.counts).toEqual({
      all: 2,
      contactUs: 1,
      requestForDemo: 1,
    });
  });

  it('filters by source', async () => {
    const service = createService([contact], [demo]);
    const result = await service.listLeads({
      source: LeadSource.CONTACT_US,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe(LeadSource.CONTACT_US);
  });

  it('filters by search across name/email/company', async () => {
    const service = createService([contact], [demo]);
    const result = await service.listLeads({ search: 'beta' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].company).toBe('Beta Corp');
  });
});
