import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { BiometricIngestService } from './biometric-ingest.service';

/**
 * ZKTeco / eSSL ADMS device ingress — no JWT.
 * Devices must hit the tenant subdomain/port so TenantResolverMiddleware attaches DB.
 */
@ApiExcludeController()
@Controller('iclock')
export class ZktecoAdmsController {
  private readonly logger = new Logger(ZktecoAdmsController.name);

  constructor(private readonly ingestService: BiometricIngestService) {}

  @Get('cdata')
  @Post('cdata')
  async cdata(@Req() req: TenantRequest, @Res() res: Response) {
    const organizationId = req.organization?.id as string | undefined;
    const dataSource = req.tenantDataSource;

    if (!organizationId || !dataSource) {
      this.logger.warn('ADMS /iclock/cdata without tenant context');
      return res.status(HttpStatus.BAD_REQUEST).type('text/plain').send('No tenant');
    }

    const result = await this.ingestService.handleZktecoCdata(
      dataSource,
      organizationId,
      req.query as Record<string, unknown>,
      req.headers as Record<string, unknown>,
      req.body,
    );

    return res.status(result.statusCode).type('text/plain').send(result.body);
  }

  /** Firmware polls for pending commands — V1 acknowledges with OK (no push commands). */
  @Get('getrequest')
  getRequest(@Res() res: Response) {
    return res.status(HttpStatus.OK).type('text/plain').send('OK');
  }

  @Post('devicecmd')
  deviceCmd(@Res() res: Response) {
    return res.status(HttpStatus.OK).type('text/plain').send('OK');
  }
}
