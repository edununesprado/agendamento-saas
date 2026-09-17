import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import { AppointmentsService } from './appointments.service.js';

import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

@Controller('appointments')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Post()
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  create(
    @CurrentUser()
    user: JwtPayload,

    @Body()
    data: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(
      user.tenantId,
      data,
    );
  }

  @Get()
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findAll(
    @CurrentUser()
    user: JwtPayload,

    @Query()
    query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentsService.findAll(
      user.tenantId,
      query,
      user.membershipId,
      user.role,
    );
  }

  @Get(':id')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findOne(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,
  ) {
    return this.appointmentsService.findOne(
      user.tenantId,
      id,
      user.membershipId,
      user.role,
    );
  }

  @Patch(':id/status')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  updateStatus(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,

    @Body()
    data: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(
      user.tenantId,
      id,
      data,
    );
  }

  @Patch(':id/cancel')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  cancel(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,

    @Body()
    data: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancel(
      user.tenantId,
      id,
      data,
    );
  }

  @Patch(':id/reschedule')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  reschedule(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,

    @Body()
    data: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(
      user.tenantId,
      id,
      data,
    );
  }
}