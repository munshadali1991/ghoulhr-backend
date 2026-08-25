import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { DOCUMENT_CENTRE_MAX_FILE_BYTES } from '../storage/storage.constants';
import { DocumentCentreService } from './document-centre.service';
import {
  DocumentCentreCategory,
  DocumentCentreSubcategory,
} from './entities/document-centre-document.entity';
import {
  Form16UploadMetaDto,
  ListDocumentsQueryDto,
  PublicDocumentUploadMetaDto,
  UpdateDocumentDto,
} from './dto/document-centre.dto';

@ApiTags('Document Centre')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('document-centre')
export class DocumentCentreController {
  constructor(private readonly documentCentreService: DocumentCentreService) {}

  @Get('documents')
  @RequireAnyPermission('ess.documents:read', 'documents:read')
  @ApiOperation({ summary: 'List Document Centre documents (scoped)' })
  async listDocuments(
    @Req() req: TenantRequest,
    @Query() query: ListDocumentsQueryDto,
  ) {
    const canViewAll = await this.documentCentreService.canManageAll(
      req.organization!.id,
      req.user!.sub,
      req.tenantDataSource!,
      req,
    );
    return this.documentCentreService.listDocuments(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      canViewAll,
      query,
    );
  }

  @Get('documents/:id/download')
  @RequireAnyPermission('ess.documents:read', 'documents:read')
  @ApiOperation({ summary: 'Get signed download URL for a document' })
  async download(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const canViewAll = await this.documentCentreService.canManageAll(
      req.organization!.id,
      req.user!.sub,
      req.tenantDataSource!,
      req,
    );
    return this.documentCentreService.getDownload(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      canViewAll,
      id,
    );
  }

  @Get('documents/:id/preview')
  @RequireAnyPermission('ess.documents:read', 'documents:read')
  @ApiOperation({ summary: 'Get signed inline preview URL for a document' })
  async preview(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const canViewAll = await this.documentCentreService.canManageAll(
      req.organization!.id,
      req.user!.sub,
      req.tenantDataSource!,
      req,
    );
    return this.documentCentreService.getPreview(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      canViewAll,
      id,
    );
  }

  @Patch('documents/:id')
  @RequirePermissions('documents:write')
  @ApiOperation({ summary: 'Update document metadata' })
  update(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentCentreService.updateDocument(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
    );
  }

  @Delete('documents/:id')
  @RequirePermissions('documents:write')
  @ApiOperation({ summary: 'Soft-delete a document' })
  remove(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentCentreService.softDelete(
      req.tenantDataSource!,
      req.organization!.id,
      id,
    );
  }

  @Post('policies')
  @RequirePermissions('documents:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        subcategory: { type: 'string', enum: ['GENERAL', 'HR'] },
      },
      required: ['file', 'title', 'subcategory'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_CENTRE_MAX_FILE_BYTES },
    }),
  )
  uploadPolicy(
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: PublicDocumentUploadMetaDto,
  ) {
    if (!body.subcategory) {
      throw new BadRequestException('subcategory is required for policies');
    }
    return this.documentCentreService.uploadPublicDocument(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      DocumentCentreCategory.POLICY,
      body.title,
      file,
      body.subcategory as DocumentCentreSubcategory,
    );
  }

  @Post('forms')
  @RequirePermissions('documents:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
      },
      required: ['file', 'title'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_CENTRE_MAX_FILE_BYTES },
    }),
  )
  uploadForm(
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: PublicDocumentUploadMetaDto,
  ) {
    return this.documentCentreService.uploadPublicDocument(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      DocumentCentreCategory.FORM,
      body.title,
      file,
    );
  }

  @Post('form16/upload')
  @RequirePermissions('documents:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        financialYear: { type: 'string' },
        employeeId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'financialYear'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_CENTRE_MAX_FILE_BYTES },
    }),
  )
  uploadForm16(
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Form16UploadMetaDto,
  ) {
    return this.documentCentreService.uploadForm16(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      file,
      body.financialYear,
      body.employeeId,
    );
  }
}
