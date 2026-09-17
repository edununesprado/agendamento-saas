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

import { AvailabilityService } from '../availability/availability.service.js';
import { SetAvailabilityDto } from '../availability/dto/set-availability.dto.js';

import { BlockedTimesService } from '../blocked-times/blocked-times.service.js';
import { CreateBlockedTimeDto } from '../blocked-times/dto/create-blocked-time.dto.js';

import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto.js';
import { SetEmployeeServicesDto } from './dto/set-employee-services.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';

import { EmployeesService } from './employees.service.js';

@Controller('employees')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly availabilityService: AvailabilityService,
    private readonly blockedTimesService: BlockedTimesService,
  ) {}

  /**
   * Criar funcionário
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Post()
  @Roles(
    'OWNER',
    'ADMIN',
  )
  create(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateEmployeeDto,
  ) {
    return this.employeesService.create(
      user.tenantId,
      data,
    );
  }

  /**
   * Listar funcionários
   *
   * Todos podem visualizar.
   */
  @Get()
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.employeesService.findAll(
      user.tenantId,
      query,
    );
  }

  /**
   * Ver serviços vinculados
   * ao funcionário.
   *
   * Todos podem visualizar.
   */
  @Get(':id/services')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findServices(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.employeesService.findServices(
      user.tenantId,
      id,
    );
  }

  /**
   * Alterar serviços vinculados
   * ao funcionário.
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Put(':id/services')
  @Roles(
    'OWNER',
    'ADMIN',
  )
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

  /**
   * Visualizar jornada semanal.
   *
   * Todos podem visualizar.
   */
  @Get(':id/availability')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findAvailability(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.availabilityService.findByEmployee(
      user.tenantId,
      id,
    );
  }

  /**
   * Alterar jornada semanal.
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Put(':id/availability')
  @Roles(
    'OWNER',
    'ADMIN',
  )
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

  /**
   * Criar bloqueio de agenda.
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Post(':id/blocked-times')
  @Roles(
    'OWNER',
    'ADMIN',
  )
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

  /**
   * Visualizar bloqueios.
   *
   * Todos podem visualizar.
   */
  @Get(':id/blocked-times')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findBlockedTimes(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.blockedTimesService.findAll(
      user.tenantId,
      id,
    );
  }

  /**
   * Remover bloqueio.
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Delete(':id/blocked-times/:blockedTimeId')
  @Roles(
    'OWNER',
    'ADMIN',
  )
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

  /**
   * Visualizar um funcionário.
   *
   * Todos podem visualizar.
   */
  @Get(':id')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.employeesService.findOne(
      user.tenantId,
      id,
    );
  }

  /**
   * Reativar funcionário.
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Patch(':id/restore')
  @Roles(
    'OWNER',
    'ADMIN',
  )
  restore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.employeesService.restore(
      user.tenantId,
      id,
    );
  }

  /**
   * Editar funcionário.
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Patch(':id')
  @Roles(
    'OWNER',
    'ADMIN',
  )
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

  /**
   * Desativar funcionário.
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ❌
   * STAFF ❌
   */
  @Delete(':id')
  @Roles(
    'OWNER',
    'ADMIN',
  )
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