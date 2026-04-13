import { describe, it, expect } from 'vitest'
import { resolveRowActionTargetRows } from './rowActionTarget'
import type { GridApi, IRowNode } from 'ag-grid-community'

function node<T extends { id: string }>(
  data: T,
  selected: boolean
): IRowNode<T> {
  return {
    data,
    isSelected: () => selected
  } as IRowNode<T>
}

describe('resolveRowActionTargetRows', () => {
  it('returns only the anchor when it is not selected and multiple others are', () => {
    const gridApi = {
      getSelectedNodes: () => [
        node({ id: 'a', x: 1 }, true),
        node({ id: 'b', x: 2 }, true)
      ]
    } as unknown as GridApi

    const anchor = node({ id: 'c', x: 3 }, false)
    expect(resolveRowActionTargetRows(gridApi, anchor)).toEqual([{ id: 'c', x: 3 }])
  })

  it('returns all selected rows when anchor is selected and selection is multi', () => {
    const a = node({ id: 'a', x: 1 }, true)
    const b = node({ id: 'b', x: 2 }, true)
    const gridApi = {
      getSelectedNodes: () => [a, b]
    } as unknown as GridApi

    expect(resolveRowActionTargetRows(gridApi, a)).toEqual([
      { id: 'a', x: 1 },
      { id: 'b', x: 2 }
    ])
    expect(resolveRowActionTargetRows(gridApi, b)).toEqual([
      { id: 'a', x: 1 },
      { id: 'b', x: 2 }
    ])
  })

  it('returns only the anchor when a single row is selected', () => {
    const only = node({ id: 'a', x: 1 }, true)
    const gridApi = {
      getSelectedNodes: () => [only]
    } as unknown as GridApi

    expect(resolveRowActionTargetRows(gridApi, only)).toEqual([{ id: 'a', x: 1 }])
  })

  it('returns empty array when anchor is missing or has no id', () => {
    const gridApi = { getSelectedNodes: () => [] } as unknown as GridApi
    expect(resolveRowActionTargetRows(gridApi, null)).toEqual([])
    expect(
      resolveRowActionTargetRows(gridApi, { data: {}, isSelected: () => false } as IRowNode)
    ).toEqual([])
  })
})
