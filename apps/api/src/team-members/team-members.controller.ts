import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import { CreateTeamMemberDto } from './dto/create-team-member.dto.js';
import { LinkTeamMemberEmployeeDto } from './dto/link-team-member-employee.dto.js';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto.js';

import { TeamMembersService } from './team-members.service.js';

@Controller('team-members')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
export class TeamMembersController {
  constructor(
    private readonly teamMembersService: TeamMembersService,
  ) {}

  /**
   * OWNER e ADMIN podem
   * visualizar os usuários.
   */
  @Get()
  @Roles(
    'OWNER',
    'ADMIN',
  )
  findAll(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamMembersService.findAll(
      user.tenantId,
    );
  }

  /**
   * Somente OWNER cria usuários.
   */
  @Post()
  @Roles('OWNER')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateTeamMemberDto,
  ) {
    return this.teamMembersService.create(
      user.tenantId,
      data,
    );
  }

  /**
   * Somente OWNER altera funções.
   */
  @Patch(':id/role')
  @Roles('OWNER')
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() data: UpdateTeamMemberRoleDto,
  ) {
    return this.teamMembersService.updateRole(
      user.tenantId,
      id,
      data,
    );
  }

  /**
   * Somente OWNER pode vincular
   * login STAFF a Employee.
   */
  @Patch(':id/employee')
  @Roles('OWNER')
  linkEmployee(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() data: LinkTeamMemberEmployeeDto,
  ) {
    return this.teamMembersService.linkEmployee(
      user.tenantId,
      id,
      data,
    );
  }
}