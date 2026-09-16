import { Module } from '@nestjs/common';

import { BlockedTimesService } from './blocked-times.service.js';

@Module({
  providers: [
    BlockedTimesService,
  ],
  exports: [
    BlockedTimesService,
  ],
})
export class BlockedTimesModule {}