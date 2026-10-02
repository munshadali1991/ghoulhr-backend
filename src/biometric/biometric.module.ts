import { Module } from '@nestjs/common';
import { EssModule } from '../ess/ess.module';
import { BiometricIngestService } from './biometric-ingest.service';
import { BiometricDevicesService } from './biometric-devices.service';
import { BiometricMappingService } from './biometric-mapping.service';
import { BiometricAdminController } from './biometric-admin.controller';
import { ZktecoAdmsController } from './zkteco-adms.controller';

@Module({
  imports: [EssModule],
  controllers: [ZktecoAdmsController, BiometricAdminController],
  providers: [
    BiometricIngestService,
    BiometricDevicesService,
    BiometricMappingService,
  ],
  exports: [
    BiometricIngestService,
    BiometricDevicesService,
    BiometricMappingService,
  ],
})
export class BiometricModule {}
