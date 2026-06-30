import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Body,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { UploadFileDto } from './dto/upload-file.dto';
import { PurgeOrganizationAssetsDto } from './dto/purge-organization-assets.dto';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @RequireAnyPermission(
    'employees:onboard',
    'employees:update',
    'ess.leave:apply',
    'settings.organization:write',
  )
  @ApiOperation({ summary: 'Upload a file to S3 (backend proxy)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string' },
        module: { type: 'string' },
        documentType: { type: 'string' },
        employeeId: { type: 'string', format: 'uuid' },
        leaveRequestId: { type: 'string', format: 'uuid' },
        uploadBatchId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'category', 'module'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const dto = this.parseUploadDto(req);
    if (!dto.category || !dto.module) {
      throw new BadRequestException('category and module are required');
    }
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.storageService.uploadFile(
      req.organization!.id,
      dto,
      file,
      req.user!.sub,
    );
  }

  @Get('documents/:documentId/download')
  @RequireAnyPermission(
    'employees:read',
    'approvals.leave:read',
    'ess.leave:read',
  )
  @ApiOperation({ summary: 'Download an employee document (S3 signed URL or legacy inline)' })
  async downloadDocument(
    @Req() req: TenantRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.storageService.getDocumentDownload(
      req.tenantDataSource!,
      req.organization!.id,
      documentId,
    );

    if (result.mode === 'signedUrl') {
      return { downloadUrl: result.url, fileName: result.fileName, mimeType: result.mimeType };
    }

    return {
      fileName: result.fileName,
      mimeType: result.mimeType,
      dataBase64: result.dataBase64,
    };
  }

  @Get('preview-url')
  @RequireAnyPermission(
    'employees:read',
    'employees:onboard',
    'settings.organization:read',
    'settings.organization:write',
  )
  @ApiOperation({ summary: 'Get a short-lived signed URL for an S3 asset preview' })
  async previewUrl(
    @Req() req: TenantRequest,
    @Query('storageKey') storageKey: string,
    @Query('mimeType') mimeType: string,
  ) {
    const url = await this.storageService.getAssetPreviewUrl(
      req.organization!.id,
      storageKey,
      mimeType || 'application/octet-stream',
    );
    return { url };
  }

  @Get('assets/summary')
  @RequirePermissions('settings.organization:write')
  @ApiOperation({
    summary: 'Count S3 objects stored for the current organization',
  })
  getAssetSummary(@Req() req: TenantRequest) {
    return this.storageService.getOrganizationAssetSummary(req.organization!.id);
  }

  @Delete('assets')
  @RequirePermissions('settings.organization:write')
  @ApiOperation({
    summary:
      'Delete all S3 assets for the current organization (irreversible). Requires confirm phrase.',
  })
  purgeAllAssets(
    @Req() req: TenantRequest,
    @Body() dto: PurgeOrganizationAssetsDto,
  ) {
    return this.storageService.purgeOrganizationAssets(
      req.organization!.id,
      req.tenantDataSource!,
      dto.confirm,
    );
  }

  private parseUploadDto(req: TenantRequest): UploadFileDto {
    const body = req.body as Record<string, string | undefined>;
    return {
      category: body.category as UploadFileDto['category'],
      module: body.module as UploadFileDto['module'],
      documentType: body.documentType,
      employeeId: body.employeeId,
      leaveRequestId: body.leaveRequestId,
      uploadBatchId: body.uploadBatchId,
    };
  }
}
