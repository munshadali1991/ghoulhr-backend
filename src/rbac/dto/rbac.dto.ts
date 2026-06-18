import {

  IsArray,

  IsOptional,

  IsUUID,

  ArrayNotEmpty,

  IsString,

  IsNotEmpty,

  IsInt,

  Min,

  Max,

  IsEnum,

  ValidateNested,

  ValidateIf,

} from 'class-validator';

import { Type } from 'class-transformer';

import { AccessScope } from '../constants/access-scope.enum';



export class RolePermissionEntryDto {

  @IsString()

  permissionCode: string;



  @IsOptional()

  @IsEnum(AccessScope)

  accessScope?: AccessScope;

}



export class UpdateRolePermissionsDto {

  @ValidateIf((o) => !o.permissions?.length)

  @IsArray()

  @IsString({ each: true })

  permissionCodes?: string[];



  @ValidateIf((o) => !o.permissionCodes?.length)

  @IsArray()

  @ValidateNested({ each: true })

  @Type(() => RolePermissionEntryDto)

  permissions?: RolePermissionEntryDto[];

}



export class AssignEmployeeRolesDto {

  @IsArray()

  @ArrayNotEmpty()

  @IsUUID('4', { each: true })

  roleIds: string[];



  @IsOptional()

  @IsUUID()

  primaryRoleId?: string;

}



export class CreateRoleDto {

  @IsString()

  @IsNotEmpty()

  name: string;



  @IsOptional()

  @IsString()

  description?: string;

}



export class UpdateRoleDto {

  @IsOptional()

  @IsString()

  @IsNotEmpty()

  name?: string;



  @IsOptional()

  @IsString()

  description?: string;

}



export class CloneRoleDto {

  @IsString()

  @IsNotEmpty()

  name: string;



  @IsOptional()

  @IsString()

  description?: string;

}



export class ListAuditLogsQueryDto {

  @IsOptional()

  @Type(() => Number)

  @IsInt()

  @Min(1)

  page?: number;



  @IsOptional()

  @Type(() => Number)

  @IsInt()

  @Min(1)

  @Max(100)

  limit?: number;



  @IsOptional()

  @IsString()

  action?: string;

}



export class SetOrganizationModulesDto {

  @IsArray()

  @IsString({ each: true })

  enabledModuleCodes: string[];

}


