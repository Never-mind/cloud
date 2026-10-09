/**
 * 飞书审批开票联调脚本。
 *
 *   npm run feishu:invoice-approval -- --dry-run            只打印将要提交的表单 JSON
 *   npm run feishu:invoice-approval -- --submit --open-id ou_xxx   真实发起一条审批
 *   npm run feishu:invoice-approval -- --sync <instance_code>      查一条审批的状态并回写台账
 *
 * 默认是 dry-run：不会真的发起审批，避免误打扰审批人。
 */
import { closeDb } from "../src/lib/db";
import {
  PAYMENT_METHOD_OPTIONS,
  CFDI_OPTIONS,
  COMPANY_OPTIONS,
  buildInvoiceApprovalForm,
  fetchInvoiceApprovalInstance,
  getInvoiceApprovalCode,
  resolveInvoiceApprovalParty,
  submitInvoiceApproval,
  syncInvoiceApproval,
  type InvoiceApprovalFormInput,
} from "../src/lib/feishu-approval-service";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "") : "";
}

/** 一条示例开票申请（真实联调时把这里换成界面传进来的值即可）。 */
function sampleForm(): InvoiceApprovalFormInput {
  return {
    branch: "mx",
    companyOptionKey: COMPANY_OPTIONS.newmedia.key,
    purpose: "202610 · 华为（墨西哥）· 墨西哥滴滴需求5台F5服务器",
    paymentReceivedTime: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    mexico: {
      customerName: "DAS Payments Mexico, S.A. de C.V.",
      taxId: "DPM2305243F7",
      taxRegime: "Régimen General de Ley Personas Morales",
      paymentMethodKey: PAYMENT_METHOD_OPTIONS.PPD.key,
      address: "Av. Reforma, No 509, piso 33, Alcaldía Cuauhtémoc, Ciudad de México, C.P. 06500",
      postCode: "06500",
      amountIncludingTax: 207475.37,
      invoiceContent: "project",
      cfdiCodeKey: CFDI_OPTIONS.G03.key,
      cfsFileTokens: ["TEST_FILE_TOKEN"],
    },
  };
}

async function main() {
  const submit = process.argv.includes("--submit");
  const syncCode = argValue("--sync");

  if (syncCode) {
    const remote = await fetchInvoiceApprovalInstance(syncCode);
    console.log("飞书侧状态：", JSON.stringify(remote, null, 2));
    const synced = await syncInvoiceApproval(syncCode);
    console.log("回写结果：", JSON.stringify(synced, null, 2));
    return;
  }

  const form = sampleForm();
  const party = resolveInvoiceApprovalParty({ undertakingUnitCode: "MXGS01", undertakingUnitName: "LUZ NEWMEDIA" });
  console.log(`审批定义 code：${getInvoiceApprovalCode()}`);
  console.log(`主体解析：${JSON.stringify(party)}`);
  const fields = buildInvoiceApprovalForm(form);
  console.log(`表单字段数：${fields.length}`);
  console.log(JSON.stringify(fields, null, 2));

  if (!submit) {
    console.log("\n（dry-run：没有真正发起审批。要真实发起请加 --submit --open-id ou_xxx）");
    return;
  }

  const openId = argValue("--open-id");
  if (!openId) throw new Error("真实发起需要 --open-id 指定发起人（会用他的飞书身份发起）");
  const result = await submitInvoiceApproval({
    ownerType: "cloud_row",
    ownerId: "SELF-TEST",
    ownerNo: "SELF-TEST",
    period: form.purpose.slice(0, 6),
    starterOpenId: openId,
    starterName: "联调脚本",
    form: fields,
    title: form.purpose,
  });
  console.log("\n已发起审批：", JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("执行失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
