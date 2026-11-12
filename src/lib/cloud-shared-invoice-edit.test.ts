import { beforeEach,describe,expect,it,vi } from "vitest";
const db=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock("./db",()=>({queryRows:db.read,queryRowsRaw:db.read,execute:db.write,executeRaw:db.write}));
import { updateCloudSupplierPayment } from "./cloud-service";
const invoice={id:"p",period:"202601",supplierId:"supplier",invoiceSupplierId:"supplier",invoiceNo:"shared",invoiceCurrency:"USD",invoiceNetAmount:100,invoiceTaxRate:0,invoiceTaxAmount:0,invoiceTotalAmount:100,invoiceDate:"2026-10-29",invoiceStatus:"issued"};
beforeEach(()=>{
 vi.resetAllMocks();db.write.mockResolvedValue({affectedRows:1});
 db.read.mockImplementation(async(sql:string)=>sql.startsWith("SELECT * FROM merge_cloud_supplier_payments WHERE id")?[invoice]:sql.includes("invoiceNo = :invoiceNo")?[{id:"another-period"}]:[]);
});
describe("editing an already allocated shared invoice",()=>{
 it("allows saving payment information when invoice fields are unchanged",async()=>{
   await updateCloudSupplierPayment("p",{invoiceNo:"shared",invoiceNetAmount:100,invoiceTaxRate:0,invoiceTotalAmount:100,paymentTotalAmount:90,paid:1},null);
   expect(db.write.mock.calls.some(([sql])=>sql.startsWith("UPDATE merge_cloud_supplier_payments SET"))).toBe(true);
 });
 it("blocks changing the allocated invoice amount without changing its number",async()=>{
   await expect(updateCloudSupplierPayment("p",{invoiceTotalAmount:200},null)).rejects.toThrow("发票跨账期分摊");expect(db.write).not.toHaveBeenCalled();
 });
 it("blocks changing shared tax or dates on a single period",async()=>{
   await expect(updateCloudSupplierPayment("p",{invoiceTaxRate:.16},null)).rejects.toThrow("分摊");
   await expect(updateCloudSupplierPayment("p",{invoiceDate:"2026-11-01"},null)).rejects.toThrow("分摊");expect(db.write).not.toHaveBeenCalled();
 });
});
