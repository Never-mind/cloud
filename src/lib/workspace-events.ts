"use client";

import { useEffect, useRef } from "react";

/**
 * 标签页之间共享"档案数据变了"的广播。
 *
 * 每个标签页都是常驻 iframe，页面里的供应商 / 承接单位 / 客户等基础资料只在首次加载时拉一次。
 * 档案改名后，服务端列表因为按 ID 回查档案会显示新名称，但弹层下拉仍用内存里的旧列表，
 * 于是出现"列表是新的、点开修改还是旧名字"的问题。
 *
 * 约定：
 * - 标签页（iframe）保存档案成功后向父窗口发 `cloud-power:master-data-changed`；
 * - 父窗口收到后转发给所有标签页，并给正在显示的标签页发 `cloud-power:tab-activated`；
 * - 各页面用 `useWorkspaceDataRefresh` 订阅，重新拉取自己缓存的基础资料。
 */
export const WORKSPACE_MASTER_DATA_CHANGED = "cloud-power:master-data-changed";
export const WORKSPACE_TAB_ACTIVATED = "cloud-power:tab-activated";

export type WorkspaceRefreshMessage = {
  type: typeof WORKSPACE_MASTER_DATA_CHANGED | typeof WORKSPACE_TAB_ACTIVATED;
  /** 变动的档案模块（suppliers / customers / undertaking-units），仅用于调试与按需刷新。 */
  entity?: string;
};

function isWorkspaceRefreshMessage(value: unknown): value is WorkspaceRefreshMessage {
  const type = (value as { type?: unknown } | null)?.type;
  return type === WORKSPACE_MASTER_DATA_CHANGED || type === WORKSPACE_TAB_ACTIVATED;
}

/** 通知父窗口：某个档案模块被修改了，其他标签页需要重新拉取基础资料。 */
export function broadcastMasterDataChanged(entity: string) {
  if (typeof window === "undefined") return;
  if (!window.parent || window.parent === window) return;
  window.parent.postMessage({ type: WORKSPACE_MASTER_DATA_CHANGED, entity }, window.location.origin);
}

/** 订阅父窗口广播的"档案变更 / 标签页被激活"事件。 */
export function useWorkspaceDataRefresh(onRefresh: (message: WorkspaceRefreshMessage) => void) {
  const handler = useRef(onRefresh);
  handler.current = onRefresh;
  useEffect(() => {
    function handle(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isWorkspaceRefreshMessage(event.data)) return;
      handler.current(event.data);
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);
}
