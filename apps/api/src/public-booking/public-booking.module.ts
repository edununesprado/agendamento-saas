import { Module } from '@nestjs/common';

import { AvailabilityModule } from '../availability/availability.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

import { PublicBookingController } from './public-booking.controller.js';
import { PublicBookingService } from './public-booking.service.js';

@Module({
  imports: [
    PrismaModule,
    AvailabilityModule,
    NotificationsModule,
  ],

  controllers: [
    PublicBookingController,
  ],

  providers: [
    PublicBookingService,
  ],
})
export class PublicBookingModule {}