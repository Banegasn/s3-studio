import { AlertCircle, CloudLightning } from 'lucide-react'
import type { LinkedDistribution, S3Entry } from '../../types'
import { SectionHeading, EmptyState, Button } from '../ui'
import { CopyUrlRow } from './CopyUrlRow'
import './CloudFrontPanel.css'

type Props = {
  selectedBucket: string
  selectedRegion: string
  selectedObject: S3Entry
  linkedDistributions: LinkedDistribution[]
  pathOverrides: Record<string, string>
  loadingDetails: boolean
  busy?: string
  onInvalidate: (distribution: LinkedDistribution) => void
}

export function CloudFrontPanel({
  selectedBucket,
  selectedRegion,
  selectedObject,
  linkedDistributions,
  pathOverrides,
  loadingDetails,
  busy,
  onInvalidate,
}: Props) {
  const awsUrl = buildS3ObjectUrl(selectedBucket, selectedRegion, selectedObject.key)

  return (
    <section className="cloudfront-panel">
      <SectionHeading icon={<CloudLightning size={18} />} title="CloudFront" count={linkedDistributions.length} />
      <CopyUrlRow label="S3 raw" value={awsUrl} />
      <div className="distribution-list">
        {linkedDistributions.map((link) => (
          <DistributionItem key={link.id} link={link} pathOverride={pathOverrides[link.id]} onInvalidate={() => onInvalidate(link)} busy={Boolean(busy)} />
        ))}
        {!loadingDetails && linkedDistributions.length === 0 ? (
          <EmptyState icon={<AlertCircle size={20} />} message="No linked distributions found" compact />
        ) : null}
      </div>
    </section>
  )
}

function DistributionItem({ link, pathOverride, onInvalidate, busy }: { link: LinkedDistribution; pathOverride?: string; onInvalidate: () => void; busy: boolean }) {
  return (
    <div className="distribution-item">
      <div className="distribution-title">
        <div>
          <strong>{link.id}</strong>
          <span>{link.aliases[0] || link.domain_name}</span>
        </div>
        <span className={link.enabled ? 'status deployed' : 'status disabled'}>
          {link.status || (link.enabled ? 'Enabled' : 'Disabled')}
        </span>
      </div>

      <div className="distribution-body">
        <CopyUrlRow value={buildCloudFrontUrl(link, pathOverride)} />
        <div className="distribution-actions">
          <Button variant="primary" onClick={onInvalidate} disabled={busy}>
            <CloudLightning size={15} />
            Invalidate
          </Button>
        </div>
      </div>
    </div>
  )
}

function buildCloudFrontUrl(link: LinkedDistribution, pathOverride?: string) {
  const host = link.aliases[0] || link.domain_name
  return `https://${host}${encodeUrlPath(pathOverride || link.invalidation_path)}`
}

function buildS3ObjectUrl(bucket: string, region: string, key: string) {
  const regionalHost = region === 'us-east-1' ? `${bucket}.s3.amazonaws.com` : `${bucket}.s3.${region}.amazonaws.com`
  return `https://${regionalHost}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function encodeUrlPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized.split('/').map((part, index) => (index === 0 ? '' : encodeURIComponent(part))).join('/')
}
