import { Global, Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { S3StorageService } from './s3-storage.service';
import { FieldEncryptionService } from '../common/services/field-encryption.service';

@Global()
@Module({
  controllers: [StorageController],
  providers: [S3StorageService, StorageService, FieldEncryptionService],
  exports: [StorageService, S3StorageService],
})
export class StorageModule {}
