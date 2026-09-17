import { IsDateString } from 'class-validator';

export class DashboardQueryDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}