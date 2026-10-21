import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({
  imports: [
    AuthModule,
    AvailabilityModule,
    NotificationsModule,
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