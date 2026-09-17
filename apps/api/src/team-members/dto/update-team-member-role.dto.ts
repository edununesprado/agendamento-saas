import { IsIn } from 'class-validator';

export class UpdateTeamMemberRoleDto {
  @IsIn([
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  ])
  role!:
    | 'ADMIN'
    | 'RECEPTIONIST'
    | 'STAFF';
}