import Link from "next/link";

export default function ModuleDisabledPage() {
  return <main className="min-h-screen bg-[#f5f7fa] p-8">
    <div className="mx-auto max-w-xl border border-[#ebeef5] bg-white p-8 shadow-sm">
      <h1 className="text-xl font-medium text-[#303133]">功能模块暂未启用</h1>
      <p className="mt-3 text-sm leading-6 text-[#606266]">该模块目前由系统管理员停用，相关代码和历史数据仍然保留。需要使用时，请在“功能模块管理”中重新启用。</p>
      <Link className="mt-6 inline-flex h-9 items-center border border-[#dcdfe6] px-4 text-sm text-[#606266] hover:border-[#409eff] hover:text-[#409eff]" href="/">返回首页</Link>
    </div>
  </main>;
}
