import { closeDb, execute } from "../src/lib/db";

async function insert(table: string, rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const names = columns.map((column) => `\`${column}\``).join(", ");
    const values = columns.map((column) => `:${column}`).join(", ");
    const updates = columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(", ");
    await execute(
      `INSERT INTO \`${table}\` (${names}) VALUES (${values}) ON DUPLICATE KEY UPDATE ${updates}`,
      row,
    );
  }
}

async function main() {
  await insert("countries", [
    { code: "CN", nameZh: "中国", nameEn: "China", nameLocal: "中国" },
    { code: "CL", nameZh: "智利", nameEn: "Chile", nameLocal: "Chile" },
    { code: "BR", nameZh: "巴西", nameEn: "Brazil", nameLocal: "Brasil" },
    { code: "MX", nameZh: "墨西哥", nameEn: "Mexico", nameLocal: "Mexico" },
  ]);

  await insert("deliverylocations", [
    { locationId: "待补充", countryCode: "CN", locationType: "Pending", nameZh: "待补充", nameEn: "Pending", fullAddress: "待补充" },
    { locationId: "CL-CDC-AZ1", countryCode: "CL", locationType: "Datacenter", nameZh: "智利CDC Paine AZ1", nameEn: "Chile CDC Paine AZ1", fullAddress: "Avenida Presidente Prieto 226, Paine, Region Metropolitana, Chile." },
    { locationId: "CL-CDC-AZ2", countryCode: "CL", locationType: "Datacenter", nameZh: "智利CDC Claro AZ2", nameEn: "Chile CDC Claro AZ2", fullAddress: "Liray 1120, Colina, Region Metropolitana, Chile." },
    { locationId: "BR-SP-WH1", countryCode: "BR", locationType: "Warehouse", nameZh: "巴西圣保罗仓", nameEn: "Sao Paulo Warehouse", fullAddress: "Av. Paulista 1000, Sao Paulo, Brazil." },
    { locationId: "MX-MEX-DC1", countryCode: "MX", locationType: "Datacenter", nameZh: "墨西哥城机房", nameEn: "Mexico City DC1", fullAddress: "Av. Reforma 88, Mexico City, Mexico." },
  ]);

  await insert("deliverycontacts", [
    { contactId: "待补充", locationId: "待补充", name: "待补充", phone: "待补充", email: "pending@example.com" },
    { contactId: "CT-CL-AXEL", locationId: "CL-CDC-AZ1", name: "axeltamayo", phone: "0056968528930", email: "axel@example.com" },
    { contactId: "CT-CL-FRANCISCO", locationId: "CL-CDC-AZ2", name: "Francisco Pardo", phone: "0056994102248", email: "francisco@example.com" },
    { contactId: "CT-BR-MARIA", locationId: "BR-SP-WH1", name: "Maria Silva", phone: "00551188889999", email: "maria@example.com" },
  ]);

  await insert("datacenters", [
    { dcCode: "CL-AZ1", locationId: "CL-CDC-AZ1", nameZh: "智利AZ1", nameEn: "Chile AZ1" },
    { dcCode: "CL-AZ2", locationId: "CL-CDC-AZ2", nameZh: "智利AZ2", nameEn: "Chile AZ2" },
    { dcCode: "MX-DC1", locationId: "MX-MEX-DC1", nameZh: "墨西哥DC1", nameEn: "Mexico DC1" },
  ]);

  await insert("suppliers", [
    { supplierId: "SUP-HT", supplierCode: "HT", name: "HT ODM" },
    { supplierId: "SUP-ODMA", supplierCode: "ODM-A", name: "ODM Supplier A" },
    { supplierId: "SUP-ODMB", supplierCode: "ODM-B", name: "ODM Supplier B" },
  ]);

  await insert("instancemodels", [
    { deviceCode: "06114026", modelCode: "HV777.0.0.6", xxllCode: "XXLL-COMPUTE-A", nameZh: "计算增强型 A", nameEn: "Compute Enhanced A" },
    { deviceCode: "06113690", modelCode: "SV761.0.0.6", xxllCode: "XXLL-STORAGE-A", nameZh: "存储型 A", nameEn: "Storage A" },
    { deviceCode: "06114833", modelCode: "kAV613.0.0.6", xxllCode: "XXLL-GPU-A", nameZh: "GPU加速型 A", nameEn: "GPU Accelerated A" },
  ]);

  await insert("requests", [
    { requestNo: "REQ-2026-001", countryCode: "CL", contractNo: "IC-CL-2026", batchName: "CL第1批7台", requestType: "整机", status: "待采购", plannedDeliveryDate: "2026-07-18" },
    { requestNo: "REQ-2026-002", countryCode: "CL", contractNo: "IC-CL-2026", batchName: "CL第2批4台", requestType: "整机", status: "采购中", plannedDeliveryDate: "2026-07-28" },
    { requestNo: "REQ-2026-003", countryCode: "BR", contractNo: "IC-BR-2026", batchName: "BR备件批次", requestType: "备件", status: "已下单", plannedDeliveryDate: "2026-08-08" },
  ]);

  await insert("requestitems", [
    { id: "RI-001", requestNo: "REQ-2026-001", deviceCode: "06114026", supplierId: "SUP-HT", requestedAt: "2026-06-01", quantity: 7 },
    { id: "RI-002", requestNo: "REQ-2026-001", deviceCode: "06113690", supplierId: "SUP-ODMA", requestedAt: "2026-06-01", quantity: 2 },
    { id: "RI-003", requestNo: "REQ-2026-002", deviceCode: "06113690", supplierId: "SUP-HT", requestedAt: "2026-06-10", quantity: 4 },
    { id: "RI-004", requestNo: "REQ-2026-003", deviceCode: "06114833", supplierId: "SUP-ODMB", requestedAt: "2026-06-15", quantity: 3 },
  ]);

  await insert("purchaseorders", [
    { poNo: "PO-2026-001", requestNo: "REQ-2026-001", status: "已确认", currency: "USD", usdRate: 1, paymentDate: "2026-06-20", releasedAt: "2026-06-18" },
    { poNo: "PO-2026-002", requestNo: "REQ-2026-003", status: "草稿", currency: "BRL", usdRate: 0.18, paymentDate: "2026-06-25", releasedAt: "2026-06-22" },
  ]);

  await insert("purchaseorderitems", [
    { id: "POI-001", poNo: "PO-2026-001", requestItemId: "RI-001", unitPrice: 7486.2, hardwareCoefficient: 1.1, softwareCoefficient: 0.25, totalCoefficient: 1.35 },
    { id: "POI-002", poNo: "PO-2026-001", requestItemId: "RI-002", unitPrice: 12688.29, hardwareCoefficient: 1.05, softwareCoefficient: 0.2, totalCoefficient: 1.25 },
    { id: "POI-003", poNo: "PO-2026-002", requestItemId: "RI-004", unitPrice: 16800, hardwareCoefficient: 1.2, softwareCoefficient: 0.3, totalCoefficient: 1.5 },
  ]);

  await insert("shipments", [
    { shipmentId: "SHP-001", poNo: "PO-2026-001", destinationLocationId: "CL-CDC-AZ1", recipientContactId: "CT-CL-AXEL", snapshotDestinationAddress: "Avenida Presidente Prieto 226, Paine, Region Metropolitana, Chile.", snapshotRecipientName: "axeltamayo", snapshotRecipientPhone: "0056968528930", transportMode: "空运", isReceived: true, crd: "2026-07-01", apdAt: "2026-07-03", pickupAt: "2026-07-04", departedAt: "2026-07-05", arrivedAt: "2026-07-10", customsClearedAt: "2026-07-12", deliveredAt: "2026-07-13" },
    { shipmentId: "SHP-002", poNo: "PO-2026-002", destinationLocationId: "BR-SP-WH1", recipientContactId: "CT-BR-MARIA", snapshotDestinationAddress: "Av. Paulista 1000, Sao Paulo, Brazil.", snapshotRecipientName: "Maria Silva", snapshotRecipientPhone: "00551188889999", transportMode: "海运", isReceived: false, crd: "2026-07-20", apdAt: "2026-07-23", pickupAt: "2026-07-25", departedAt: "2026-07-30", arrivedAt: null, customsClearedAt: null, deliveredAt: null },
  ]);

  await insert("prepaymentcontracts", [
    { contractNo: "PRE-2026-001", effectiveDate: "2026-06-01" },
  ]);

  await insert("prepaymentcontractitems", [
    { id: "PCI-001", contractNo: "PRE-2026-001", prepaymentAmount: 100000, currency: "USD", usdRate: 1, paymentDate: "2026-06-05" },
    { id: "PCI-002", contractNo: "PRE-2026-001", prepaymentAmount: 500000, currency: "BRL", usdRate: 0.18, paymentDate: "2026-06-08" },
  ]);

  await insert("writeoffitems", [
    { id: "WO-001", requestItemId: "RI-001", prepaymentContractItemId: "PCI-001", prepaymentAmountUSD: 30000, writeOffCurrency: "USD", writeOffRate: 1, startMonth: "2026-07-01", totalMonths: 12 },
    { id: "WO-002", requestItemId: "RI-004", prepaymentContractItemId: "PCI-002", prepaymentAmountUSD: 20000, writeOffCurrency: "BRL", writeOffRate: 0.18, startMonth: "2026-08-01", totalMonths: 10 },
  ]);
}

main()
  .then(() => {
    console.log("Seed data inserted.");
    return closeDb();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
