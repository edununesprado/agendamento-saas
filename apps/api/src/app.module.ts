import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ServicesModule } from './services/services.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BlockedTimesModule } from './blocked-times/blocked-times.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    HealthModule,
    TenantsModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    EmployeesModule,
    ClientsModule,
    AvailabilityModule,
    BlockedTimesModule,
    AppointmentsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}