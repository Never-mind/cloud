import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { DEFAULT_IMPORT_UNIT,IMPORT_FIELDS,IMPORT_COLUMNS,IMPORT_LIMIT,normalizeImportRaw,type InvoiceImportRaw,type InvoiceImportBatch } from "./invoice-batch-import";

export function parseInvoiceImportWorkbook(bytes:Buffer):Array<{rowNo:number;raw:InvoiceImportRaw}> {
 const workbook=XLSX.read(bytes,{type:'buffer',cellDates:true,cellNF:true,sheetRows:1002});
 const sheet=workbook.Sheets['开票导入']||workbook.Sheets[workbook.SheetNames[0]];
 if(!sheet?.['!ref'])throw new Error('表格为空，请使用批量开票模板');
 const range=XLSX.utils.decode_range(sheet['!ref']);
 if(range.e.c>80)throw new Error('模板列数过多，请使用批量开票模板');
 const headers=new Map<string,number>();
 for(let c=0;c<=range.e.c;c++){
  const value=String(sheet[XLSX.utils.encode_cell({r:0,c})]?.v??'').trim().replace(/[＊*]$/,'');
  if(!value)continue;
  if(headers.has(value))throw new Error(`表头“${value}”重复`);
  headers.set(value,c);
 }
 for(const key of ['业务模块','关联单据','币种','含税金额','票面描述'])if(!headers.has(key))throw new Error(`缺少表头：${key}`);
 const rows:Array<{rowNo:number;raw:InvoiceImportRaw}>=[];
 for(let r=1;r<=range.e.r;r++){
  const raw=normalizeImportRaw({});
  // Accept the optional identifier in older templates, but never require it in new ones.
  for(const [key,label] of IMPORT_FIELDS){
   const c=headers.get(label);if(c===undefined)continue;
   const cell=sheet[XLSX.utils.encode_cell({r,c})];if(!cell)continue;
   if(cell.f&&cell.v==null)throw new Error(`第${r+1}行“${label}”公式没有计算结果，请在Excel计算并保存后上传`);
   if(cell.t==='e')throw new Error(`第${r+1}行“${label}”包含Excel错误`);
   let value=cell.v;
   if(value instanceof Date)value=`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
   else if(key==='taxRate'&&typeof value==='number'&&cell.z?.includes('%'))value=Number((value*100).toFixed(6));
   raw[key]=String(value??'').trim();
   if(raw[key].length>10000)throw new Error(`第${r+1}行“${label}”过长`);
  }
  if(Object.entries(raw).some(([key,value])=>!['unit','taxRate'].includes(key)&&Boolean(value)))rows.push({rowNo:r+1,raw});
  if(rows.length>IMPORT_LIMIT)throw new Error(`一次最多${IMPORT_LIMIT}张发票，请拆分上传`);
 }
 if(sheet['!fullref']&&XLSX.utils.decode_range(sheet['!fullref']).e.r>1001)throw new Error('表格行数过多，请保留本次开票数据后上传');
 if(!rows.length)throw new Error('请先填写至少一行开票信息');
 return rows;
}
function styleSheet(sheet:ExcelJS.Worksheet,width=20){
 sheet.views=[{state:'frozen',ySplit:1}];
 sheet.getRow(1).height=30;
 sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF244763'}};cell.alignment={vertical:'middle',wrapText:true};});
 sheet.columns.forEach(column=>column.width=width);
 sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:sheet.columnCount}};
}
export async function invoiceImportTemplate(){
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('开票导入');
 sheet.addRow(IMPORT_COLUMNS.map(([,label])=>label));styleSheet(sheet);
 const column=(key:typeof IMPORT_COLUMNS[number][0])=>IMPORT_COLUMNS.findIndex(([field])=>field===key)+1;
 sheet.getColumn(column('references')).width=38;sheet.getColumn(column('description')).width=42;sheet.getColumn(column('remark')).width=36;
 sheet.getColumn(column('unit')).width=32;
 for(let r=2;r<=101;r++){
  for(const field of ['references','invoiceDate','dueDate','invoiceNo'] as const)sheet.getCell(r,column(field)).numFmt='@';
  sheet.getCell(r,column('unit')).value=DEFAULT_IMPORT_UNIT;
  sheet.getCell(r,column('taxRate')).value=0;
  sheet.getCell(r,column('module')).dataValidation={type:'list',allowBlank:true,formulae:['"算力服务费,华为云,预付款合同"']};
  sheet.getCell(r,column('lineMode')).dataValidation={type:'list',allowBlank:true,formulae:['"一行汇总,按账期分行"']};
 }
 const help=workbook.addWorksheet('填写说明');
 help.addRows([
  ['字段／场景','填写方法'],
  ['一行一张本地发票','同一账期拆多张票：复制关联单据到多行，每行填写客户确认金额，系统自动生成导入编号。'],
  ['重复上传','相同开票数据重复上传会恢复原批次，保留已修改内容和首次上传日期；同表两行相同内容仍作为两张发票。'],
  ['业务模块（必填）','算力服务费 / 华为云 / 预付款合同。每行只能属于一个模块。'],
  ['关联单据（必填）','服务费填对账单号；华为云填YYYYMM@账号（同月同账号重名时在页面选择唯一记录）；预付款填合同号。多个账期用英文分号 ; 分隔。'],
  ['一票多个账期','同一业务客户的账期可以合并；不同开票客户可在开票客户列选择。默认按来源含税比例分摊，或填写分摊含税金额。'],
  ['开票客户／开票单位','可填业务伙伴编号、唯一名称或ID。客户留空使用来源客户；开票单位默认香港万众科技有限公司，清空也按此默认。可在页面搜索更换。'],
  ['币种／含税金额（必填）','如USD、CNY。金额以本行填写为准，最多两位小数；0.10等差额会提示，不改动账单应收。'],
  ['税率%／未税金额','税率默认0，留空也按0；6表示6%。未税留空按含税与税率反算，填写时须与含税一致。'],
  ['开票日期','YYYY-MM-DD。留空默认首次上传当天（北京时间），跨天处理保留首次上传日期，可在预览修改。'],
  ['发票号','留空自动生成WZ-YYYYMM-流水；账单票号使用最早关联账期，预付款使用开票月份。'],
  ['应收日期／账期天数','均留空按开票单位档案默认天数（缺失为30天）；只填日期会反算天数；两者都填须一致。'],
  ['票面描述（必填）／票面展示','例如202512-202605服务费。留空票面展示或填写“一行汇总”表示确认服务内容可合并一行；按账期分行会按每个账期展示明细。'],
  ['业务汇率','方向统一为1开票币 = N来源币（合同币）。同币种可留空；异币须填写。多账期可用分号填写对应各单据的汇率。'],
  ['美元汇率','1 USD = N开票币，供美元报表折算，USD固定为1。'],
  ['分摊含税金额','选填。按关联单据顺序用分号分隔，合计必须等于整票含税金额。例如100;200。预付款不填。'],
  ['导入前核对','使用页面“选择单据”可搜索业务来源。预览中可修改行、双方单位、金额及分摊；确认后才生成正式票面。'],
  ['执行与重试','每批最多100行；每行独立保存，成功行不重复生成；失败行可编辑校验后重试。可从最近批次恢复。'],
  ['预付款约束','每票对应一份已确认合同，须先设置财务口径；累计票款及审批占用校验沿用合同规则。'],
 ]);styleSheet(help);help.getColumn(1).width=30;help.getColumn(2).width=105;
 help.eachRow((row,index)=>{if(index>1){row.height=48;row.alignment={wrapText:true,vertical:'middle'};}});
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
export async function invoiceImportReport(batch:InvoiceImportBatch){
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('开票结果');
 sheet.addRow([...IMPORT_COLUMNS.map(([,label])=>label),'执行结果','生成发票号','错误／提示']);
 for(const row of batch.rows)sheet.addRow([...IMPORT_COLUMNS.map(([key])=>row.raw[key]),({issued:'成功',skipped:'已存在，跳过',ready:'待开票',error:'失败／待修正'} as Record<string,string>)[row.status]||row.status,row.invoiceNo||row.preview.existingInvoiceNo||'',row.message||[...row.preview.errors,...row.preview.warnings].join('；')]);
 styleSheet(sheet);sheet.getColumn(2).width=38;sheet.getColumn(sheet.columnCount).width=70;
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
