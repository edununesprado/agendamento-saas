
import { Module } from '@nestjs/common';

import { AvailabilityModule } from '../availability/availability.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

import { PublicBookingController } from './public-booking.controller.js';
import { PublicBookingService } from './public-booking.service.js';
import { TurnstileVerificationService } from './turnstile-verification.service.js';

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
    TurnstileVerificationService,
  ],
})
export class PublicBookingModule {}
