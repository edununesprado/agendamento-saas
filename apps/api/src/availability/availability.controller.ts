import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import { AvailabilityService } from './availability.service.js';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto.js';

@Controller('availability')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get()
  findAvailableSlots(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetAvailableSlotsDto,
  ) {
    return this.availabilityService.getAvailableSlots(
      user.tenantId,
      query.employeeId,
      query.serviceId,
      query.date,
    );
  }
}