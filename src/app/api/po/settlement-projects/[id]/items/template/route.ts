import { NextResponse } from "next/server";
import { settlementItemsTemplate } from "@/lib/settlement-project-service";

export async function GET() {
  const buffer = settlementItemsTemplate();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=settlement-unpurchased-template.xlsx",
    },
  });
}
