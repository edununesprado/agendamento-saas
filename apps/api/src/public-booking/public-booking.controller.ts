import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  Throttle,
  ThrottlerGuard,
} from '@nestjs/throttler';

import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto.js';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto.js';
import { PublicEmployeesQueryDto } from './dto/public-employees-query.dto.js';
import { PublicBookingService } from './public-booking.service.js';

@Controller(
  'public/tenants/:slug',
)
@UseGuards(
  ThrottlerGuard,
)
export class PublicBookingController {
  constructor(
    private readonly publicBookingService: PublicBookingService,
  ) {}

  @Get()
  findTenant(
    @Param('slug') slug: string,
  ) {
    return this.publicBookingService.findTenant(
      slug,
    );
  }

  @Get('services')
  findServices(
    @Param('slug') slug: string,
  ) {
    return this.publicBookingService.findServices(
      slug,
    );
  }

  @Get('employees')
  findEmployees(
    @Param('slug') slug: string,

    @Query()
    query: PublicEmployeesQueryDto,
  ) {
    return this.publicBookingService.findEmployees(
      slug,
      query,
    );
  }

  @Get('availability')
  findAvailability(
    @Param('slug') slug: string,

    @Query()
    query: PublicAvailabilityQueryDto,
  ) {
    return this.publicBookingService.findAvailability(
      slug,
      query,
    );
  }

  /*
   * A criação de agendamento recebe um limite
   * mais restrito do que as consultas públicas.
   *
   * Máximo:
   * 20 tentativas por minuto por IP.
   *
   * Quando o limite for ultrapassado,
   * o Nest responderá HTTP 429.
   */
  @Post('appointments')
  @Throttle({
    default: {
      ttl: 60_000,
      limit: 20,
    },
  })
  createAppointment(
    @Param('slug') slug: string,

    @Body()
    data: CreatePublicAppointmentDto,
  ) {
    return this.publicBookingService.createAppointment(
      slug,
      data,
    );
  }
}
