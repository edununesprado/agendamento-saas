import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { BlockedTimesModule } from '../blocked-times/blocked-times.module.js';

@Module({
  imports: [
    AuthModule,
    AvailabilityModule,
    BlockedTimesModule,
  ],

  controllers: [
    EmployeesController,
  ],

  providers: [
    EmployeesService,
  ],

  exports: [
    EmployeesService,
  ],
})
export class EmployeesModule {}