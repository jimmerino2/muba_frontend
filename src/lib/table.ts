/** Column descriptor for `DataTable`. Lives outside the SFC because `<script setup>` cannot export. */
export interface Column<Row> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'right'
  /** Tailwind width class, e.g. `w-40`. Omit to let the column size itself. */
  width?: string
  /** Hide below the `sm` breakpoint — used for secondary columns. */
  hideOnMobile?: boolean
  /** Comparable value for sorting; defaults to `row[key]`. */
  sortValue?: (row: Row) => string | number
}
