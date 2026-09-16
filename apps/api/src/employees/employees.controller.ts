import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { EmployeesService } from './employees.service.js';
import { SetEmployeeServicesDto } from './dto/set-employee-services.dto.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { SetAvailabilityDto } from '../availability/dto/set-availability.dto.js';
import { BlockedTimesService } from '../blocked-times/blocked-times.service.js';
import { CreateBlockedTimeDto } from '../blocked-times/dto/create-blocked-time.dto.js';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly availabilityService: AvailabilityService,
    private readonly blockedTimesService: BlockedTimesService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateEmployeeDto,
  ) {
    return this.employeesService.create(
      user.tenantId,
      data,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.employeesService.findAll(
      user.tenantId,
      query,
    );
  }

  @Get(':id/services')
findServices(
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
) {
  return this.employeesService.findServices(
    user.tenantId,
    id,
  );
}

@Put(':id/services')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
setServices(
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
  @Body() data: SetEmployeeServicesDto,
) {
  return this.employeesService.setServices(
    user.tenantId,
    id,
    data,
  );
}

@Get(':id/availability')
findAvailability(
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
) {
  return this.availabilityService.findByEmployee(
    user.tenantId,
    id,
  );
}

@Put(':id/availability')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
setAvailability(
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
  @Body() data: SetAvailabilityDto,
) {
  return this.availabilityService.setAvailability(
    user.tenantId,
    id,
    data,
  );
}

@Post(':id/blocked-times')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
createBlockedTime(
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
  @Body() data: CreateBlockedTimeDto,
) {
  return this.blockedTimesService.create(
    user.tenantId,
    id,
    data,
  );
}

@Get(':id/blocked-times')
findBlockedTimes(
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
) {
  return this.blockedTimesService.findAll(
    user.tenantId,
    id,
  );
}

@Delete(':id/blocked-times/:blockedTimeId')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
removeBlockedTime(
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
  @Param('blockedTimeId') blockedTimeId: string,
) {
  return this.blockedTimesService.remove(
    user.tenantId,
    id,
    blockedTimeId,
  );
}

  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.employeesService.findOne(
      user.tenantId,
      id,
    );
  }

  @Patch(':id/restore')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  restore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.employeesService.restore(
      user.tenantId,
      id,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() data: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(
      user.tenantId,
      id,
      data,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.employeesService.remove(
      user.tenantId,
      id,
    );
  }
}