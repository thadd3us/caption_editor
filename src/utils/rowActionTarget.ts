import type { GridApi, IRowNode } from 'ag-grid-community'

/**
 * Rows an in-grid action should apply to (Lightroom-style):
 * - If several rows are selected and the anchor row is part of that selection → all selected rows.
 * - Otherwise → only the anchor row (e.g. right-click or click on a row outside the selection).
 */
export function resolveRowActionTargetRows<TData extends { id?: string }>(
  gridApi: GridApi,
  anchorNode: IRowNode<TData> | null | undefined
): TData[] {
  if (!anchorNode?.data?.id) return []

  const selectedNodes = gridApi.getSelectedNodes() as IRowNode<TData>[]
  const multi = selectedNodes.length > 1
  if (multi && anchorNode.isSelected()) {
    const rows = selectedNodes.map((n) => n.data).filter((d): d is TData => d != null && !!d.id)
    return rows
  }

  return [anchorNode.data]
}
