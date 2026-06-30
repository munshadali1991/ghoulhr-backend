import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FieldEncryptionService } from '../common/services/field-encryption.service';
import { Employee } from '../employees/employee.entity';
import { EmployeeDocument } from '../employees/entities/employee-document.entity';
import { OrganizationSetting } from '../settings/entities/organization-setting.entity';
import { SETTING_KEYS } from '../settings/settings.constants';
import { S3StorageService } from './s3-storage.service';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  DEFAULT_MAX_FILE_BYTES,
  LOGO_MAX_FILE_BYTES,
  PROFILE_PHOTO_MAX_FILE_BYTES,
  STORAGE_DRIVERS,
  type StorageCategory,
  type StorageModule,
} from './storage.constants';
import { UploadFileDto } from './dto/upload-file.dto';
import { PURGE_ASSETS_CONFIRM_PHRASE } from './dto/purge-organization-assets.dto';
import { extensionFromFilename } from './utils/sanitize-filename.util';

export interface OrganizationAssetSummary {
  organizationId: string;
  prefix: string;
  objectCount: number;
}

export interface PurgeOrganizationAssetsResult {
  organizationId: string;
  prefix: string;
  s3ObjectsListed: number;
  s3ObjectsDeleted: number;
  s3DeleteFailures: number;
  documentReferencesCleared: number;
  profilePhotosCleared: number;
  organizationLogoCleared: boolean;
}

export interface UploadResult {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentId: string;
  previewUrl?: string;
}

@Injectable()
export class StorageService {
  constructor(
    private readonly s3Storage: S3StorageService,
    private readonly configService: ConfigService,
    private readonly fieldEncryption: FieldEncryptionService,
  ) {}

  validateUploadRequest(
    dto: UploadFileDto,
    organizationId: string,
    actorEmployeeId: string,
  ): void {
    this.assertModuleAccess(dto.module, dto);

    if (dto.module === 'leave') {
      if (!dto.employeeId) {
        throw new BadRequestException('employeeId is required for leave uploads');
      }
      if (dto.employeeId !== actorEmployeeId) {
        throw new ForbiddenException(
          'You can only upload leave documents for your own employee record',
        );
      }
    }

    if (dto.module === 'profile-photos' && !dto.employeeId && !dto.uploadBatchId) {
      throw new BadRequestException(
        'employeeId or uploadBatchId is required for profile photo uploads',
      );
    }

    if (dto.module === 'onboarding' && !dto.employeeId && !dto.uploadBatchId) {
      throw new BadRequestException(
        'uploadBatchId is required for onboarding uploads before employee exists',
      );
    }
  }

  private assertModuleAccess(module: StorageModule, dto: UploadFileDto): void {
    if (module === 'branding') {
      if (dto.category !== 'organization-files') {
        throw new BadRequestException(
          'Organization logo must use organization-files category',
        );
      }
      return;
    }

    if (module === 'onboarding' || module === 'leave' || module === 'profile-photos') {
      if (dto.category !== 'employee-documents' && dto.category !== 'staging') {
        throw new BadRequestException(
          'Employee uploads must use employee-documents or staging category',
        );
      }
    }
  }

  async uploadFile(
    organizationId: string,
    dto: UploadFileDto,
    file: Express.Multer.File,
    actorEmployeeId: string,
  ): Promise<UploadResult> {
    this.validateUploadRequest(dto, organizationId, actorEmployeeId);

    const maxBytes = this.resolveMaxBytes(dto.module);
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > maxBytes || file.buffer.length > maxBytes) {
      throw new BadRequestException(
        `File exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit`,
      );
    }

    const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
    this.assertAllowedFile(dto.module, mimeType, file.originalname);

    const category = this.resolveUploadCategory(dto);
    const { storageKey, documentId } = this.s3Storage.buildObjectKey({
      organizationId,
      category,
      module: dto.module,
      employeeId: dto.employeeId,
      leaveRequestId: dto.leaveRequestId,
      documentType: dto.documentType,
      uploadBatchId: dto.uploadBatchId,
      originalFileName: file.originalname,
    });

    await this.s3Storage.putObject({
      storageKey,
      body: file.buffer,
      contentType: mimeType,
      metadata: {
        organizationId,
        module: dto.module,
        documentType: dto.documentType || '',
        uploadedBy: actorEmployeeId,
      },
    });

    const result: UploadResult = {
      storageKey,
      fileName: file.originalname,
      mimeType,
      sizeBytes: file.size,
      documentId,
    };

    if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      result.previewUrl = await this.s3Storage.getSignedPreviewUrl(
        storageKey,
        mimeType,
      );
    }

    return result;
  }

  async finalizeOnboardingDocument(
    organizationId: string,
    employeeId: string,
    stagingKey: string,
    documentType: string,
    fileName: string,
  ): Promise<string> {
    if (!this.s3Storage.isOrganizationKey(stagingKey, organizationId)) {
      throw new BadRequestException('Invalid staging storage key');
    }

    const { storageKey: finalKey } = this.s3Storage.buildObjectKey({
      organizationId,
      category: 'employee-documents',
      module: 'onboarding',
      employeeId,
      documentType,
      originalFileName: fileName,
    });

    if (stagingKey !== finalKey) {
      await this.s3Storage.copyObject(stagingKey, finalKey);
      await this.s3Storage.deleteObject(stagingKey);
    }

    return finalKey;
  }

  async finalizeLeaveDocument(
    organizationId: string,
    employeeId: string,
    leaveRequestId: string,
    sourceKey: string,
    fileName: string,
  ): Promise<string> {
    if (!this.s3Storage.isOrganizationKey(sourceKey, organizationId)) {
      throw new BadRequestException('Invalid leave document storage key');
    }

    const { storageKey: finalKey } = this.s3Storage.buildObjectKey({
      organizationId,
      category: 'employee-documents',
      module: 'leave',
      employeeId,
      leaveRequestId,
      documentType: 'LEAVE_SUPPORTING',
      originalFileName: fileName,
    });

    if (sourceKey !== finalKey) {
      await this.s3Storage.copyObject(sourceKey, finalKey);
      await this.s3Storage.deleteObject(sourceKey);
    }

    return finalKey;
  }

  async finalizeProfilePhoto(
    organizationId: string,
    employeeId: string,
    sourceKey: string,
    fileName: string,
  ): Promise<string> {
    if (!this.s3Storage.isOrganizationKey(sourceKey, organizationId)) {
      throw new BadRequestException('Invalid profile photo storage key');
    }

    const { storageKey: finalKey } = this.s3Storage.buildObjectKey({
      organizationId,
      category: 'employee-documents',
      module: 'profile-photos',
      employeeId,
      originalFileName: fileName,
    });

    if (sourceKey !== finalKey) {
      await this.s3Storage.copyObject(sourceKey, finalKey);
      await this.s3Storage.deleteObject(sourceKey);
    }

    return finalKey;
  }

  async deleteStorageKey(storageKey: string | null | undefined): Promise<void> {
    await this.s3Storage.deleteObject(storageKey);
  }

  async getDocumentDownload(
    dataSource: DataSource,
    organizationId: string,
    documentId: string,
  ): Promise<
    | { mode: 'signedUrl'; url: string; fileName: string; mimeType: string }
    | { mode: 'inline'; fileName: string; mimeType: string; dataBase64: string }
  > {
    const doc = await dataSource.getRepository(EmployeeDocument).findOne({
      where: { id: documentId },
      relations: ['employee'],
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const employeeOrgId = (doc.employee as { organizationId?: string })
      ?.organizationId;
    if (employeeOrgId && employeeOrgId !== organizationId) {
      throw new ForbiddenException('Document not found');
    }

    if (doc.storageDriver === STORAGE_DRIVERS.S3 && doc.storageKey) {
      if (!this.s3Storage.isOrganizationKey(doc.storageKey, organizationId)) {
        throw new ForbiddenException('Document not found');
      }
      const url = await this.s3Storage.getSignedDownloadUrl(
        doc.storageKey,
        doc.fileName,
        doc.mimeType,
      );
      return { mode: 'signedUrl', url, fileName: doc.fileName, mimeType: doc.mimeType };
    }

    if (doc.storageDriver === STORAGE_DRIVERS.INLINE_BASE64 && doc.payloadEnc) {
      const decrypted = this.fieldEncryption.decrypt(doc.payloadEnc);
      if (!decrypted) {
        throw new NotFoundException('Document could not be read');
      }
      return {
        mode: 'inline',
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        dataBase64: decrypted,
      };
    }

    throw new NotFoundException('Document file is not available');
  }

  async getAssetPreviewUrl(
    organizationId: string,
    storageKey: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.s3Storage.isOrganizationKey(storageKey, organizationId)) {
      throw new ForbiddenException('Asset not found');
    }
    return this.s3Storage.getSignedPreviewUrl(storageKey, mimeType);
  }

  resolveLogoPreview(
    logoValue: unknown,
    organizationId: string,
  ): string | null {
    if (!logoValue) return null;
    if (typeof logoValue === 'string') {
      if (logoValue.startsWith('data:') || logoValue.startsWith('http')) {
        return logoValue;
      }
      if (logoValue.startsWith('organizations/')) {
        return null;
      }
    }
    if (
      typeof logoValue === 'object' &&
      logoValue !== null &&
      'storageKey' in logoValue
    ) {
      return null;
    }
    return typeof logoValue === 'string' ? logoValue : null;
  }

  isS3StorageKey(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('organizations/');
  }

  isStagingKey(storageKey: string): boolean {
    return this.s3Storage.isStagingKey(storageKey);
  }

  getOrganizationPrefix(organizationId: string): string {
    return this.s3Storage.organizationPrefix(organizationId);
  }

  async getOrganizationAssetSummary(
    organizationId: string,
  ): Promise<OrganizationAssetSummary> {
    const prefix = this.getOrganizationPrefix(organizationId);
    const keys = await this.s3Storage.listObjectKeys(prefix);
    return {
      organizationId,
      prefix,
      objectCount: keys.length,
    };
  }

  /**
   * Irreversibly delete every S3 object for this organization and clear DB storage references.
   * Does not remove inline_base64 payloads in PostgreSQL.
   */
  async purgeOrganizationAssets(
    organizationId: string,
    dataSource: DataSource,
    confirmPhrase: string,
  ): Promise<PurgeOrganizationAssetsResult> {
    if (confirmPhrase !== PURGE_ASSETS_CONFIRM_PHRASE) {
      throw new BadRequestException(
        `Confirmation phrase must be exactly: ${PURGE_ASSETS_CONFIRM_PHRASE}`,
      );
    }

    const prefix = this.getOrganizationPrefix(organizationId);
    const s3Result = await this.s3Storage.deleteAllUnderPrefix(prefix);

    let documentReferencesCleared = 0;
    let profilePhotosCleared = 0;
    let organizationLogoCleared = false;

    await dataSource.transaction(async (em) => {
      const docUpdate = await em
        .getRepository(EmployeeDocument)
        .createQueryBuilder()
        .update()
        .set({
          storageKey: null,
          storageDriver: STORAGE_DRIVERS.INLINE_BASE64,
        })
        .where('"storageDriver" = :driver', { driver: STORAGE_DRIVERS.S3 })
        .andWhere(
          `"employeeId" IN (
            SELECT id FROM employees WHERE "organizationId" = :orgId
          )`,
          { orgId: organizationId },
        )
        .execute();
      documentReferencesCleared = docUpdate.affected ?? 0;

      const photoUpdate = await em
        .getRepository(Employee)
        .createQueryBuilder()
        .update()
        .set({ profilePhotoStorageKey: null })
        .where('"organizationId" = :orgId', { orgId: organizationId })
        .andWhere('"profilePhotoStorageKey" IS NOT NULL')
        .execute();
      profilePhotosCleared = photoUpdate.affected ?? 0;

      const settingsRepo = em.getRepository(OrganizationSetting);
      const logoSetting = await settingsRepo.findOne({
        where: { key: SETTING_KEYS.ORG_LOGO },
      });
      if (logoSetting?.value) {
        const isS3Logo =
          this.isS3StorageKey(logoSetting.value) ||
          (typeof logoSetting.value === 'object' &&
            logoSetting.value !== null &&
            'storageKey' in logoSetting.value &&
            this.isS3StorageKey(
              (logoSetting.value as { storageKey: string }).storageKey,
            ));
        if (isS3Logo) {
          logoSetting.value = null;
          await settingsRepo.save(logoSetting);
          organizationLogoCleared = true;
        }
      }
    });

    return {
      organizationId,
      prefix,
      s3ObjectsListed: s3Result.listed,
      s3ObjectsDeleted: s3Result.deleted,
      s3DeleteFailures: s3Result.failed,
      documentReferencesCleared,
      profilePhotosCleared,
      organizationLogoCleared,
    };
  }

  private resolveUploadCategory(dto: UploadFileDto): StorageCategory {
    if (dto.category === 'staging') return 'staging';
    if (dto.module === 'branding') return 'organization-files';
    if (!dto.employeeId && dto.uploadBatchId) return 'staging';
    return 'employee-documents';
  }

  private resolveMaxBytes(module: StorageModule): number {
    const configured = Number(
      this.configService.get<string>('STORAGE_MAX_FILE_BYTES') ||
        DEFAULT_MAX_FILE_BYTES,
    );
    if (module === 'branding') return LOGO_MAX_FILE_BYTES;
    if (module === 'profile-photos') return PROFILE_PHOTO_MAX_FILE_BYTES;
    return configured;
  }

  private assertAllowedFile(
    module: StorageModule,
    mimeType: string,
    fileName: string,
  ): void {
    const ext = extensionFromFilename(fileName);
    const allowedExts =
      module === 'branding' || module === 'profile-photos'
        ? ALLOWED_IMAGE_EXTENSIONS
        : ALLOWED_DOCUMENT_EXTENSIONS;
    const allowedMimes =
      module === 'branding' || module === 'profile-photos'
        ? ALLOWED_IMAGE_MIME_TYPES
        : ALLOWED_DOCUMENT_MIME_TYPES;

    const extOk =
      !ext || allowedExts.some((allowed) => allowed === ext.toLowerCase());
    const mimeOk =
      allowedMimes.has(mimeType) ||
      (mimeType === 'application/octet-stream' && extOk);

    if (!extOk || !mimeOk) {
      throw new BadRequestException('File type is not allowed');
    }
  }
}
