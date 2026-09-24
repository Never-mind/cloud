import { LoginPage } from "@/components/login-page";
import { isFeishuLoginEnabled } from "@/lib/feishu-auth-config";

export default function Page() {
  return <LoginPage feishuEnabled={isFeishuLoginEnabled()} />;
}
