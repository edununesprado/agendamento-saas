import {
  IsIn,
  IsOptional,
} from 'class-validator';

export class ListServicesQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';
}