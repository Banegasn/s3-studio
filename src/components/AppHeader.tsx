import { RefreshCw } from 'lucide-react'
import appIcon from '../assets/app-icon.png'
import type { AwsProfile } from '../types'
import { DEFAULT_REGION } from '../utils/format'

type Props = {
  profiles: AwsProfile[]
  selectedProfile: string
  region: string
  onProfileChange: (profile: string) => void
  onRegionChange: (region: string) => void
  onRefreshBuckets: () => void
}

export function AppHeader({
  profiles,
  selectedProfile,
  region,
  onProfileChange,
  onRegionChange,
  onRefreshBuckets,
}: Props) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="brand-mark">
          <img src={appIcon} alt="" />
        </div>
        <div>
          <h1>S3 CloudFront Studio</h1>
        </div>
      </div>

      <div className="context-bar">
        <label>
          <span>Profile</span>
          <select value={selectedProfile} onChange={(event) => onProfileChange(event.target.value)}>
            {profiles.map((profile) => (
              <option key={profile.name} value={profile.name}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Region</span>
          <input value={region} onChange={(event) => onRegionChange(event.target.value)} placeholder={DEFAULT_REGION} />
        </label>
        <button type="button" className="icon-button" onClick={onRefreshBuckets} title="Refresh buckets">
          <RefreshCw size={18} />
        </button>
      </div>
    </header>
  )
}
