import { LoginPage } from "@/components/login-page";
import { feishuAutoProvisionEnabled, isFeishuLoginEnabled } from "@/lib/feishu-auth-config";

export default function Page() {
  return <LoginPage feishuEnabled={isFeishuLoginEnabled()} feishuAutoProvision={feishuAutoProvisionEnabled()} />;
}
