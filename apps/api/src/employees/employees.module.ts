import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  imports: [
    AuthModule,
    AvailabilityModule,
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