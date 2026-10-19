import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class PublicEmployeesQueryDto {
  @IsString()
  @IsNotEmpty()
  serviceId!: string;
}