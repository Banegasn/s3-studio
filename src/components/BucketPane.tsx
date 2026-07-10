import { Boxes } from 'lucide-react'
import type { S3Bucket } from '../types'
import { SearchBox, PanelHeading, Badge, EmptyState } from './ui'
import './BucketPane.css'

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
      <PanelHeading
        title="Buckets"
        action={<Badge>{buckets.length}</Badge>}
      />
      <SearchBox value={bucketFilter} onChange={onFilterChange} placeholder="Filter buckets" />
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
        {filteredBuckets.length === 0 ? <EmptyState message="No buckets" /> : null}
      </div>
    </aside>
  )
}
