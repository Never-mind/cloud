import {beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("./db",()=>({queryRowsRaw:mock.query}));
import {listInvoices} from "./invoice-service";
beforeEach(()=>{vi.resetAllMocks();mock.query.mockResolvedValue([]);});
describe("invoice list approval lookup",()=>{
 it("searches approval serials and real partner columns for both count and list queries",async()=>{await listInvoices({keyword:"202610280008"});expect(mock.query).toHaveBeenCalledTimes(2);for(const [sql,params] of mock.query.mock.calls){expect(sql).toContain("a.serialNumber LIKE :keyword");expect(sql).not.toContain("i.customerDisplayName LIKE");expect(params.keyword).toBe("%202610280008%");}});
 it("returns approval numbers alongside invoice numbers without duplicating rows",async()=>{await listInvoices();const sql=mock.query.mock.calls[1][0];expect(sql).toContain("AS approvalSerialNumber");expect(sql).toContain("a.instanceCode = i.approvalInstanceCode");});
});
