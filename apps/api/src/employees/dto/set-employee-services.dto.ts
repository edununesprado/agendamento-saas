import {
  ArrayUnique,
  IsArray,
  IsString,
} from 'class-validator';

export class SetEmployeeServicesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds!: string[];
}