import { Module } from '@nestjs/common';

import { AvailabilityModule } from '../availability/availability.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

import { PublicBookingController } from './public-booking.controller.js';
import { PublicBookingService } from './public-booking.service.js';

@Module({
  imports: [
    PrismaModule,
    AvailabilityModule,
  ],

  controllers: [
    PublicBookingController,
  ],

  providers: [
    PublicBookingService,
  ],
})
export class PublicBookingModule {}