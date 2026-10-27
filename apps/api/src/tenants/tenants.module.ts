
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';

import {
  PublicTenantLogoController,
  TenantLogoController,
  TenantsController,
} from './tenants.controller.js';

import { TenantLogoService } from './tenant-logo.service.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [
    AuthModule,
  ],

  controllers: [
    TenantsController,
    TenantLogoController,
    PublicTenantLogoController,
  ],

  providers: [
    TenantsService,
    TenantLogoService,
  ],

  exports: [
    TenantsService,
  ],
})
export class TenantsModule {}
