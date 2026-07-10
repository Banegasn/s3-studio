import type { ChangeEvent, MouseEvent } from 'react'
import { Moon, PanelLeft, PanelRight, RefreshCw, Sun } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import appIcon from '../assets/app-icon.png'
import type { AwsProfile } from '../types'
import { DEFAULT_REGION } from '../utils/format'
import { Input, Select, IconButton } from './ui'
import './AppHeader.css'

type Props = {
  profiles: AwsProfile[]
  selectedProfile: string
  region: string
  isBucketPaneCollapsed: boolean
  isDetailsPaneCollapsed: boolean
  theme: 'light' | 'dark'
  onProfileChange: (profile: string) => void
  onRegionChange: (region: string) => void
  onRefreshBuckets: () => void
  onToggleBucketPane: () => void
  onToggleDetailsPane: () => void
  onToggleTheme: () => void
}

export function AppHeader({
  profiles,
  selectedProfile,
  region,
  isBucketPaneCollapsed,
  isDetailsPaneCollapsed,
  theme,
  onProfileChange,
  onRegionChange,
  onRefreshBuckets,
  onToggleBucketPane,
  onToggleDetailsPane,
  onToggleTheme,
}: Props) {
  function startWindowDrag(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0 || !('__TAURI_INTERNALS__' in window)) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, select, textarea, option')) return
    void getCurrentWindow().startDragging()
  }

  return (
    <header className="app-header" data-tauri-drag-region onMouseDown={startWindowDrag}>
      <div className="brand-block">
        <div className="brand-mark">
          <img src={appIcon} alt="" />
        </div>
        <h1>S3 Studio</h1>
      </div>

      <div className="context-bar">
        <label className="context-field profile-field">
          <span>Profile</span>
          <Select value={selectedProfile} onChange={(event: ChangeEvent<HTMLSelectElement>) => onProfileChange(event.target.value)}>
            {profiles.map((profile) => (
              <option key={profile.name} value={profile.name}>
                {profile.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="context-field region-field">
          <span>Region</span>
          <Input value={region} onChange={(event: ChangeEvent<HTMLInputElement>) => onRegionChange(event.target.value)} placeholder={DEFAULT_REGION} />
        </label>
        <div className="context-actions">
          <IconButton compact onClick={onRefreshBuckets} title="Refresh buckets">
            <RefreshCw size={17} />
          </IconButton>
          <IconButton compact onClick={onToggleTheme} title={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <span className="header-divider" aria-hidden="true" />
          <IconButton compact active={isBucketPaneCollapsed} onClick={onToggleBucketPane} title={isBucketPaneCollapsed ? 'Show buckets' : 'Hide buckets'}>
            <PanelLeft size={17} />
          </IconButton>
          <IconButton compact active={isDetailsPaneCollapsed} onClick={onToggleDetailsPane} title={isDetailsPaneCollapsed ? 'Show details' : 'Hide details'}>
            <PanelRight size={17} />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
