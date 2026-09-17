import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({
  imports: [
    AuthModule,
    AvailabilityModule,
  ],

  controllers: [
    AppointmentsController,
  ],

  providers: [
    AppointmentsService,
  ],

  exports: [
    AppointmentsService,
  ],
})
export class AppointmentsModule {}