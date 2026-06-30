import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  extensionFromFilename,
  sanitizeFilename,
} from './utils/sanitize-filename.util';
import {
  type StorageCategory,
  type StorageModule,
} from './storage.constants';

export interface BuildObjectKeyParams {
  organizationId: string;
  category: StorageCategory;
  module?: StorageModule;
  employeeId?: string;
  leaveRequestId?: string;
  documentType?: string;
  documentId?: string;
  uploadBatchId?: string;
  originalFileName: string;
}

export interface PutObjectParams {
  storageKey: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StoredObjectMeta {
  storageKey: string;
  documentId: string;
}

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly sse: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const bucket = this.configService.get<string>('AWS_BUCKET_NAME');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (!region || !bucket || !accessKeyId || !secretAccessKey) {
      const missing = [
        !region ? 'AWS_REGION' : null,
        !bucket ? 'AWS_BUCKET_NAME' : null,
        !accessKeyId ? 'AWS_ACCESS_KEY_ID' : null,
        !secretAccessKey ? 'AWS_SECRET_ACCESS_KEY' : null,
      ].filter(Boolean);
      this.logger.warn(
        `AWS S3 is not fully configured. Missing: ${missing.join(', ')}. ` +
          'File uploads will fail until these are set in .env and PM2 is reloaded (npm run pm2:sync:orgs).',
      );
    } else {
      this.logger.log(
        `AWS S3 configured: bucket=${bucket}, region=${region || 'ap-southeast-2'}`,
      );
    }

    this.bucket = bucket || '';
    this.sse = this.configService.get<string>('AWS_S3_SSE') || 'AES256';
    this.signedUrlTtlSeconds = Number(
      this.configService.get<string>('AWS_S3_SIGNED_URL_TTL_SECONDS') || 900,
    );

    this.client = new S3Client({
      region: region || 'ap-southeast-2',
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  buildObjectKey(params: BuildObjectKeyParams): StoredObjectMeta {
    const documentId = params.documentId || randomUUID();
    const safeName = sanitizeFilename(params.originalFileName);
    const orgPrefix = `organizations/${params.organizationId}`;

    let storageKey: string;

    if (params.category === 'staging') {
      const batchId = params.uploadBatchId || randomUUID();
      storageKey = `${orgPrefix}/staging/${batchId}/${documentId}_${safeName}`;
      return { storageKey, documentId };
    }

    if (params.category === 'organization-files') {
      if (params.module === 'branding') {
        storageKey = `${orgPrefix}/organization-files/branding/logo/${documentId}_${safeName}`;
      } else {
        storageKey = `${orgPrefix}/organization-files/${params.module || 'misc'}/${documentId}_${safeName}`;
      }
      return { storageKey, documentId };
    }

    const employeeSegment = params.employeeId || 'unknown';
    const docTypeSegment = (params.documentType || 'general')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-');

    if (params.module === 'profile-photos') {
      const ext = extensionFromFilename(safeName) || '.jpg';
      storageKey = `${orgPrefix}/employee-documents/profile-photos/${employeeSegment}/${documentId}${ext}`;
    } else if (params.module === 'leave') {
      const leaveSegment = params.leaveRequestId || 'pending';
      storageKey = `${orgPrefix}/employee-documents/leave/${employeeSegment}/${leaveSegment}/${documentId}_${safeName}`;
    } else {
      storageKey = `${orgPrefix}/employee-documents/onboarding/${employeeSegment}/${docTypeSegment}/${documentId}_${safeName}`;
    }

    return { storageKey, documentId };
  }

  assertConfigured(): void {
    if (!this.bucket) {
      throw new ServiceUnavailableException(
        'File storage is not configured. Set AWS_BUCKET_NAME and credentials.',
      );
    }
  }

  async putObject(params: PutObjectParams): Promise<void> {
    this.assertConfigured();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.storageKey,
        Body: params.body,
        ContentType: params.contentType,
        ServerSideEncryption: this.sse as 'AES256' | 'aws:kms',
        Metadata: params.metadata,
      }),
    );
  }

  async getObjectBuffer(storageKey: string): Promise<Buffer> {
    this.assertConfigured();
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
    const chunks: Uint8Array[] = [];
    const stream = response.Body;
    if (!stream) {
      throw new ServiceUnavailableException('Empty object body from S3');
    }
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedDownloadUrl(
    storageKey: string,
    fileName: string,
    contentType: string,
  ): Promise<string> {
    this.assertConfigured();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
        ResponseContentType: contentType,
      }),
      { expiresIn: this.signedUrlTtlSeconds },
    );
  }

  async getSignedPreviewUrl(
    storageKey: string,
    contentType: string,
  ): Promise<string> {
    this.assertConfigured();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentType: contentType,
      }),
      { expiresIn: this.signedUrlTtlSeconds },
    );
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    this.assertConfigured();
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
        ServerSideEncryption: this.sse as 'AES256' | 'aws:kms',
      }),
    );
  }

  async deleteObject(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    this.assertConfigured();
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to delete S3 object ${storageKey}: ${(err as Error).message}`,
      );
    }
  }

  isOrganizationKey(storageKey: string, organizationId: string): boolean {
    return storageKey.startsWith(`organizations/${organizationId}/`);
  }

  isStagingKey(storageKey: string): boolean {
    return /\/staging\//.test(storageKey);
  }

  organizationPrefix(organizationId: string): string {
    return `organizations/${organizationId}/`;
  }

  /** List every object key under an organization prefix (paginated). */
  async listObjectKeys(prefix: string): Promise<string[]> {
    this.assertConfigured();
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const item of response.Contents ?? []) {
        if (item.Key) keys.push(item.Key);
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return keys;
  }

  /** Delete up to 1000 keys per S3 batch request. */
  async deleteObjects(
    keys: string[],
  ): Promise<{ deleted: number; failed: number }> {
    this.assertConfigured();
    if (keys.length === 0) {
      return { deleted: 0, failed: 0 };
    }

    let deleted = 0;
    let failed = 0;
    const chunkSize = 1000;

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );

      deleted += response.Deleted?.length ?? 0;
      failed += response.Errors?.length ?? 0;

      if (response.Errors?.length) {
        for (const err of response.Errors) {
          this.logger.warn(
            `S3 delete failed for ${err.Key}: ${err.Code} ${err.Message}`,
          );
        }
      }
    }

    return { deleted, failed };
  }

  async deleteAllUnderPrefix(prefix: string): Promise<{
    listed: number;
    deleted: number;
    failed: number;
  }> {
    const keys = await this.listObjectKeys(prefix);
    const { deleted, failed } = await this.deleteObjects(keys);
    return { listed: keys.length, deleted, failed };
  }
}
