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

import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { ListClientsQueryDto } from './dto/list-clients-query.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Controller('clients')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
  ) {}

  /**
   * Criar cliente
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ✅
   * STAFF ❌
   */
  @Post()
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  create(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateClientDto,
  ) {
    return this.clientsService.create(
      user.tenantId,
      data,
    );
  }

  /**
   * Listar clientes
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
    @Query() query: ListClientsQueryDto,
  ) {
    return this.clientsService.findAll(
      user.tenantId,
      query,
    );
  }

  /**
   * Visualizar um cliente
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
    return this.clientsService.findOne(
      user.tenantId,
      id,
    );
  }

  /**
   * Reativar cliente
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ✅
   * STAFF ❌
   */
  @Patch(':id/restore')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  restore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.clientsService.restore(
      user.tenantId,
      id,
    );
  }

  /**
   * Editar cliente
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ✅
   * STAFF ❌
   */
  @Patch(':id')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() data: UpdateClientDto,
  ) {
    return this.clientsService.update(
      user.tenantId,
      id,
      data,
    );
  }

  /**
   * Desativar cliente
   *
   * OWNER ✅
   * ADMIN ✅
   * RECEPTIONIST ✅
   * STAFF ❌
   */
  @Delete(':id')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.clientsService.remove(
      user.tenantId,
      id,
    );
  }
}