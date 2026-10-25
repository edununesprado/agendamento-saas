
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module.js';

import { AppointmentRemindersService } from './appointment-reminders.service.js';
import { EmailService } from './email.service.js';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationWorkerService } from './notification-worker.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
  ],

  controllers: [
    NotificationsController,
  ],

  providers: [
    EmailService,
    NotificationsService,
    NotificationQueueService,
    NotificationWorkerService,
    AppointmentRemindersService,
  ],

  exports: [
    NotificationsService,
    NotificationQueueService,
    NotificationWorkerService,
    AppointmentRemindersService,
  ],
})
export class NotificationsModule {}
