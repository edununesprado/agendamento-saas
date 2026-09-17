import {
  IsDateString,
  IsString,
} from 'class-validator';

export class GetAvailableSlotsDto {
  @IsString()
  employeeId!: string;

  @IsString()
  serviceId!: string;

  @IsDateString()
  date!: string;
}