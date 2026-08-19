"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Edit3,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { PaginationBar } from "./pagination-bar";

type DocumentFolder = {
  folderId: string;
  parentId: string | null;
  name: string;
};

type DocumentFile = {
  fileId: string;
  folderId: string;
  originalName: string;
  category: string;
  fileSize: number;
  createdAt: string;
};

type Breadcrumb = Pick<DocumentFolder, "folderId" | "name">;
type ContextTarget = { type: "folder"; item: DocumentFolder } | { type: "file"; item: DocumentFile };

const ROOT_ID = "ROOT";

export function DocumentManagerPage() {
  const [folderId, setFolderId] = useState(ROOT_ID);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [tree, setTree] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [history, setHistory] = useState([ROOT_ID]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [renaming, setRenaming] = useState<ContextTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextTarget } | null>(null);
  const [filePage, setFilePage] = useState(1);
  const [filePageSize, setFilePageSize] = useState(20);
  const [fileTotal, setFileTotal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentParentId = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].folderId : null;

  const filteredFolders = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    return word ? folders.filter((folder) => folder.name.toLowerCase().includes(word)) : folders;
  }, [folders, keyword]);

  useEffect(() => {
    setFilePage(1);
    void loadItems(folderId, 1, filePageSize);
  }, [folderId, keyword]);

  useEffect(() => {
    void loadTree();
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const goToFolder = (nextFolderId: string, pushHistory = true) => {
    setFolderId(nextFolderId);
    setRenaming(null);
    setContextMenu(null);
    if (pushHistory) {
      const nextHistory = history.slice(0, historyIndex + 1).concat(nextFolderId);
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    }
  };

  async function loadItems(targetFolderId = folderId, nextPage = filePage, nextPageSize = filePageSize) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        folderId: targetFolderId,
        page: String(nextPage),
        pageSize: String(nextPageSize),
      });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const response = await fetch(`/api/documents/items?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取文档失败");
      setFolders(data.folders || []);
      setFiles(data.files || []);
      setBreadcrumbs(data.breadcrumbs || []);
      setFileTotal(Number(data.total ?? 0));
      setFilePage(Number(data.page ?? nextPage));
      setFilePageSize(Number(data.pageSize ?? nextPageSize));
    } catch (error) {
      alert(error instanceof Error ? error.message : "读取文档失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadTree() {
    const response = await fetch("/api/documents/tree");
    const data = await response.json();
    setTree(data.folders || []);
  }

  async function createFolder(parentId = folderId) {
    const name = window.prompt("请输入文件夹名称");
    if (!name) return;
    const response = await fetch("/api/documents/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, name }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "新建文件夹失败");
      return;
    }
    await Promise.all([loadItems(folderId), loadTree()]);
  }

  async function uploadFiles(filesToUpload: FileList | null) {
    if (!filesToUpload?.length) return;
    const formData = new FormData();
    formData.append("folderId", folderId);
    Array.from(filesToUpload).forEach((file) => formData.append("files", file));
    const response = await fetch("/api/documents/files/upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "上传失败");
      return;
    }
    const failedText = data.failed?.length
      ? `\n失败：${data.failed.map((item: { name: string; reason: string }) => `${item.name}（${item.reason}）`).join("；")}`
      : "";
    alert(`本次导入 ${data.total} 个文件，成功 ${data.success} 个。${failedText}`);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadItems(folderId);
  }

  function startRename(target: ContextTarget) {
    setRenaming(target);
    setRenameValue(target.type === "folder" ? target.item.name : target.item.originalName);
    setContextMenu(null);
  }

  async function submitRename() {
    if (!renaming) return;
    const endpoint =
      renaming.type === "folder"
        ? `/api/documents/folders/${encodeURIComponent(renaming.item.folderId)}`
        : `/api/documents/files/${encodeURIComponent(renaming.item.fileId)}`;
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "重命名失败");
      return;
    }
    setRenaming(null);
    await Promise.all([loadItems(folderId), loadTree()]);
  }

  async function removeTarget(target: ContextTarget) {
    const name = target.type === "folder" ? target.item.name : target.item.originalName;
    if (!window.confirm(`确认删除“${name}”？`)) return;
    const endpoint =
      target.type === "folder"
        ? `/api/documents/folders/${encodeURIComponent(target.item.folderId)}`
        : `/api/documents/files/${encodeURIComponent(target.item.fileId)}`;
    const response = await fetch(endpoint, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "删除失败");
      return;
    }
    await Promise.all([loadItems(folderId), loadTree()]);
  }

  const goBack = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    goToFolder(history[nextIndex], false);
  };

  const goForward = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    goToFolder(history[nextIndex], false);
  };

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] px-4 py-3">
          <Button disabled={historyIndex <= 0} onClick={goBack} title="后退" type="button">
            <ArrowLeft size={16} />
          </Button>
          <Button disabled={historyIndex >= history.length - 1} onClick={goForward} title="前进" type="button">
            <ArrowRight size={16} />
          </Button>
          <Button disabled={!currentParentId} onClick={() => currentParentId && goToFolder(currentParentId)} title="上一级" type="button">
            <ArrowUp size={16} />
          </Button>
          <Button onClick={() => createFolder()} type="button">
            <FolderPlus size={16} />
            新建文件夹
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} tone="primary" type="button">
            <Upload size={16} />
            批量上传
          </Button>
          <Button onClick={() => loadItems(folderId)} type="button">
            <RefreshCw size={16} />
            刷新
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Search className="text-[#909399]" size={16} />
            <Input
              className="min-w-[220px]"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索当前文件夹"
              value={keyword}
            />
          </div>
          <input
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp,.zip,.rar,.7z"
            className="hidden"
            multiple
            onChange={(event) => uploadFiles(event.target.files)}
            ref={fileInputRef}
            type="file"
          />
        </div>
        <div className="flex min-h-[620px]">
          <aside className="w-[240px] shrink-0 border-r border-[#ebeef5] bg-[#fafafa] p-3">
            <FolderTree folders={tree} parentId={null} activeFolderId={folderId} onCreateFolder={createFolder} onOpen={goToFolder} />
          </aside>
          <section className="min-w-0 flex-1">
            <div className="flex min-h-[44px] items-center gap-1 border-b border-[#ebeef5] px-4 text-sm text-[#606266]">
              {breadcrumbs.map((item, index) => (
                <span className="flex items-center gap-1" key={item.folderId}>
                  {index > 0 ? <span className="text-[#c0c4cc]">/</span> : null}
                  <button className="hover:text-[#1890ff]" onClick={() => goToFolder(item.folderId)} type="button">
                    {item.name}
                  </button>
                </span>
              ))}
            </div>
            <div className="overflow-auto p-4">
              {loading ? <div className="py-10 text-center text-[#909399]">加载中...</div> : null}
              {!loading && filteredFolders.length === 0 && files.length === 0 ? (
                <div className="py-20 text-center text-[#909399]">当前文件夹暂无内容</div>
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                {filteredFolders.map((folder) => (
                  <DocumentTile
                    icon={<Folder className="text-[#f5a623]" size={30} />}
                    isRenaming={renaming?.type === "folder" && renaming.item.folderId === folder.folderId}
                    key={folder.folderId}
                    name={folder.name}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, target: { type: "folder", item: folder } });
                    }}
                    onDoubleClick={() => goToFolder(folder.folderId)}
                    onRenameCancel={() => setRenaming(null)}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={submitRename}
                    renameValue={renameValue}
                    subText="文件夹"
                  />
                ))}
                {files.map((file) => (
                  <DocumentTile
                    icon={<FileIcon category={file.category} />}
                    isRenaming={renaming?.type === "file" && renaming.item.fileId === file.fileId}
                    key={file.fileId}
                    name={file.originalName}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, target: { type: "file", item: file } });
                    }}
                    onDoubleClick={() => window.open(`/api/documents/files/${encodeURIComponent(file.fileId)}/download`, "_blank")}
                    onRenameCancel={() => setRenaming(null)}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={submitRename}
                    renameValue={renameValue}
                    subText={`${formatFileSize(file.fileSize)} · ${formatDate(file.createdAt)}`}
                  />
                ))}
              </div>
              <PaginationBar
                page={filePage}
                pageSize={filePageSize}
                total={fileTotal}
                onPageChange={(next) => { setFilePage(next); void loadItems(folderId, next, filePageSize); }}
                onPageSizeChange={(next) => { setFilePageSize(next); setFilePage(1); void loadItems(folderId, 1, next); }}
              />
            </div>
          </section>
        </div>
      </Panel>
      {contextMenu ? (
        <ContextMenu
          onCreateFolder={() => contextMenu.target.type === "folder" && createFolder(contextMenu.target.item.folderId)}
          onDelete={() => removeTarget(contextMenu.target)}
          onDownload={() =>
            contextMenu.target.type === "file" &&
            window.open(`/api/documents/files/${encodeURIComponent(contextMenu.target.item.fileId)}/download`, "_blank")
          }
          onOpen={() => contextMenu.target.type === "folder" && goToFolder(contextMenu.target.item.folderId)}
          onRename={() => startRename(contextMenu.target)}
          target={contextMenu.target}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}
    </div>
  );
}

function FolderTree({
  activeFolderId,
  folders,
  onCreateFolder,
  onOpen,
  parentId,
}: {
  activeFolderId: string;
  folders: DocumentFolder[];
  onCreateFolder: (parentId: string) => void;
  onOpen: (folderId: string) => void;
  parentId: string | null;
}) {
  const children = folders.filter((folder) => folder.parentId === parentId);
  return (
    <div className={parentId ? "ml-4" : ""}>
      {children.map((folder) => (
        <div key={folder.folderId}>
          <button
            className={`flex h-8 w-full min-w-0 items-center gap-2 rounded px-2 text-left text-sm ${
              activeFolderId === folder.folderId ? "bg-[#e6f4ff] text-[#1890ff]" : "text-[#606266] hover:bg-white"
            }`}
            onContextMenu={(event) => {
              event.preventDefault();
              onCreateFolder(folder.folderId);
            }}
            onDoubleClick={() => onOpen(folder.folderId)}
            onClick={() => onOpen(folder.folderId)}
            title={folder.name}
            type="button"
          >
            <Folder size={15} className="shrink-0 text-[#f5a623]" />
            <span className="min-w-0 truncate">{folder.name}</span>
          </button>
          <FolderTree activeFolderId={activeFolderId} folders={folders} onCreateFolder={onCreateFolder} onOpen={onOpen} parentId={folder.folderId} />
        </div>
      ))}
    </div>
  );
}

function DocumentTile({
  icon,
  isRenaming,
  name,
  onContextMenu,
  onDoubleClick,
  onRenameCancel,
  onRenameChange,
  onRenameSubmit,
  renameValue,
  subText,
}: {
  icon: React.ReactNode;
  isRenaming: boolean;
  name: string;
  onContextMenu: React.MouseEventHandler;
  onDoubleClick: () => void;
  onRenameCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  renameValue: string;
  subText: string;
}) {
  return (
    <div
      className="flex h-[84px] min-w-0 cursor-default items-center gap-3 rounded border border-[#ebeef5] bg-white px-3 hover:border-[#b3d8ff] hover:bg-[#f5fbff]"
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      title={name}
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <Input
            autoFocus
            className="h-8 min-w-0 w-full"
            onChange={(event) => onRenameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void onRenameSubmit();
              if (event.key === "Escape") onRenameCancel();
            }}
            onClick={(event) => event.stopPropagation()}
            value={renameValue}
          />
        ) : (
          <div className="truncate text-sm font-medium text-[#303133]">{name}</div>
        )}
        <div className="mt-1 truncate text-xs text-[#909399]">{subText}</div>
      </div>
    </div>
  );
}

function ContextMenu({
  onCreateFolder,
  onDelete,
  onDownload,
  onOpen,
  onRename,
  target,
  x,
  y,
}: {
  onCreateFolder: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onRename: () => void;
  target: ContextTarget;
  x: number;
  y: number;
}) {
  return (
    <div
      className="fixed z-50 w-44 rounded border border-[#dcdfe6] bg-white py-1 text-sm shadow-lg"
      onClick={(event) => event.stopPropagation()}
      style={{ left: x, top: y }}
    >
      {target.type === "folder" ? <MenuButton icon={<Folder size={14} />} label="打开" onClick={onOpen} /> : null}
      {target.type === "folder" ? <MenuButton icon={<FolderPlus size={14} />} label="新建子文件夹" onClick={onCreateFolder} /> : null}
      {target.type === "file" ? <MenuButton icon={<Download size={14} />} label="下载" onClick={onDownload} /> : null}
      <MenuButton icon={<Edit3 size={14} />} label="重命名" onClick={onRename} />
      <MenuButton danger icon={<Trash2 size={14} />} label="删除" onClick={onDelete} />
    </div>
  );
}

function MenuButton({ danger, icon, label, onClick }: { danger?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex h-9 w-full items-center gap-2 px-3 text-left hover:bg-[#f5f7fa] ${danger ? "text-[#f56c6c]" : "text-[#606266]"}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function FileIcon({ category }: { category: string }) {
  if (category === "image") return <FileImage className="text-[#67c23a]" size={30} />;
  if (category === "spreadsheet") return <FileSpreadsheet className="text-[#13ce66]" size={30} />;
  if (category === "archive") return <FileArchive className="text-[#909399]" size={30} />;
  return <FileText className="text-[#409eff]" size={30} />;
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function formatDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}
