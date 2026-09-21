import { EntityPage } from "@/components/entity-page";
import { getEntityConfig } from "@/lib/modules";

export default function Page() {
  // 物流行由采购确认生成或按需求单号从远端补齐，不允许绕过上游流程手工新建；
  // 但历史数据要能靠"批量导入 + 下载模板"补录，所以只关新建、保留导入入口。
  return <EntityPage config={getEntityConfig("shipments")!} hideCreate />;
}
