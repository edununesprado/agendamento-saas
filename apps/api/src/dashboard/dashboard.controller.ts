import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import { DashboardService } from './dashboard.service.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';

@Controller('dashboard')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
@Roles(
  'OWNER',
  'ADMIN',
)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get()
  getDashboard(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getDashboard(
      user.tenantId,
      query,
    );
  }
}