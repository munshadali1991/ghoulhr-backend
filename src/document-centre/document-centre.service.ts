import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { S3StorageService } from '../storage/s3-storage.service';
import {
  DOCUMENT_CENTRE_MAX_FILE_BYTES,
  STORAGE_DRIVERS,
} from '../storage/storage.constants';
import { AuthorizationService } from '../rbac/authorization.service';
import {
  DocumentCentreCategory,
  DocumentCentreDocument,
  DocumentCentreSubcategory,
} from './entities/document-centre-document.entity';
import {
  DocumentCentreBatchStatus,
  DocumentCentreBatchType,
  DocumentCentreUploadBatch,
} from './entities/document-centre-upload-batch.entity';
import {
  ListDocumentsQueryDto,
  UpdateDocumentDto,
} from './dto/document-centre.dto';
import { extractEmployeeCodeFromFilename } from './utils/filename.util';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip') as typeof import('adm-zip');

const CONFIDENTIAL = new Set([DocumentCentreCategory.FORM16]);

@Injectable()
export class DocumentCentreService {
  constructor(
    private readonly s3Storage: S3StorageService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canManageAll(
    organizationId: string,
    employeeId: string,
    tenantDataSource: DataSource,
    cacheKey?: object,
  ): Promise<boolean> {
    return this.authorizationService.hasPermission(
      { organizationId, employeeId, tenantDataSource },
      'documents:read',
      cacheKey,
    );
  }

  async listDocuments(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    canViewAll: boolean,
    query: ListDocumentsQueryDto,
  ) {
    const repo = dataSource.getRepository(DocumentCentreDocument);
    const qb = repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.employee', 'employee')
      .where('d.organizationId = :organizationId', { organizationId })
      .andWhere('d.category = :category', { category: query.category })
      .orderBy('d.createdAt', 'DESC');

    if (query.subcategory) {
      qb.andWhere('d.subcategory = :subcategory', {
        subcategory: query.subcategory,
      });
    }

    if (CONFIDENTIAL.has(query.category)) {
      if (!canViewAll) {
        qb.andWhere('d.employeeId = :actorEmployeeId', { actorEmployeeId });
      } else if (query.employeeId) {
        qb.andWhere('d.employeeId = :employeeId', {
          employeeId: query.employeeId,
        });
      }
    }

    if (query.periodMonth) {
      qb.andWhere('d.periodMonth = :periodMonth', {
        periodMonth: query.periodMonth,
      });
    }
    if (query.periodYear) {
      qb.andWhere('d.periodYear = :periodYear', {
        periodYear: query.periodYear,
      });
    }
    if (query.financialYear) {
      qb.andWhere('d.financialYear = :financialYear', {
        financialYear: query.financialYear,
      });
    }

    const items = await qb.getMany();
    return items.map((d) => this.toListItem(d));
  }

  async getDownload(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    canViewAll: boolean,
    documentId: string,
  ) {
    const doc = await this.findDocumentOrFail(
      dataSource,
      organizationId,
      documentId,
    );

    if (CONFIDENTIAL.has(doc.category)) {
      if (!canViewAll && doc.employeeId !== actorEmployeeId) {
        throw new ForbiddenException(
          'You can only download your own confidential documents',
        );
      }
    }

    if (!doc.storageKey.startsWith(`organizations/${organizationId}/`)) {
      throw new ForbiddenException('Invalid document storage key');
    }

    const url = await this.s3Storage.getSignedDownloadUrl(
      doc.storageKey,
      doc.originalFileName,
      doc.mimeType,
    );

    return {
      downloadUrl: url,
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
    };
  }

  async getPreview(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    canViewAll: boolean,
    documentId: string,
  ) {
    const doc = await this.findDocumentOrFail(
      dataSource,
      organizationId,
      documentId,
    );

    if (CONFIDENTIAL.has(doc.category)) {
      if (!canViewAll && doc.employeeId !== actorEmployeeId) {
        throw new ForbiddenException(
          'You can only view your own confidential documents',
        );
      }
    }

    if (!doc.storageKey.startsWith(`organizations/${organizationId}/`)) {
      throw new ForbiddenException('Invalid document storage key');
    }

    const url = await this.s3Storage.getSignedPreviewUrl(
      doc.storageKey,
      doc.mimeType,
    );

    return {
      previewUrl: url,
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
    };
  }

  async softDelete(
    dataSource: DataSource,
    organizationId: string,
    documentId: string,
  ) {
    const repo = dataSource.getRepository(DocumentCentreDocument);
    const doc = await this.findDocumentOrFail(
      dataSource,
      organizationId,
      documentId,
    );
    await repo.softRemove(doc);
    return { id: documentId, deleted: true };
  }

  async updateDocument(
    dataSource: DataSource,
    organizationId: string,
    documentId: string,
    dto: UpdateDocumentDto,
  ) {
    const repo = dataSource.getRepository(DocumentCentreDocument);
    const doc = await this.findDocumentOrFail(
      dataSource,
      organizationId,
      documentId,
    );

    if (
      doc.category !== DocumentCentreCategory.POLICY &&
      doc.category !== DocumentCentreCategory.FORM
    ) {
      if (dto.subcategory) {
        throw new BadRequestException(
          'subcategory is only valid for policies',
        );
      }
    }

    if (dto.title !== undefined) doc.title = dto.title.trim();
    if (dto.subcategory !== undefined) {
      if (doc.category !== DocumentCentreCategory.POLICY) {
        throw new BadRequestException('Only policies have subcategories');
      }
      doc.subcategory = dto.subcategory;
    }

    await repo.save(doc);
    return this.toListItem(doc);
  }

  async uploadPublicDocument(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    category: DocumentCentreCategory.POLICY | DocumentCentreCategory.FORM,
    title: string,
    file: Express.Multer.File,
    subcategory?: DocumentCentreSubcategory,
  ) {
    this.assertFilePresent(file);
    this.assertPdfOrOffice(file);

    if (category === DocumentCentreCategory.POLICY && !subcategory) {
      throw new BadRequestException('Policy subcategory is required');
    }
    if (category === DocumentCentreCategory.FORM && subcategory) {
      throw new BadRequestException('Forms do not use subcategory');
    }

    const { storageKey } = this.s3Storage.buildObjectKey({
      organizationId,
      category: 'organization-files',
      module: 'document-centre',
      documentType: category.toLowerCase(),
      originalFileName: file.originalname,
    });

    await this.s3Storage.putObject({
      storageKey,
      body: file.buffer,
      contentType: file.mimetype,
      metadata: { organizationId, module: 'document-centre' },
    });

    const repo = dataSource.getRepository(DocumentCentreDocument);
    const doc = repo.create({
      organizationId,
      category,
      subcategory: subcategory ?? null,
      employeeId: null,
      title: title.trim(),
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey,
      storageDriver: STORAGE_DRIVERS.S3,
      uploadedByEmployeeId: actorEmployeeId,
    });
    await repo.save(doc);
    return this.toListItem(doc);
  }

  async uploadForm16(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    file: Express.Multer.File,
    financialYear: string,
    employeeId?: string,
  ) {
    this.assertFilePresent(file);
    if (!financialYear?.trim()) {
      throw new BadRequestException('financialYear is required');
    }
    const fy = financialYear.trim();

    const isZip =
      file.originalname.toLowerCase().endsWith('.zip') ||
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed';

    if (isZip) {
      return this.uploadForm16Zip(
        dataSource,
        organizationId,
        actorEmployeeId,
        file,
        fy,
      );
    }

    this.assertPdf(file);
    if (!employeeId) {
      const code = extractEmployeeCodeFromFilename(file.originalname);
      if (!code) {
        throw new BadRequestException(
          'employeeId is required when filename does not start with Employee Code',
        );
      }
      const employee = await this.findEmployeeByCode(
        dataSource,
        organizationId,
        code,
      );
      if (!employee) {
        throw new BadRequestException(`Unknown Employee Code: ${code}`);
      }
      employeeId = employee.id;
    }

    const employee = await dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const doc = await this.storeForm16ForEmployee(
      dataSource,
      organizationId,
      actorEmployeeId,
      employee,
      file.buffer,
      file.originalname,
      file.mimetype,
      fy,
      null,
    );

    return {
      successCount: 1,
      errorCount: 0,
      errors: [],
      documents: [this.toListItem(doc)],
    };
  }

  private async uploadForm16Zip(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    file: Express.Multer.File,
    financialYear: string,
  ) {
    let zip: InstanceType<typeof AdmZip>;
    try {
      zip = new AdmZip(file.buffer);
    } catch {
      throw new BadRequestException('Invalid ZIP file');
    }

    const entries = zip
      .getEntries()
      .filter(
        (e) =>
          !e.isDirectory &&
          !e.entryName.startsWith('__MACOSX') &&
          e.entryName.toLowerCase().endsWith('.pdf'),
      );

    if (entries.length === 0) {
      throw new BadRequestException('ZIP contains no PDF files');
    }

    const errors: Array<{ fileName: string; message: string }> = [];
    const documents: DocumentCentreDocument[] = [];

    const batchRepo = dataSource.getRepository(DocumentCentreUploadBatch);
    const batch = await batchRepo.save(
      batchRepo.create({
        organizationId,
        type: DocumentCentreBatchType.FORM16_ZIP,
        status: DocumentCentreBatchStatus.PENDING,
        financialYear,
        originalFileName: file.originalname,
        rowCount: entries.length,
        uploadedByEmployeeId: actorEmployeeId,
      }),
    );

    for (const entry of entries) {
      const fileName = entry.entryName.split(/[/\\]/).pop() || entry.entryName;
      const code = extractEmployeeCodeFromFilename(fileName);
      if (!code) {
        errors.push({
          fileName,
          message: 'Could not extract Employee Code from filename',
        });
        continue;
      }
      const employee = await this.findEmployeeByCode(
        dataSource,
        organizationId,
        code,
      );
      if (!employee) {
        errors.push({
          fileName,
          message: `Unknown Employee Code: ${code}`,
        });
        continue;
      }

      try {
        const buffer = entry.getData();
        const doc = await this.storeForm16ForEmployee(
          dataSource,
          organizationId,
          actorEmployeeId,
          employee,
          buffer,
          fileName,
          'application/pdf',
          financialYear,
          batch.id,
        );
        documents.push(doc);
      } catch (err) {
        errors.push({
          fileName,
          message: err instanceof Error ? err.message : 'Failed to store file',
        });
      }
    }

    batch.successCount = documents.length;
    batch.errorCount = errors.length;
    batch.errors = errors;
    batch.status =
      errors.length === 0
        ? DocumentCentreBatchStatus.COMMITTED
        : documents.length > 0
          ? DocumentCentreBatchStatus.COMMITTED
          : DocumentCentreBatchStatus.FAILED;
    await batchRepo.save(batch);

    return {
      batchId: batch.id,
      successCount: documents.length,
      errorCount: errors.length,
      errors,
      documents: documents.map((d) => this.toListItem(d)),
    };
  }

  private async storeForm16ForEmployee(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    employee: Employee,
    buffer: Buffer,
    originalFileName: string,
    mimeType: string,
    financialYear: string,
    uploadBatchId: string | null,
  ): Promise<DocumentCentreDocument> {
    const docRepo = dataSource.getRepository(DocumentCentreDocument);
    const existing = await docRepo.findOne({
      where: {
        organizationId,
        category: DocumentCentreCategory.FORM16,
        employeeId: employee.id,
        financialYear,
      },
    });
    if (existing) {
      await docRepo.softRemove(existing);
    }

    const { storageKey } = this.s3Storage.buildObjectKey({
      organizationId,
      category: 'employee-documents',
      module: 'document-centre',
      employeeId: employee.id,
      documentType: 'form16',
      originalFileName,
    });

    await this.s3Storage.putObject({
      storageKey,
      body: buffer,
      contentType: mimeType || 'application/pdf',
      metadata: {
        organizationId,
        module: 'document-centre',
        documentType: 'form16',
      },
    });

    const doc = docRepo.create({
      organizationId,
      category: DocumentCentreCategory.FORM16,
      employeeId: employee.id,
      title: `Form 16 FY ${financialYear}`,
      originalFileName,
      mimeType: mimeType || 'application/pdf',
      sizeBytes: buffer.length,
      financialYear,
      storageKey,
      storageDriver: STORAGE_DRIVERS.S3,
      uploadBatchId,
      uploadedByEmployeeId: actorEmployeeId,
    });
    return docRepo.save(doc);
  }

  private async findEmployeeByCode(
    dataSource: DataSource,
    organizationId: string,
    employeeCode: string,
  ): Promise<Employee | null> {
    return dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.organizationId = :organizationId', { organizationId })
      .andWhere('UPPER(e.employeeCode) = UPPER(:employeeCode)', {
        employeeCode: employeeCode.trim(),
      })
      .getOne();
  }

  private async findDocumentOrFail(
    dataSource: DataSource,
    organizationId: string,
    documentId: string,
  ): Promise<DocumentCentreDocument> {
    const doc = await dataSource.getRepository(DocumentCentreDocument).findOne({
      where: { id: documentId, organizationId },
      relations: ['employee'],
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  private toListItem(d: DocumentCentreDocument) {
    return {
      id: d.id,
      category: d.category,
      subcategory: d.subcategory ?? null,
      employeeId: d.employeeId ?? null,
      employeeCode: d.employee?.employeeCode ?? null,
      employeeName: d.employee?.name ?? null,
      title: d.title,
      originalFileName: d.originalFileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      periodMonth: d.periodMonth ?? null,
      periodYear: d.periodYear ?? null,
      financialYear: d.financialYear ?? null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  private assertFilePresent(file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > DOCUMENT_CENTRE_MAX_FILE_BYTES) {
      throw new BadRequestException(
        `File exceeds ${Math.round(DOCUMENT_CENTRE_MAX_FILE_BYTES / (1024 * 1024))} MB limit`,
      );
    }
  }

  private assertPdf(file: Express.Multer.File) {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.pdf') && file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are allowed');
    }
  }

  private assertPdfOrOffice(file: Express.Multer.File) {
    const name = file.originalname.toLowerCase();
    const ok =
      name.endsWith('.pdf') ||
      name.endsWith('.doc') ||
      name.endsWith('.docx') ||
      name.endsWith('.xls') ||
      name.endsWith('.xlsx') ||
      file.mimetype === 'application/pdf';
    if (!ok) {
      throw new BadRequestException(
        'Allowed types: PDF, Word, or Excel documents',
      );
    }
  }
}
