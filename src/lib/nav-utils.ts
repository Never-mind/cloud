export type SidebarGroupState = Record<string, boolean>;

export function isGroupOpen(state: SidebarGroupState, groupTitle: string): boolean {
  return state[groupTitle] ?? false;
}

export function toggleGroup(
  state: SidebarGroupState,
  groupTitle: string,
): SidebarGroupState {
  return {
    ...state,
    [groupTitle]: !isGroupOpen(state, groupTitle),
  };
}

export function getChildGroupKey(parentTitle: string, childTitle: string): string {
  return `${parentTitle}::${childTitle}`;
}
