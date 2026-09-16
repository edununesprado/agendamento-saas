import { Test, TestingModule } from '@nestjs/testing';
import { BlockedTimesService } from './blocked-times.service.js';

describe('BlockedTimesService', () => {
  let service: BlockedTimesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlockedTimesService],
    }).compile();

    service = module.get<BlockedTimesService>(BlockedTimesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
