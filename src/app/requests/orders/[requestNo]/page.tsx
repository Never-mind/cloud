import { RequestOrderFormPage } from "@/components/request-order-form-page";

export default async function Page({
  params,
}: {
  params: Promise<{ requestNo: string }>;
}) {
  const { requestNo } = await params;

  return <RequestOrderFormPage requestNo={decodeURIComponent(requestNo)} />;
}
