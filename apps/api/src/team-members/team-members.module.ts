import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { TeamMembersController } from './team-members.controller.js';
import { TeamMembersService } from './team-members.service.js';

@Module({
  imports: [
    AuthModule,
  ],

  controllers: [
    TeamMembersController,
  ],

  providers: [
    TeamMembersService,
  ],

  exports: [
    TeamMembersService,
  ],
})
export class TeamMembersModule {}