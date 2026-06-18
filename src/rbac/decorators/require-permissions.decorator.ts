import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissions_mode';

export type PermissionsMode = 'all' | 'any';

export const RequirePermissions = (
  ...permissions: string[]
) => SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAnyPermission = (
  ...permissions: string[]
) => {
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key!, descriptor!);
    SetMetadata(PERMISSIONS_MODE_KEY, 'any')(target, key!, descriptor!);
  };
};
