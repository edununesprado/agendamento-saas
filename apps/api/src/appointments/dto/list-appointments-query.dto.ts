import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class ListAppointmentsQueryDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsIn([
    'PENDING',
    'CONFIRMED',
    'COMPLETED',
    'CANCELED',
    'NO_SHOW',
  ])
  status?:
    | 'PENDING'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'CANCELED'
    | 'NO_SHOW';
}