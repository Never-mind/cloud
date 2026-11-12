import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "./auth";
import { getPermissionStateForEmail } from "./permission-service";
import { hasPermission, type PermissionAction } from "./permission-definitions";
import { ProspectError } from "./prospect-service";
export async function requireProspectAccess(request: NextRequest, action: PermissionAction, customerAction?: PermissionAction) {
  const actor=await getAuthenticatedUser(request);
  if(!actor || actor.status!=="active")throw new ProspectError("未登录或账号已停用",401);
  const permissions=await getPermissionStateForEmail(actor.email);
  const viewCustomer = hasPermission(permissions,"customers","view");
  if(!hasPermission(permissions,"prospects",action) || (customerAction && (!viewCustomer || !hasPermission(permissions,"customers",customerAction))))throw new ProspectError("当前账号没有执行该操作的权限",403);
  return {actor,capabilities:{create:hasPermission(permissions,"prospects","create"),update:hasPermission(permissions,"prospects","update"),delete:hasPermission(permissions,"prospects","delete"),convert:hasPermission(permissions,"prospects","confirm"),createCustomer:viewCustomer&&hasPermission(permissions,"customers","create"),viewCustomer}};
}
export function prospectErrorResponse(error: unknown) {
  return NextResponse.json({error:error instanceof Error?error.message:"操作失败",candidates:error instanceof ProspectError?error.candidates:[]},{status:error instanceof ProspectError?error.status:400});
}
