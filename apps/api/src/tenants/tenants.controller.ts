import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { TenantsService } from './tenants.service.js';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('current')
  findCurrent(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantsService.findCurrent(
      user.tenantId,
    );
  }

  @Patch('current')
  updateCurrent(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateTenantDto,
  ) {
    return this.tenantsService.updateCurrent(
      user.tenantId,
      data,
    );
  }
}