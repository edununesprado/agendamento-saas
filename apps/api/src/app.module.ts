import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BlockedTimesModule } from './blocked-times/blocked-times.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PublicBookingModule } from './public-booking/public-booking.module.js';
import { ServicesModule } from './services/services.module.js';
import { TeamMembersModule } from './team-members/team-members.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:
        true,
    }),

    /**
     * Habilita os decorators @Cron,
     * @Interval e @Timeout do Nest.
     *
     * O serviço de lembretes ainda verifica
     * APPOINTMENT_REMINDERS_ENABLED antes
     * de executar qualquer processamento.
     */
    ScheduleModule.forRoot(),

    /*
     * Configuração base do rate limiting.
     *
     * Importamos o ThrottlerModule uma única vez.
     * O ThrottlerGuard será aplicado somente ao
     * controller público, então as rotas internas
     * autenticadas não serão limitadas por esta regra.
     *
     * Limite padrão das rotas públicas:
     * 120 requisições por minuto por IP.
     */
    ThrottlerModule.forRoot([
      {
        ttl:
          60_000,

        limit:
          120,
      },
    ]),

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
    TeamMembersModule,
    PublicBookingModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,
  ],
})
export class AppModule {}