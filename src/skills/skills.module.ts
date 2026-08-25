import { Module } from '@nestjs/common';
import { SkillMasterController } from './skill-master.controller';
import { SkillMasterService } from './skill-master.service';
import { EssSkillsController } from './ess-skills.controller';
import { EssSkillsService } from './ess-skills.service';
import { HrSkillsController } from './hr-skills.controller';
import { HrSkillsService } from './hr-skills.service';

@Module({
  controllers: [SkillMasterController, EssSkillsController, HrSkillsController],
  providers: [SkillMasterService, EssSkillsService, HrSkillsService],
  exports: [SkillMasterService, EssSkillsService, HrSkillsService],
})
export class SkillsModule {}
