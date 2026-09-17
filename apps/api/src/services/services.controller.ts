import {
  Body,
  Controller,
  Delete,
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

import { CreateServiceDto } from './dto/create-service.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServicesService } from './services.service.js';

@Controller('services')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
  ) {}

  /**
   * Criar serviço
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
    @Body() data: CreateServiceDto,
  ) {
    return this.servicesService.create(
      user.tenantId,
      data,
    );
  }

  /**
   * Listar serviços
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
    @Query() query: ListServicesQueryDto,
  ) {
    return this.servicesService.findAll(
      user.tenantId,
      query,
    );
  }

  /**
   * Visualizar um serviço
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
    return this.servicesService.findOne(
      user.tenantId,
      id,
    );
  }

  /**
   * Reativar serviço
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
    return this.servicesService.restore(
      user.tenantId,
      id,
    );
  }

  /**
   * Editar serviço
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
    @Body() data: UpdateServiceDto,
  ) {
    return this.servicesService.update(
      user.tenantId,
      id,
      data,
    );
  }

  /**
   * Desativar serviço
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
    return this.servicesService.remove(
      user.tenantId,
      id,
    );
  }
}