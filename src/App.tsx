import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm, open, save } from '@tauri-apps/plugin-dialog'
import './App.css'
import { AppHeader } from './components/AppHeader'
import { BrowserPane, type SelectionMode } from './components/BrowserPane'
import { BucketPane } from './components/BucketPane'
import { ContextMenu, type ContextMenuState } from './components/ContextMenu'
import { DetailsPane } from './components/DetailsPane'
import { InvalidationDialog, type InvalidationDialogState } from './components/InvalidationDialog'
import { ToastStack } from './components/ToastStack'
import { ProgressBar } from './components/ui'
import { useToasts } from './hooks/useToasts'
import {
  createInvalidation,
  deleteBucketPolicy,
  deleteEntries,
  deleteObject,
  deletePrefix,
  downloadEntries,
  downloadObject,
  downloadPrefix,
  findLinkedDistributions,
  getBucketPermissions,
  getObjectMetadata,
  getObjectPermissions,
  getObjectPreview,
  getPrefixPermissions,
  listBuckets,
  listObjects,
  listProfiles,
  openDevtools,
  saveObjectText,
  setBucketAclGrants,
  setBucketPolicy,
  setBucketPublicAccessBlock,
  setObjectAclGrants,
  setPrefixAclGrants,
  uploadPaths,
} from './tauri-api'
import type {
  AwsProfile,
  BucketPermissions,
  DeleteProgress,
  LinkedDistribution,
  ObjectMetadata,
  ObjectPermissions,
  ObjectPreview,
  PermissionGrant,
  PrefixPermissions,
  PublicAccessBlock,
  S3Bucket,
  S3Entry,
  S3EntrySelection,
} from './types'
import { DEFAULT_REGION, PREVIEW_LIMIT, errorText, fileNameFromKey, objectParentPrefix } from './utils/format'

const LAST_PROFILE_KEY = 's3-cloudfront-studio:last-profile'
const LAST_BUCKETS_KEY = 's3-cloudfront-studio:last-buckets'
const LAST_PREFIXES_KEY = 's3-cloudfront-studio:last-prefixes'
const LAST_BUCKET_FILTERS_KEY = 's3-cloudfront-studio:last-bucket-filters'
const LAST_OBJECT_FILTERS_KEY = 's3-cloudfront-studio:last-object-filters'
const BUCKET_PANE_WIDTH_KEY = 's3-cloudfront-studio:bucket-pane-width'
const DETAILS_PANE_WIDTH_KEY = 's3-cloudfront-studio:details-pane-width'
const BUCKET_PANE_COLLAPSED_KEY = 's3-cloudfront-studio:bucket-pane-collapsed'
const DETAILS_PANE_COLLAPSED_KEY = 's3-cloudfront-studio:details-pane-collapsed'
const THEME_KEY = 's3-cloudfront-studio:theme'
const DEFAULT_BUCKET_PANE_WIDTH = 280
const DEFAULT_DETAILS_PANE_WIDTH = 390
const MIN_BUCKET_PANE_WIDTH = 160
const MIN_DETAILS_PANE_WIDTH = 240
const MIN_BROWSER_PANE_WIDTH = 260
const DELETE_PROGRESS_EVENT = 's3-delete-progress'

type ResizePane = 'bucket' | 'details'
type ThemeMode = 'light' | 'dark'

function entryId(entry: S3Entry) {
  return `${entry.kind}:${entry.key}`
}

function entrySelections(entries: S3Entry[]): S3EntrySelection[] {
  return entries.map((entry) => ({ key: entry.key, kind: entry.kind }))
}

function readStorageMap(key: string) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? (value as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeStorageMap(key: string, value: Record<string, string>) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function readStorageNumber(key: string, fallback: number) {
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function readStorageBoolean(key: string, fallback: boolean) {
  const raw = window.localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

function readStorageTheme() {
  const raw = window.localStorage.getItem(THEME_KEY)
  return raw === 'dark' || raw === 'light' ? raw : 'dark'
}

function bucketStorageId(profile: string, bucket: string) {
  return `${profile}:${bucket}`
}

function operationId(name: string) {
  return `${name}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function fitPaneWidths(bucketWidth: number, detailsWidth: number, availableWidth: number) {
  const desiredTotal = bucketWidth + detailsWidth
  if (desiredTotal <= availableWidth) return [bucketWidth, detailsWidth] as const

  const bucketMinimum = bucketWidth > 0 ? MIN_BUCKET_PANE_WIDTH : 0
  const detailsMinimum = detailsWidth > 0 ? MIN_DETAILS_PANE_WIDTH : 0
  const bucketCapacity = Math.max(0, bucketWidth - bucketMinimum)
  const detailsCapacity = Math.max(0, detailsWidth - detailsMinimum)
  const totalCapacity = bucketCapacity + detailsCapacity
  const excess = desiredTotal - availableWidth

  if (excess <= totalCapacity && totalCapacity > 0) {
    return [
      bucketWidth - (excess * bucketCapacity) / totalCapacity,
      detailsWidth - (excess * detailsCapacity) / totalCapacity,
    ] as const
  }

  return [bucketMinimum, detailsMinimum] as const
}

function normalizePrefixInput(value: string) {
  const clean = value.trim().replace(/^\/+/, '')
  if (!clean) return ''
  return clean.endsWith('/') ? clean : `${clean}/`
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function App() {
  const workspaceRef = useRef<HTMLElement | null>(null)
  const [profiles, setProfiles] = useState<AwsProfile[]>([])
  const [selectedProfile, setSelectedProfile] = useState('default')
  const [region, setRegion] = useState(DEFAULT_REGION)
  const [buckets, setBuckets] = useState<S3Bucket[]>([])
  const [bucketFilter, setBucketFilter] = useState('')
  const [selectedBucket, setSelectedBucket] = useState('')
  const selectedBucketRef = useRef('')
  const [prefix, setPrefix] = useState('')
  const [objects, setObjects] = useState<S3Entry[]>([])
  const [objectFilter, setObjectFilter] = useState('')
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [selectedEntry, setSelectedEntry] = useState<S3Entry | undefined>()
  const [selectedEntries, setSelectedEntries] = useState<S3Entry[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | undefined>()
  const [selectedObject, setSelectedObject] = useState<S3Entry | undefined>()
  const [metadata, setMetadata] = useState<ObjectMetadata | undefined>()
  const [preview, setPreview] = useState<ObjectPreview | undefined>()
  const [bucketPermissions, setBucketPermissions] = useState<BucketPermissions | undefined>()
  const [folderPermissions, setFolderPermissions] = useState<PrefixPermissions | undefined>()
  const [objectPermissions, setObjectPermissions] = useState<ObjectPermissions | undefined>()
  const [linkedDistributions, setLinkedDistributions] = useState<LinkedDistribution[]>([])
  const [pathOverrides, setPathOverrides] = useState<Record<string, string>>({})
  const [bucketPolicyDraft, setBucketPolicyDraft] = useState('')
  const [publicAccessBlockDraft, setPublicAccessBlockDraft] = useState<PublicAccessBlock | undefined>()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | undefined>()
  const [invalidationDialog, setInvalidationDialog] = useState<InvalidationDialogState | undefined>()
  const [busy, setBusy] = useState<string | undefined>()
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgress | undefined>()
  const [loadingObjects, setLoadingObjects] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isDropActive, setIsDropActive] = useState(false)
  const [bucketPaneWidth, setBucketPaneWidth] = useState(() => readStorageNumber(BUCKET_PANE_WIDTH_KEY, DEFAULT_BUCKET_PANE_WIDTH))
  const [detailsPaneWidth, setDetailsPaneWidth] = useState(() => readStorageNumber(DETAILS_PANE_WIDTH_KEY, DEFAULT_DETAILS_PANE_WIDTH))
  const [isBucketPaneCollapsed, setIsBucketPaneCollapsed] = useState(() => readStorageBoolean(BUCKET_PANE_COLLAPSED_KEY, false))
  const [isDetailsPaneCollapsed, setIsDetailsPaneCollapsed] = useState(() => readStorageBoolean(DETAILS_PANE_COLLAPSED_KEY, false))
  const [theme, setTheme] = useState<ThemeMode>(() => readStorageTheme())
  const [activeResize, setActiveResize] = useState<ResizePane | undefined>()
  const [workspaceWidth, setWorkspaceWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  const detailRequestId = useRef(0)
  const objectRequestId = useRef(0)
  const activeDeleteProgressId = useRef<string | undefined>(undefined)
  const { toasts, pushToast, dismissToast } = useToasts()

  const awsContext = useMemo(
    () => ({
      profile: selectedProfile || 'default',
      region: region || DEFAULT_REGION,
    }),
    [region, selectedProfile],
  )

  const selectedBucketDetails = useMemo(() => buckets.find((bucket) => bucket.name === selectedBucket), [buckets, selectedBucket])

  const filteredBuckets = useMemo(() => {
    const query = bucketFilter.trim().toLowerCase()
    if (!query) return buckets
    return buckets.filter((bucket) => bucket.name.toLowerCase().includes(query))
  }, [bucketFilter, buckets])

  const filteredObjects = useMemo(() => {
    const query = objectFilter.trim().toLowerCase()
    if (!query) return objects
    return objects.filter((entry) => entry.name.toLowerCase().includes(query) || entry.key.toLowerCase().includes(query))
  }, [objectFilter, objects])

  const leftSplitterWidth = isBucketPaneCollapsed ? 0 : 10
  const rightSplitterWidth = isDetailsPaneCollapsed ? 0 : 10
  const desiredBucketPaneWidth = isBucketPaneCollapsed ? 0 : bucketPaneWidth
  const desiredDetailsPaneWidth = isDetailsPaneCollapsed ? 0 : detailsPaneWidth
  const availablePaneWidth = Math.max(0, workspaceWidth - leftSplitterWidth - rightSplitterWidth - MIN_BROWSER_PANE_WIDTH)
  const [visibleBucketPaneWidth, visibleDetailsPaneWidth] = fitPaneWidths(
    desiredBucketPaneWidth,
    desiredDetailsPaneWidth,
    availablePaneWidth,
  )
  const workspaceStyle = useMemo(
    () => ({
      gridTemplateColumns: `${visibleBucketPaneWidth}px ${leftSplitterWidth}px minmax(${MIN_BROWSER_PANE_WIDTH}px, 1fr) ${rightSplitterWidth}px ${visibleDetailsPaneWidth}px`,
    }),
    [leftSplitterWidth, rightSplitterWidth, visibleBucketPaneWidth, visibleDetailsPaneWidth],
  )

  const clearObjectDetails = useCallback(() => {
    detailRequestId.current += 1
    setSelectedObject(undefined)
    setMetadata(undefined)
    setPreview(undefined)
    setFolderPermissions(undefined)
    setObjectPermissions(undefined)
    setLinkedDistributions([])
    setPathOverrides({})
  }, [])

  const loadFolderPermissions = useCallback(
    async (entry: S3Entry) => {
      if (!selectedBucket || entry.kind !== 'folder') return
      const requestId = detailRequestId.current + 1
      detailRequestId.current = requestId
      setLoadingDetails(true)
      setFolderPermissions(undefined)
      try {
        const permissions = await getPrefixPermissions({ ...awsContext, bucket: selectedBucket, prefix: entry.key })
        if (requestId !== detailRequestId.current) return
        setFolderPermissions(permissions)
      } catch (error) {
        if (requestId !== detailRequestId.current) return
        pushToast('error', `Folder ACL load failed: ${errorText(error)}`)
      } finally {
        if (requestId === detailRequestId.current) setLoadingDetails(false)
      }
    },
    [awsContext, pushToast, selectedBucket],
  )

  const clearSelection = useCallback(() => {
    setSelectedEntry(undefined)
    setSelectedEntries([])
    setSelectionAnchorId(undefined)
    setContextMenu(undefined)
    setInvalidationDialog(undefined)
    clearObjectDetails()
  }, [clearObjectDetails])

  const clearBucketDetails = useCallback(() => {
    setBucketPermissions(undefined)
    setBucketPolicyDraft('')
    setPublicAccessBlockDraft(undefined)
  }, [])

  const restoreBucketWorkspace = useCallback(
    (profileName: string, bucketName: string) => {
      const storageId = bucketStorageId(profileName, bucketName)
      const prefixes = readStorageMap(LAST_PREFIXES_KEY)
      const objectFilters = readStorageMap(LAST_OBJECT_FILTERS_KEY)
      setPrefix(prefixes[storageId] || '')
      setObjectFilter(objectFilters[storageId] || '')
      setObjects([])
      setNextToken(undefined)
      clearBucketDetails()
      clearSelection()
    },
    [clearBucketDetails, clearSelection],
  )

  const loadProfileList = useCallback(async () => {
    setBusy('Loading AWS profiles')
    try {
      const discovered = await listProfiles()
      const nextProfiles = discovered.length > 0 ? discovered : [{ name: 'default', region: DEFAULT_REGION, source: 'fallback' }]
      setProfiles(nextProfiles)
      const savedProfile = window.localStorage.getItem(LAST_PROFILE_KEY)
      const preferred =
        nextProfiles.find((profile) => profile.name === savedProfile) ?? nextProfiles.find((profile) => profile.name === 'default') ?? nextProfiles[0]
      setSelectedProfile(preferred.name)
      setRegion(preferred.region || DEFAULT_REGION)
      const bucketFilters = readStorageMap(LAST_BUCKET_FILTERS_KEY)
      setBucketFilter(bucketFilters[preferred.name] || '')
    } catch (error) {
      pushToast('error', `AWS profile discovery failed: ${errorText(error)}`)
      setProfiles([{ name: 'default', region: DEFAULT_REGION, source: 'fallback' }])
      setSelectedProfile('default')
      setRegion(DEFAULT_REGION)
      setBucketFilter('')
    } finally {
      setBusy(undefined)
    }
  }, [pushToast])

  const loadBucketList = useCallback(async () => {
    setBusy('Loading buckets')
    try {
      const result = await listBuckets(awsContext)
      setBuckets(result)
      const savedBuckets = readStorageMap(LAST_BUCKETS_KEY)
      const savedBucket = savedBuckets[awsContext.profile]
      const currentBucket = selectedBucketRef.current
      const currentBucketIsValid = result.some((bucket) => bucket.name === currentBucket)
      const savedBucketIsValid = result.some((bucket) => bucket.name === savedBucket)
      const nextBucket = currentBucketIsValid ? currentBucket : savedBucketIsValid ? savedBucket || '' : result[0]?.name || ''
      const bucketChanged = nextBucket !== currentBucket
      selectedBucketRef.current = nextBucket
      setSelectedBucket(nextBucket)
      if (nextBucket && bucketChanged) {
        restoreBucketWorkspace(awsContext.profile, nextBucket)
      }
      if (result.length === 0) {
        selectedBucketRef.current = ''
        setSelectedBucket('')
        setPrefix('')
        setObjectFilter('')
        setObjects([])
        clearBucketDetails()
        clearSelection()
      }
    } catch (error) {
      pushToast('error', `Bucket load failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }, [awsContext, clearBucketDetails, clearSelection, pushToast, restoreBucketWorkspace])

  const fetchObjectPage = useCallback(
    async (append: boolean, continuationToken?: string) => {
      if (!selectedBucket) return
      const requestId = objectRequestId.current + 1
      objectRequestId.current = requestId
      setLoadingObjects(true)
      try {
        const result = await listObjects({
          ...awsContext,
          bucket: selectedBucket,
          prefix,
          continuationToken,
        })
        if (requestId !== objectRequestId.current) return
        setObjects((current) => (append ? [...current, ...result.entries] : result.entries))
        setNextToken(result.next_continuation_token)
        if (!append) clearSelection()
      } catch (error) {
        if (requestId !== objectRequestId.current) return
        pushToast('error', `Object load failed: ${errorText(error)}`)
      } finally {
        if (requestId === objectRequestId.current) setLoadingObjects(false)
      }
    },
    [awsContext, clearSelection, prefix, pushToast, selectedBucket],
  )

  const reloadObjectList = useCallback(async () => {
    await fetchObjectPage(false)
  }, [fetchObjectPage])

  const loadMoreObjectList = useCallback(async () => {
    await fetchObjectPage(true, nextToken)
  }, [fetchObjectPage, nextToken])

  const loadObjectDetails = useCallback(
    async (entry: S3Entry) => {
      if (!selectedBucket || entry.kind !== 'object') return
      if (isDetailsPaneCollapsed) return
      const requestId = detailRequestId.current + 1
      detailRequestId.current = requestId
      setLoadingDetails(true)
      setMetadata(undefined)
      setPreview(undefined)
      setObjectPermissions(undefined)
      setLinkedDistributions([])
      setPathOverrides({})
      try {
        const [nextMetadata, nextPreview, links, permissions] = await Promise.all([
          getObjectMetadata({ ...awsContext, bucket: selectedBucket, key: entry.key }),
          getObjectPreview({ ...awsContext, bucket: selectedBucket, key: entry.key, maxBytes: PREVIEW_LIMIT }),
          findLinkedDistributions({ ...awsContext, bucket: selectedBucket, key: entry.key }),
          getObjectPermissions({ ...awsContext, bucket: selectedBucket, key: entry.key }),
        ])
        if (requestId !== detailRequestId.current) return
        setMetadata(nextMetadata)
        setPreview(nextPreview)
        setLinkedDistributions(links)
        setObjectPermissions(permissions)
        setPathOverrides(Object.fromEntries(links.map((link) => [link.id, link.invalidation_path])))
      } catch (error) {
        if (requestId !== detailRequestId.current) return
        pushToast('error', `Object details failed: ${errorText(error)}`)
      } finally {
        if (requestId === detailRequestId.current) setLoadingDetails(false)
      }
    },
    [awsContext, isDetailsPaneCollapsed, pushToast, selectedBucket],
  )

  const loadBucketDetails = useCallback(async () => {
    if (!selectedBucket) return
    if (isDetailsPaneCollapsed) return
    const requestId = detailRequestId.current + 1
    detailRequestId.current = requestId
    setLoadingDetails(true)
    setBucketPermissions(undefined)
    try {
      const permissions = await getBucketPermissions({ ...awsContext, bucket: selectedBucket })
      if (requestId !== detailRequestId.current) return
      setBucketPermissions(permissions)
      setBucketPolicyDraft(permissions.bucket_policy || '')
      setPublicAccessBlockDraft(
        permissions.public_access_block || {
          block_public_acls: false,
          ignore_public_acls: false,
          block_public_policy: false,
          restrict_public_buckets: false,
        },
      )
    } catch (error) {
      if (requestId !== detailRequestId.current) return
      pushToast('error', `Bucket details failed: ${errorText(error)}`)
    } finally {
      if (requestId === detailRequestId.current) setLoadingDetails(false)
    }
  }, [awsContext, isDetailsPaneCollapsed, pushToast, selectedBucket])

  const loadFolderDetails = useCallback(
    async (entry: S3Entry) => {
      if (!selectedBucket || entry.kind !== 'folder') return
      if (isDetailsPaneCollapsed) return
      const requestId = detailRequestId.current + 1
      detailRequestId.current = requestId
      setFolderPermissions(undefined)
      if (requestId === detailRequestId.current) setLoadingDetails(false)
    },
    [isDetailsPaneCollapsed, selectedBucket],
  )

  const uploadSourcePaths = useCallback(
    async (sourcePaths: string[]) => {
      if (!selectedBucket) {
        pushToast('error', 'Choose a bucket before uploading')
        return
      }
      if (sourcePaths.length === 0) return
      setBusy(`Uploading ${sourcePaths.length} item${sourcePaths.length === 1 ? '' : 's'}`)
      try {
        const uploaded = await uploadPaths({
          ...awsContext,
          bucket: selectedBucket,
          prefix,
          sourcePaths,
        })
        pushToast('success', `Uploaded ${uploaded.length} object${uploaded.length === 1 ? '' : 's'}`)
        await reloadObjectList()
      } catch (error) {
        pushToast('error', `Upload failed: ${errorText(error)}`)
      } finally {
        setBusy(undefined)
      }
    },
    [awsContext, prefix, pushToast, reloadObjectList, selectedBucket],
  )

  useEffect(() => {
    void loadProfileList()
  }, [loadProfileList])

  useEffect(() => {
    if (profiles.length > 0) {
      void loadBucketList()
    }
  }, [loadBucketList, profiles.length])

  useEffect(() => {
    void reloadObjectList()
  }, [prefix, reloadObjectList, selectedBucket])

  useEffect(() => {
    if (isDetailsPaneCollapsed) return
    if (!selectedBucket) return
    if (!selectedEntry) {
      void loadBucketDetails()
      return
    }
    if (selectedEntry.kind === 'folder') {
      void loadFolderDetails(selectedEntry)
    }
  }, [isDetailsPaneCollapsed, loadBucketDetails, loadFolderDetails, selectedBucket, selectedEntry])

  useEffect(() => {
    if (isDetailsPaneCollapsed) return
    if (selectedObject?.kind === 'object') {
      void loadObjectDetails(selectedObject)
    }
  }, [isDetailsPaneCollapsed, loadObjectDetails, selectedObject])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let unlisten: (() => void) | undefined
    void listen<DeleteProgress>(DELETE_PROGRESS_EVENT, (event) => {
      if (activeDeleteProgressId.current !== event.payload.id) return
      setDeleteProgress(event.payload)
    }).then((handler) => {
      unlisten = handler
    })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let unlisten: (() => void) | undefined
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'enter') {
          setIsDropActive(true)
          return
        }
        if (event.payload.type === 'leave') {
          setIsDropActive(false)
          return
        }
        if (event.payload.type === 'drop') {
          setIsDropActive(false)
          void uploadSourcePaths(event.payload.paths)
        }
      })
      .then((handler) => {
        unlisten = handler
      })
      .catch(() => undefined)

    return () => {
      unlisten?.()
    }
  }, [uploadSourcePaths])

  useEffect(() => {
    if (!activeResize) return

    function stopResize() {
      setActiveResize(undefined)
      document.body.classList.remove('is-resizing')
    }

    function handleMouseMove(event: globalThis.MouseEvent) {
      const workspace = workspaceRef.current
      if (!workspace) return
      const rect = workspace.getBoundingClientRect()
      if (activeResize === 'bucket') {
        const max = Math.max(MIN_BUCKET_PANE_WIDTH, rect.width - visibleDetailsPaneWidth - rightSplitterWidth - leftSplitterWidth - MIN_BROWSER_PANE_WIDTH)
        setBucketPaneWidth(clamp(event.clientX - rect.left, MIN_BUCKET_PANE_WIDTH, max))
        return
      }
      const max = Math.max(MIN_DETAILS_PANE_WIDTH, rect.width - visibleBucketPaneWidth - rightSplitterWidth - leftSplitterWidth - MIN_BROWSER_PANE_WIDTH)
      setDetailsPaneWidth(clamp(rect.right - event.clientX, MIN_DETAILS_PANE_WIDTH, max))
    }

    document.body.classList.add('is-resizing')
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResize)
    return () => {
      document.body.classList.remove('is-resizing')
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResize)
    }
  }, [activeResize, leftSplitterWidth, rightSplitterWidth, visibleBucketPaneWidth, visibleDetailsPaneWidth])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const updateWidth = () => setWorkspaceWidth(workspace.getBoundingClientRect().width)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    window.localStorage.setItem(BUCKET_PANE_WIDTH_KEY, String(bucketPaneWidth))
  }, [bucketPaneWidth])

  useEffect(() => {
    window.localStorage.setItem(DETAILS_PANE_WIDTH_KEY, String(detailsPaneWidth))
  }, [detailsPaneWidth])

  useEffect(() => {
    window.localStorage.setItem(BUCKET_PANE_COLLAPSED_KEY, String(isBucketPaneCollapsed))
  }, [isBucketPaneCollapsed])

  useEffect(() => {
    window.localStorage.setItem(DETAILS_PANE_COLLAPSED_KEY, String(isDetailsPaneCollapsed))
  }, [isDetailsPaneCollapsed])

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme)
    if (isTauriRuntime()) {
      void getCurrentWindow().setTheme(theme).catch(() => undefined)
    }
  }, [theme])

  useEffect(() => {
    if (!selectedProfile) return
    const filters = readStorageMap(LAST_BUCKET_FILTERS_KEY)
    writeStorageMap(LAST_BUCKET_FILTERS_KEY, { ...filters, [selectedProfile]: bucketFilter })
  }, [bucketFilter, selectedProfile])

  useEffect(() => {
    if (!selectedProfile || !selectedBucket) return
    const bucketsByProfile = readStorageMap(LAST_BUCKETS_KEY)
    writeStorageMap(LAST_BUCKETS_KEY, { ...bucketsByProfile, [selectedProfile]: selectedBucket })
  }, [selectedBucket, selectedProfile])

  useEffect(() => {
    if (!selectedProfile || !selectedBucket) return
    const prefixes = readStorageMap(LAST_PREFIXES_KEY)
    writeStorageMap(LAST_PREFIXES_KEY, { ...prefixes, [bucketStorageId(selectedProfile, selectedBucket)]: prefix })
  }, [prefix, selectedBucket, selectedProfile])

  useEffect(() => {
    if (!selectedProfile || !selectedBucket) return
    const filters = readStorageMap(LAST_OBJECT_FILTERS_KEY)
    writeStorageMap(LAST_OBJECT_FILTERS_KEY, { ...filters, [bucketStorageId(selectedProfile, selectedBucket)]: objectFilter })
  }, [objectFilter, selectedBucket, selectedProfile])

  function chooseProfile(profileName: string) {
    const profile = profiles.find((item) => item.name === profileName)
    window.localStorage.setItem(LAST_PROFILE_KEY, profileName)
    setSelectedProfile(profileName)
    setRegion(profile?.region || region || DEFAULT_REGION)
    const bucketFilters = readStorageMap(LAST_BUCKET_FILTERS_KEY)
    setBucketFilter(bucketFilters[profileName] || '')
    selectedBucketRef.current = ''
    setSelectedBucket('')
    setPrefix('')
    setObjectFilter('')
    setObjects([])
    clearBucketDetails()
    clearSelection()
  }

  function chooseBucket(bucketName: string) {
    selectedBucketRef.current = bucketName
    setSelectedBucket(bucketName)
    restoreBucketWorkspace(selectedProfile, bucketName)
    if (bucketName === selectedBucket) {
      void reloadObjectList()
    }
  }

  function navigateToPrefix(nextPrefix: string) {
    setPrefix(normalizePrefixInput(nextPrefix))
    setNextToken(undefined)
    clearSelection()
  }

  function focusEntry(entry: S3Entry) {
    setContextMenu(undefined)
    setSelectedEntry(entry)
    setMetadata(undefined)
    setPreview(undefined)
    setFolderPermissions(undefined)
    setObjectPermissions(undefined)
    setLinkedDistributions([])
    setPathOverrides({})
    if (entry.kind === 'object') {
      setSelectedObject(entry)
      return
    }
    setSelectedObject(undefined)
  }

  function selectEntry(entry: S3Entry, mode: SelectionMode = 'single') {
    const id = entryId(entry)
    if (mode === 'range') {
      const anchorIndex = filteredObjects.findIndex((item) => entryId(item) === selectionAnchorId)
      const targetIndex = filteredObjects.findIndex((item) => entryId(item) === id)
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
        setSelectedEntries(filteredObjects.slice(start, end + 1))
      } else {
        setSelectedEntries([entry])
        setSelectionAnchorId(id)
      }
      focusEntry(entry)
      return
    }

    if (mode === 'toggle') {
      const exists = selectedEntries.some((item) => entryId(item) === id)
      const nextEntries = exists ? selectedEntries.filter((item) => entryId(item) !== id) : [...selectedEntries, entry]
      if (nextEntries.length === 0) {
        clearSelection()
        return
      }
      setSelectedEntries(nextEntries)
      setSelectionAnchorId(id)
      focusEntry(exists ? nextEntries[nextEntries.length - 1] : entry)
      return
    }

    setSelectedEntries([entry])
    setSelectionAnchorId(id)
    focusEntry(entry)
  }

  function selectAllEntries() {
    if (filteredObjects.length === 0) return
    setSelectedEntries(filteredObjects)
    setSelectionAnchorId(entryId(filteredObjects[0]))
    focusEntry(filteredObjects[0])
  }

  function activateEntry(entry: S3Entry) {
    if (entry.kind === 'folder') {
      navigateToPrefix(entry.key)
      return
    }
    selectEntry(entry)
  }

  function openContextMenu(entry: S3Entry, x: number, y: number) {
    if (selectedEntries.some((item) => entryId(item) === entryId(entry))) {
      focusEntry(entry)
    } else {
      selectEntry(entry)
    }
    setContextMenu({ entry, x, y })
  }

  async function handleUploadFiles() {
    const selected = await open({
      multiple: true,
      directory: false,
      title: 'Choose files to upload',
    })
    if (!selected) return
    await uploadSourcePaths(Array.isArray(selected) ? selected : [selected])
  }

  async function handleUploadFolders() {
    const selected = await open({
      multiple: true,
      directory: true,
      title: 'Choose folders to upload',
    })
    if (!selected) return
    await uploadSourcePaths(Array.isArray(selected) ? selected : [selected])
  }

  function currentSelection() {
    if (selectedEntries.length > 0) return selectedEntries
    return selectedEntry ? [selectedEntry] : []
  }

  async function handleDownloadEntry(entry: S3Entry) {
    if (!selectedBucket) return
    if (entry.kind === 'folder') {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose download folder',
      })
      if (!selected) return
      const destinationPath = Array.isArray(selected) ? selected[0] : selected
      if (!destinationPath) return
      setBusy('Downloading folder')
      try {
        const result = await downloadPrefix({
          ...awsContext,
          bucket: selectedBucket,
          prefix: entry.key,
          destinationPath,
        })
        pushToast('success', `Downloaded ${result.downloaded} object${result.downloaded === 1 ? '' : 's'} to ${result.destination_path}`)
      } catch (error) {
        pushToast('error', `Folder download failed: ${errorText(error)}`)
      } finally {
        setBusy(undefined)
      }
      return
    }

    const destinationPath = await save({
      title: 'Download object',
      defaultPath: fileNameFromKey(entry.key),
    })
    if (!destinationPath) return
    setBusy('Downloading object')
    try {
      await downloadObject({
        ...awsContext,
        bucket: selectedBucket,
        key: entry.key,
        destinationPath,
      })
      pushToast('success', `Downloaded ${fileNameFromKey(entry.key)}`)
    } catch (error) {
      pushToast('error', `Download failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function handleDownload() {
    const entries = currentSelection()
    if (entries.length === 0 || !selectedBucket) return
    if (entries.length === 1) {
      await handleDownloadEntry(entries[0])
      return
    }

    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choose download folder',
    })
    if (!selected) return
    const destinationPath = Array.isArray(selected) ? selected[0] : selected
    if (!destinationPath) return
    setBusy(`Downloading ${entries.length} selected items`)
    try {
      const result = await downloadEntries({
        ...awsContext,
        bucket: selectedBucket,
        entries: entrySelections(entries),
        destinationPath,
      })
      pushToast('success', `Downloaded ${result.downloaded} object${result.downloaded === 1 ? '' : 's'} to ${result.destination_path}`)
    } catch (error) {
      pushToast('error', `Bulk download failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function handleDeleteEntry(entry: S3Entry) {
    if (!selectedBucket) return
    if (entry.kind === 'folder') {
      const confirmed = await confirm(`Delete every object under ${entry.key}?`, {
        title: selectedBucket,
        kind: 'warning',
      })
      if (!confirmed) return
      const progressId = operationId('delete-folder')
      activeDeleteProgressId.current = progressId
      setDeleteProgress({
        id: progressId,
        bucket: selectedBucket,
        phase: 'listing',
        listed: 0,
        deleted: 0,
        done: false,
      })
      setBusy('Deleting folder')
      try {
        const result = await deletePrefix({
          ...awsContext,
          bucket: selectedBucket,
          prefix: entry.key,
          progressId,
        })
        pushToast('success', `Deleted ${result.deleted} object${result.deleted === 1 ? '' : 's'}`)
        clearSelection()
        await reloadObjectList()
      } catch (error) {
        pushToast('error', `Folder delete failed: ${errorText(error)}`)
      } finally {
        activeDeleteProgressId.current = undefined
        setBusy(undefined)
        setDeleteProgress(undefined)
      }
      return
    }

    const confirmed = await confirm(`Delete ${entry.key}?`, {
      title: selectedBucket,
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Deleting object')
    try {
      await deleteObject({
        ...awsContext,
        bucket: selectedBucket,
        key: entry.key,
      })
      pushToast('success', `Deleted ${fileNameFromKey(entry.key)}`)
      clearSelection()
      await reloadObjectList()
    } catch (error) {
      pushToast('error', `Delete failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function handleDelete() {
    const entries = currentSelection()
    if (entries.length === 0 || !selectedBucket) return
    if (entries.length === 1) {
      await handleDeleteEntry(entries[0])
      return
    }

    const folders = entries.filter((entry) => entry.kind === 'folder').length
    const confirmed = await confirm(
      `Delete ${entries.length} selected item${entries.length === 1 ? '' : 's'}${folders > 0 ? `, including all objects under ${folders} folder${folders === 1 ? '' : 's'}` : ''}?`,
      {
        title: selectedBucket,
        kind: 'warning',
      },
    )
    if (!confirmed) return
    const progressId = operationId('delete-selection')
    activeDeleteProgressId.current = progressId
    setDeleteProgress({
      id: progressId,
      bucket: selectedBucket,
      phase: 'deleting',
      listed: entries.length,
      deleted: 0,
      total: folders === 0 ? entries.length : undefined,
      done: false,
    })
    setBusy(`Deleting ${entries.length} selected items`)
    try {
      const result = await deleteEntries({
        ...awsContext,
        bucket: selectedBucket,
        entries: entrySelections(entries),
        progressId,
      })
      pushToast('success', `Deleted ${result.deleted} object${result.deleted === 1 ? '' : 's'}`)
      clearSelection()
      await reloadObjectList()
    } catch (error) {
      pushToast('error', `Bulk delete failed: ${errorText(error)}`)
    } finally {
      activeDeleteProgressId.current = undefined
      setBusy(undefined)
      setDeleteProgress(undefined)
    }
  }

  async function handleInvalidateEntry(entry: S3Entry) {
    if (!selectedBucket) return
    const invalidationTarget = entry.kind === 'folder' ? `${entry.key}*` : entry.key
    const label = entry.kind === 'folder' ? entry.key : fileNameFromKey(entry.key)
    setBusy('Finding linked distributions')
    try {
      const links = await findLinkedDistributions({
        ...awsContext,
        bucket: selectedBucket,
        key: invalidationTarget,
      })
      if (links.length === 0) {
        pushToast('info', `No linked CloudFront distributions found for ${label}`)
        return
      }
      setInvalidationDialog({
        title: `Invalidate ${label}`,
        links,
        selected: Object.fromEntries(links.map((link) => [link.id, true])),
        paths: Object.fromEntries(links.map((link) => [link.id, link.invalidation_path])),
      })
    } catch (error) {
      pushToast('error', `Invalidation failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function handleInvalidateSelection() {
    const entries = currentSelection()
    if (entries.length === 0 || !selectedBucket) return
    if (entries.length === 1) {
      await handleInvalidateEntry(entries[0])
      return
    }

    setBusy('Finding linked distributions')
    try {
      const grouped = new Map<string, { link: LinkedDistribution; paths: Set<string> }>()
      for (const entry of entries) {
        const invalidationTarget = entry.kind === 'folder' ? `${entry.key}*` : entry.key
        const links = await findLinkedDistributions({
          ...awsContext,
          bucket: selectedBucket,
          key: invalidationTarget,
        })
        for (const link of links) {
          const existing = grouped.get(link.id)
          if (existing) {
            existing.paths.add(link.invalidation_path)
          } else {
            grouped.set(link.id, { link, paths: new Set([link.invalidation_path]) })
          }
        }
      }

      const groups = Array.from(grouped.values())
      if (groups.length === 0) {
        pushToast('info', `No linked CloudFront distributions found for ${entries.length} selected items`)
        return
      }

      setInvalidationDialog({
        title: `Invalidate ${entries.length} selected items`,
        links: groups.map((group) => group.link),
        selected: Object.fromEntries(groups.map((group) => [group.link.id, true])),
        paths: Object.fromEntries(groups.map((group) => [group.link.id, Array.from(group.paths).join('\n')])),
      })
    } catch (error) {
      pushToast('error', `Invalidation failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function handleInspect() {
    try {
      await openDevtools()
    } catch (error) {
      pushToast('error', `Inspect failed: ${errorText(error)}`)
    }
  }

  async function createSelectedInvalidations() {
    if (!invalidationDialog) return
    const selectedLinks = invalidationDialog.links.filter((link) => invalidationDialog.selected[link.id])
    if (selectedLinks.length === 0) return
    setBusy('Creating invalidations')
    try {
      const results = []
      for (const link of selectedLinks) {
        const paths = (invalidationDialog.paths[link.id] || link.invalidation_path)
          .split(/\r?\n/)
          .map((path) => path.trim())
          .filter(Boolean)
        results.push(
          await createInvalidation({
            profile: awsContext.profile,
            distributionId: link.id,
            paths,
          }),
        )
      }
      setInvalidationDialog(undefined)
      pushToast('success', `Queued ${results.length} invalidation${results.length === 1 ? '' : 's'}`)
    } catch (error) {
      pushToast('error', `Invalidation failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function saveBucketAclGrants(grants: PermissionGrant[]) {
    if (!selectedBucket) return
    setBusy('Updating bucket ACL')
    try {
      const result = await setBucketAclGrants({ ...awsContext, bucket: selectedBucket, grants })
      pushToast('success', result.message)
      await loadBucketDetails()
    } catch (error) {
      pushToast('error', `Bucket ACL update failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function saveObjectAclGrants(grants: PermissionGrant[]) {
    if (!selectedBucket || !selectedObject) return
    setBusy('Updating object ACL')
    try {
      const result = await setObjectAclGrants({ ...awsContext, bucket: selectedBucket, key: selectedObject.key, grants })
      pushToast('success', result.message)
      await loadObjectDetails(selectedObject)
    } catch (error) {
      pushToast('error', `Object ACL update failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function saveFolderAclGrants(grants: PermissionGrant[]) {
    if (!selectedBucket || selectedEntry?.kind !== 'folder') return
    const confirmed = await confirm(`Apply this ACL grant table to every object under ${selectedEntry.key}?`, {
      title: 'Folder ACL',
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Updating folder ACLs')
    try {
      const result = await setPrefixAclGrants({ ...awsContext, bucket: selectedBucket, prefix: selectedEntry.key, grants })
      pushToast('success', `Updated ${result.updated} object${result.updated === 1 ? '' : 's'}`)
      await loadFolderPermissions(selectedEntry)
    } catch (error) {
      pushToast('error', `Folder ACL update failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function saveObjectEditorText(text: string) {
    if (!selectedBucket || !selectedObject) return
    setBusy('Saving object')
    try {
      await saveObjectText({
        ...awsContext,
        bucket: selectedBucket,
        key: selectedObject.key,
        text,
        contentType: metadata?.content_type,
      })
      pushToast('success', `Saved ${fileNameFromKey(selectedObject.key)}`)
      await Promise.all([loadObjectDetails(selectedObject), reloadObjectList()])
    } catch (error) {
      pushToast('error', `Save failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function saveBucketPolicy() {
    if (!selectedBucket) return
    try {
      JSON.parse(bucketPolicyDraft)
    } catch {
      pushToast('error', 'Bucket policy must be valid JSON')
      return
    }
    const confirmed = await confirm(`Save bucket policy for ${selectedBucket}?`, {
      title: 'Bucket policy',
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Saving bucket policy')
    try {
      const result = await setBucketPolicy({ ...awsContext, bucket: selectedBucket, policy: bucketPolicyDraft })
      pushToast('success', result.message)
      await loadBucketDetails()
    } catch (error) {
      pushToast('error', `Bucket policy save failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function removeBucketPolicy() {
    if (!selectedBucket) return
    const confirmed = await confirm(`Delete bucket policy for ${selectedBucket}?`, {
      title: 'Bucket policy',
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Deleting bucket policy')
    try {
      const result = await deleteBucketPolicy({ ...awsContext, bucket: selectedBucket })
      setBucketPolicyDraft('')
      pushToast('success', result.message)
      await loadBucketDetails()
    } catch (error) {
      pushToast('error', `Bucket policy delete failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function savePublicAccessBlock() {
    if (!selectedBucket || !publicAccessBlockDraft) return
    const confirmed = await confirm(`Save public access block settings for ${selectedBucket}?`, {
      title: 'Public access block',
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Saving public access block')
    try {
      const result = await setBucketPublicAccessBlock({
        ...awsContext,
        bucket: selectedBucket,
        publicAccessBlock: publicAccessBlockDraft,
      })
      pushToast('success', result.message)
      await loadBucketDetails()
    } catch (error) {
      pushToast('error', `Public access block save failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function handleInvalidate(link: LinkedDistribution) {
    const path = pathOverrides[link.id] || link.invalidation_path
    const folderPath = selectedObject ? `${objectParentPrefix(selectedObject.key)}*`.replace(/^([^/])/, '/$1') : link.invalidation_path
    setInvalidationDialog({
      title: `Invalidate ${link.id}`,
      links: [link],
      selected: { [link.id]: true },
      paths: { [link.id]: path },
      presets: { [link.id]: { object: link.invalidation_path, folder: folderPath } },
    })
  }

  const progressPercent =
    deleteProgress?.total && deleteProgress.total > 0 ? Math.min(100, Math.round((deleteProgress.deleted / deleteProgress.total) * 100)) : undefined
  const progressLabel = deleteProgress
    ? deleteProgress.total
      ? `${deleteProgress.deleted} / ${deleteProgress.total} deleted`
      : `${deleteProgress.deleted} deleted${deleteProgress.listed > deleteProgress.deleted ? `, ${deleteProgress.listed} listed` : ''}`
    : undefined

  return (
    <div
      className={isTauriRuntime() && /Mac/i.test(navigator.platform) ? 'app-shell macos-window' : 'app-shell'}
      data-theme={theme}
    >
      <AppHeader
        profiles={profiles}
        selectedProfile={selectedProfile}
        region={region}
        isBucketPaneCollapsed={isBucketPaneCollapsed}
        isDetailsPaneCollapsed={isDetailsPaneCollapsed}
        theme={theme}
        onProfileChange={chooseProfile}
        onRegionChange={setRegion}
        onRefreshBuckets={loadBucketList}
        onToggleBucketPane={() => setIsBucketPaneCollapsed((current) => !current)}
        onToggleDetailsPane={() => setIsDetailsPaneCollapsed((current) => !current)}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />

      <div className="workspace-scroll">
        <main ref={workspaceRef} className="workspace" style={workspaceStyle}>
          <div className="pane-slot" aria-hidden={isBucketPaneCollapsed}>
            {!isBucketPaneCollapsed ? (
              <BucketPane
                buckets={buckets}
                filteredBuckets={filteredBuckets}
                bucketFilter={bucketFilter}
                selectedBucket={selectedBucket}
                onFilterChange={setBucketFilter}
                onChooseBucket={chooseBucket}
              />
            ) : null}
          </div>

          <div
            className={isBucketPaneCollapsed ? 'pane-splitter hidden' : 'pane-splitter'}
            onMouseDown={() => setActiveResize('bucket')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize bucket sidebar"
          />

          <BrowserPane
            bucket={selectedBucket}
            prefix={prefix}
            objects={objects}
            filteredObjects={filteredObjects}
            objectFilter={objectFilter}
            selectedEntry={selectedEntry}
            selectedEntries={selectedEntries}
            nextToken={nextToken}
            busy={busy}
            loadingObjects={loadingObjects}
            isDropActive={isDropActive}
            onFilterChange={setObjectFilter}
            onSetPrefix={navigateToPrefix}
            onSelectEntry={selectEntry}
            onSelectAll={selectAllEntries}
            onClearSelection={clearSelection}
            onActivateEntry={activateEntry}
            onContextMenu={openContextMenu}
            onUploadFiles={handleUploadFiles}
            onUploadFolders={handleUploadFolders}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onRefresh={reloadObjectList}
            onLoadMore={loadMoreObjectList}
          />

          <div
            className={isDetailsPaneCollapsed ? 'pane-splitter hidden' : 'pane-splitter'}
            onMouseDown={() => setActiveResize('details')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize details sidebar"
          />

          <div className="pane-slot" aria-hidden={isDetailsPaneCollapsed}>
            {!isDetailsPaneCollapsed ? (
              <DetailsPane
                selectedBucket={selectedBucket}
                selectedRegion={region || DEFAULT_REGION}
                selectedBucketDetails={selectedBucketDetails}
                selectedEntry={selectedEntry}
                selectedObject={selectedObject}
                metadata={metadata}
                preview={preview}
                bucketPermissions={bucketPermissions}
                folderPermissions={folderPermissions}
                objectPermissions={objectPermissions}
                linkedDistributions={linkedDistributions}
                pathOverrides={pathOverrides}
                bucketPolicyDraft={bucketPolicyDraft}
                publicAccessBlockDraft={publicAccessBlockDraft}
                loadingDetails={loadingDetails}
                busy={busy}
                theme={theme}
                onSaveBucketAclGrants={saveBucketAclGrants}
                onSaveFolderAclGrants={saveFolderAclGrants}
                onSaveObjectAclGrants={saveObjectAclGrants}
                onLoadFolderPermissions={() => {
                  if (selectedEntry?.kind === 'folder') void loadFolderPermissions(selectedEntry)
                }}
                onSaveObjectText={saveObjectEditorText}
                onBucketPolicyChange={setBucketPolicyDraft}
                onSaveBucketPolicy={saveBucketPolicy}
                onDeleteBucketPolicy={removeBucketPolicy}
                onPublicAccessBlockChange={setPublicAccessBlockDraft}
                onSavePublicAccessBlock={savePublicAccessBlock}
                onInvalidate={handleInvalidate}
              />
            ) : null}
          </div>
        </main>
      </div>

      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(undefined)}
        onOpen={activateEntry}
        selectedCount={selectedEntries.length}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onInvalidate={handleInvalidateSelection}
        onInspect={handleInspect}
      />

      <InvalidationDialog
        state={invalidationDialog}
        busy={busy}
        onClose={() => setInvalidationDialog(undefined)}
        onToggle={(distributionId, selected) =>
          setInvalidationDialog((current) =>
            current ? { ...current, selected: { ...current.selected, [distributionId]: selected } } : current,
          )
        }
        onPathChange={(distributionId, value) =>
          setInvalidationDialog((current) => (current ? { ...current, paths: { ...current.paths, [distributionId]: value } } : current))
        }
        onCreate={createSelectedInvalidations}
      />

      {busy ? (
        <div className="busy-bar">
          <Loader2 className="spin" size={16} />
          <div className="busy-content">
            <div className="busy-text">
              <span>{busy}</span>
              {progressLabel ? <small>{progressLabel}</small> : null}
            </div>
            {deleteProgress ? (
              <ProgressBar
                percent={progressPercent}
                indeterminate={progressPercent === undefined}
                aria-valuemin={0}
                aria-valuemax={deleteProgress.total || undefined}
                aria-valuenow={deleteProgress.total ? deleteProgress.deleted : undefined}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default App
