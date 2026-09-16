import {
  IsIn,
  IsOptional,
} from 'class-validator';

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';
}