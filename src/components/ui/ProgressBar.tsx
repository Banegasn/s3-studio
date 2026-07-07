type Props = {
  percent?: number
  indeterminate?: boolean
  'aria-valuemin'?: number
  'aria-valuemax'?: number
  'aria-valuenow'?: number
}

export function ProgressBar({ percent, indeterminate, ...aria }: Props) {
  return (
    <div
      className={indeterminate ? 'progress-track indeterminate' : 'progress-track'}
      role="progressbar"
      {...aria}
    >
      <span style={{ width: percent !== undefined ? `${percent}%` : undefined }} />
    </div>
  )
}
