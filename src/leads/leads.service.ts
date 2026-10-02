import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactUs } from './contact-us.entity';
import { RequestForDemo } from './request-for-demo.entity';
import { LeadSource } from './lead-source.enum';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import {
  LeadItemDto,
  PaginatedLeadsDto,
} from './dto/lead-item.dto';

type ContactUsRow = ContactUs;
type DemoRow = RequestForDemo;

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(ContactUs)
    private readonly contactUsRepo: Repository<ContactUs>,
    @InjectRepository(RequestForDemo)
    private readonly demoRepo: Repository<RequestForDemo>,
  ) {}

  async listLeads(query: ListLeadsQueryDto = {}): Promise<PaginatedLeadsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 10));
    const source = query.source ?? LeadSource.ALL;
    const search = query.search?.trim() ?? '';

    const [contactRows, demoRows] = await Promise.all([
      source === LeadSource.REQUEST_FOR_DEMO
        ? Promise.resolve([] as ContactUsRow[])
        : this.contactUsRepo.find({ order: { createdAt: 'DESC' } }),
      source === LeadSource.CONTACT_US
        ? Promise.resolve([] as DemoRow[])
        : this.demoRepo.find({ order: { createdAt: 'DESC' } }),
    ]);

    const contactUsCount = await this.contactUsRepo.count();
    const requestForDemoCount = await this.demoRepo.count();

    let items = [
      ...contactRows.map((row) => this.mapContactUs(row)),
      ...demoRows.map((row) => this.mapRequestForDemo(row)),
    ];

    if (search) {
      const needle = search.toLowerCase();
      items = items.filter((item) => this.matchesSearch(item, needle));
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = items.length;
    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);

    return {
      items: pageItems,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      counts: {
        all: contactUsCount + requestForDemoCount,
        contactUs: contactUsCount,
        requestForDemo: requestForDemoCount,
      },
    };
  }

  mapContactUs(row: ContactUsRow): LeadItemDto {
    return {
      id: `${LeadSource.CONTACT_US}:${row.id}`,
      source: LeadSource.CONTACT_US,
      sourceId: String(row.id),
      name: row.name,
      email: row.email,
      phone: row.mobile || row.contact || null,
      company: row.company,
      companySize: row.companySize || null,
      companyType: null,
      message: row.message || null,
      contact: row.contact || null,
      mobile: row.mobile || null,
      address: null,
      country: null,
      city: null,
      createdAt: row.createdAt,
    };
  }

  mapRequestForDemo(row: DemoRow): LeadItemDto {
    return {
      id: `${LeadSource.REQUEST_FOR_DEMO}:${row.id}`,
      source: LeadSource.REQUEST_FOR_DEMO,
      sourceId: String(row.id),
      name: row.orgName,
      email: row.workEmail,
      phone: row.contactDetails || null,
      company: row.orgName,
      companySize: row.employeeSize || null,
      companyType: row.companyType || null,
      message: null,
      contact: row.contactDetails || null,
      mobile: null,
      address: row.address || null,
      country: row.country || null,
      city: row.city || null,
      createdAt: row.createdAt,
    };
  }

  matchesSearch(item: LeadItemDto, needle: string): boolean {
    const haystack = [
      item.name,
      item.email,
      item.phone,
      item.company,
      item.companySize,
      item.companyType,
      item.message,
      item.contact,
      item.mobile,
      item.address,
      item.country,
      item.city,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  }
}
