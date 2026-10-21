import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EmailService } from './email.service.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    EmailService,
    NotificationsService,
  ],

  exports: [
    NotificationsService,
  ],
})
export class NotificationsModule {}