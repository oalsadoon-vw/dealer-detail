import { NextResponse } from "next/server";
import { resolveTenantContext, type TenantContext } from "@/lib/server/tenant-context";
import { isAppError } from "@/lib/server/errors";

export type { TenantContext };

/**
 * Wraps a Next.js API route handler with tenant context resolution.
 *
 * Resolves the authenticated user + org context. If any step fails,
 * returns the appropriate HTTP error (401/403). If the handler itself
 * throws an AppError, it is converted to an HTTP response.
 */
export function withAuth<TCtx = unknown>(
  handler: (
    req: Request,
    routeCtx: TCtx,
    tc: TenantContext
  ) => Promise<NextResponse> | NextResponse
) {
  return async (req: Request, routeCtx: TCtx) => {
    try {
      const tc = await resolveTenantContext();
      return await handler(req, routeCtx, tc);
    } catch (err) {
      if (isAppError(err)) {
        return NextResponse.json(
          { error: err.message },
          { status: err.statusCode }
        );
      }
      throw err;
    }
  };
}
