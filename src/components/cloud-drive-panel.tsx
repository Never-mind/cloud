"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, HardDrive, RefreshCw, Search } from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { formatDisplayValue } from "@/lib/display-format";
import { LoadingBlock } from "./table-state";

type DriveFile = {
  key: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
  prefix: string;
  provider: "obs" | "db";
  storageKey: string | null;
  sourceLabel: string;
  ownerLabel: string;
  jumpHref: string;
  downloadHref: string;
};

type DriveFolder = { prefix: string; name: string; depth: number; fileCount: number; totalSize: number; obsCount: number };

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * 文档库 → 云盘目录：按「算力/集采/华为云/公共/文档库」的目录规则汇总各模块附件。
 * 每个文件标注当前存放位置（云盘 obs / 数据库 db），OBS 迁移进度一眼可见。
 */
export function CloudDrivePanel() {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [summary, setSummary] = useState({ fileCount: 0, totalSize: 0, obsCount: 0, dbCount: 0 });
  const [prefix, setPrefix] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextPrefix = prefix, nextKeyword = keyword) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextPrefix) params.set("prefix", nextPrefix);
      if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
      const response = await fetch(`/api/documents/cloud-drive?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "云盘目录加载失败");
      setFolders(data.folders ?? []);
      setFiles(data.files ?? []);
      setSummary(data.summary ?? { fileCount: 0, totalSize: 0, obsCount: 0, dbCount: 0 });
    } catch {
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, prefix]);

  useEffect(() => { void load(); }, [load]);

  const visibleFolders = useMemo(
    () => folders.filter((folder) => !prefix || folder.prefix === prefix || folder.prefix.startsWith(prefix)),
    [folders, prefix],
  );

  return (
    <Panel className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
        <Input
          className="w-[240px]"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void load(prefix, keyword); }}
          placeholder="搜索文件名 / 目录 / 单据"
          value={keyword}
        />
        <Button onClick={() => void load(prefix, keyword)}><Search size={15} />查询</Button>
        <Button onClick={() => { setPrefix(""); setKeyword(""); void load("", ""); }}><RefreshCw size={15} />全部目录</Button>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-ink-3">
          <span>共 {summary.fileCount} 个文件 · {formatSize(summary.totalSize)}</span>
          <span className="rounded bg-success-soft px-2 py-0.5 text-success">已在云盘 {summary.obsCount}</span>
          <span className="rounded bg-warning-soft px-2 py-0.5 text-warning">仍在数据库 {summary.dbCount}</span>
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="max-h-[60vh] overflow-auto border-b border-line-soft p-2 lg:border-b-0 lg:border-r">
          {loading && !folders.length ? <div className="p-4 text-xs text-ink-3">加载中…</div> : null}
          <button
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${prefix ? "text-ink-2 hover:bg-canvas" : "bg-info-soft text-primary"}`}
            onClick={() => { setPrefix(""); void load("", keyword); }}
            type="button"
          >
            <HardDrive size={14} />全部（{summary.fileCount}）
          </button>
          {visibleFolders.map((folder) => (
            <button
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${prefix === folder.prefix ? "bg-info-soft text-primary" : "text-ink-2 hover:bg-canvas"}`}
              key={folder.prefix}
              onClick={() => { setPrefix(folder.prefix); void load(folder.prefix, keyword); }}
              style={{ paddingLeft: `${8 + folder.depth * 14}px` }}
              title={folder.prefix}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">{folder.name}/</span>
              <span className="shrink-0 text-xs text-ink-3">{folder.fileCount}</span>
            </button>
          ))}
          {!loading && !visibleFolders.length ? <div className="p-4 text-xs text-ink-3">暂无目录（还没有附件）</div> : null}
        </div>
        <div className="min-h-0 overflow-auto">
          {loading ? <LoadingBlock /> : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["文件", "目录", "来源", "关联单据", "存放", "大小", "上传人", "上传时间", "操作"].map((label) => (
                    <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr className="hover:bg-surface-2" key={file.key}>
                    <td className="max-w-[320px] truncate border-b border-r border-line-soft px-3 py-2" title={file.fileName}>{file.fileName}</td>
                    <td className="max-w-[260px] truncate border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3" title={file.prefix}>{file.prefix}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-xs">{file.sourceLabel}</td>
                    <td className="max-w-[220px] truncate border-b border-r border-line-soft px-3 py-2 text-xs">
                      <a className="text-primary hover:underline" href={file.jumpHref}>{file.ownerLabel || "查看"}</a>
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      {file.provider === "obs"
                        ? <span className="rounded bg-success-soft px-1.5 py-0.5 text-xs text-success">云盘</span>
                        : <span className="rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning">数据库</span>}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatSize(file.fileSize)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-xs">{file.uploadedByName}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3">{file.uploadedAt ? formatDisplayValue(file.uploadedAt, "datetime") : "-"}</td>
                    <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                      <a className="inline-flex items-center gap-1 text-primary hover:underline" href={file.downloadHref}><Download size={13} />下载</a>
                    </td>
                  </tr>
                ))}
                {!files.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={9}>该目录下暂无文件</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="border-t border-line-soft px-3 py-2 text-xs text-ink-3">
        目录规则：算力 <span className="font-mono">Cloud/算力/&lt;国家码&gt;/&lt;需求单号&gt;</span>、集采 <span className="font-mono">Cloud/集采/&lt;项目&gt;</span>、
        华为云 <span className="font-mono">Cloud/华为云/&lt;客户&gt;/&lt;年月&gt;</span>、公共 <span className="font-mono">Cloud/公共/&lt;档案&gt;</span>、
        文档库 <span className="font-mono">Cloud/文档库/&lt;文件夹&gt;</span>。标「数据库」的文件等 OBS 写权限开通后跑一次迁移脚本即可搬上云盘。
      </p>
    </Panel>
  );
}
