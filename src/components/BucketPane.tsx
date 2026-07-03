import { Boxes, Search } from 'lucide-react'
import type { S3Bucket } from '../types'

type Props = {
  buckets: S3Bucket[]
  filteredBuckets: S3Bucket[]
  bucketFilter: string
  selectedBucket: string
  onFilterChange: (value: string) => void
  onChooseBucket: (bucket: string) => void
}

export function BucketPane({
  buckets,
  filteredBuckets,
  bucketFilter,
  selectedBucket,
  onFilterChange,
  onChooseBucket,
}: Props) {
  return (
    <aside className="bucket-pane">
      <div className="pane-heading">
        <div>
          <p className="eyebrow">S3</p>
          <h2>Buckets</h2>
        </div>
        <span className="count-pill">{buckets.length}</span>
      </div>
      <label className="search-box">
        <Search size={16} />
        <input value={bucketFilter} onChange={(event) => onFilterChange(event.target.value)} placeholder="Filter buckets" />
      </label>
      <div className="bucket-list">
        {filteredBuckets.map((bucket) => (
          <button
            type="button"
            key={bucket.name}
            className={bucket.name === selectedBucket ? 'bucket-item active' : 'bucket-item'}
            onClick={() => onChooseBucket(bucket.name)}
          >
            <Boxes size={16} />
            <span>{bucket.name}</span>
          </button>
        ))}
        {filteredBuckets.length === 0 ? <div className="empty-state">No buckets</div> : null}
      </div>
    </aside>
  )
}
