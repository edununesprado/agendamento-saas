import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppointmentRemindersService } from './appointment-reminders.service.js';
import { EmailService } from './email.service.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    EmailService,
    NotificationsService,
    AppointmentRemindersService,
  ],

  exports: [
    NotificationsService,
    AppointmentRemindersService,
  ],
})
export class NotificationsModule {}