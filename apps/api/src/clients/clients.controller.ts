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
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'RECEPTIONIST')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateClientDto,
  ) {
    return this.clientsService.create(
      user.tenantId,
      data,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListClientsQueryDto,
  ) {
    return this.clientsService.findAll(
      user.tenantId,
      query,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.clientsService.findOne(
      user.tenantId,
      id,
    );
  }

  @Patch(':id/restore')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'RECEPTIONIST')
  restore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.clientsService.restore(
      user.tenantId,
      id,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'RECEPTIONIST')
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

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
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