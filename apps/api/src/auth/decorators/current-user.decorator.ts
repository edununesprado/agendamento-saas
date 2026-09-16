import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import type { JwtPayload } from '../types/jwt-payload.js';

export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | undefined,
    context: ExecutionContext,
  ) => {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    if (!data) {
      return user;
    }

    return user?.[data];
  },
);