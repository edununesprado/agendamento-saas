import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('database')
  async database() {
    const tenants = await this.prisma.tenant.count();

    return {
      status: 'ok',
      database: 'connected',
      tenants,
    };
  }
}