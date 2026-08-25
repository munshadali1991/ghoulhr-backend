import { Module } from '@nestjs/common';
import { DocumentCentreController } from './document-centre.controller';
import { DocumentCentreService } from './document-centre.service';

@Module({
  controllers: [DocumentCentreController],
  providers: [DocumentCentreService],
  exports: [DocumentCentreService],
})
export class DocumentCentreModule {}
