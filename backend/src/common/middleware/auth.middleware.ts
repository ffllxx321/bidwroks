import { Request, Response, NextFunction } from "express";
import { UserRoleType, PermissionType } from "../../modules/permissions/constants.ts";
import { hasPermission } from "../../modules/permissions/permission-checker.ts";

/**
 * Custom express request decorator containing credential states.
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role: UserRoleType;
  };
}

/**
 * Guard middleware checking request headers for authentication.
 * Defaults to reading `x-user-role` and `x-user-id` for robust local simulation of multiple workstations.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = (req.headers["x-user-id"] as string) || "user-001";
  const roleName = (req.headers["x-user-role"] as string) || "Viewer";
  const username = (req.headers["x-username"] as string) || "Anonymous";

  const resolvedRole = UserRoleType[roleName as keyof typeof UserRoleType] || UserRoleType.Viewer;

  req.user = {
    userId,
    username,
    role: resolvedRole,
  };

  next();
}

/**
 * Access Control Gate restricting endpoint access based on action permissions.
 */
export function guardPermission(action: PermissionType) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Authenticate first
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED: Session or header credentials missing." });
    }

    const isPermitted = hasPermission(
      { userId: req.user.userId, role: req.user.role },
      action
    );

    if (!isPermitted) {
      console.warn(`[ACCESS-DENIED] User [${req.user.username}] as [${req.user.role}] attempted to run restricted action: [${action}]`);
      return res.status(403).json({
        error: `FORBIDDEN_ACCESS: User role [${req.user.role}] is not authorized to execute action: [${action}]`,
      });
    }

    next();
  };
}
