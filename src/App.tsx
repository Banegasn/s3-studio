import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { confirm, open, save } from '@tauri-apps/plugin-dialog'
import './App.css'
import { AppHeader } from './components/AppHeader'
import { BrowserPane, type SelectionMode } from './components/BrowserPane'
import { BucketPane } from './components/BucketPane'
import { ContextMenu, type ContextMenuState } from './components/ContextMenu'
import { DetailsPane } from './components/DetailsPane'
import { InvalidationDialog, type InvalidationDialogState } from './components/InvalidationDialog'
import { ToastStack } from './components/ToastStack'
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
  setBucketCannedAcl,
  setBucketPolicy,
  setBucketPublicAccessBlock,
  setObjectCannedAcl,
  setPrefixCannedAcl,
  uploadPaths,
} from './tauri-api'
import type {
  AwsProfile,
  BucketPermissions,
  LinkedDistribution,
  ObjectMetadata,
  ObjectPermissions,
  ObjectPreview,
  PrefixPermissions,
  PublicAccessBlock,
  S3Bucket,
  S3Entry,
  S3EntrySelection,
} from './types'
import { DEFAULT_REGION, PREVIEW_LIMIT, errorText, fileNameFromKey } from './utils/format'

const LAST_PROFILE_KEY = 's3-cloudfront-studio:last-profile'

function entryId(entry: S3Entry) {
  return `${entry.kind}:${entry.key}`
}

function entrySelections(entries: S3Entry[]): S3EntrySelection[] {
  return entries.map((entry) => ({ key: entry.key, kind: entry.kind }))
}

function App() {
  const [profiles, setProfiles] = useState<AwsProfile[]>([])
  const [selectedProfile, setSelectedProfile] = useState('default')
  const [region, setRegion] = useState(DEFAULT_REGION)
  const [buckets, setBuckets] = useState<S3Bucket[]>([])
  const [bucketFilter, setBucketFilter] = useState('')
  const [selectedBucket, setSelectedBucket] = useState('')
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
  const [bucketAclDraft, setBucketAclDraft] = useState('private')
  const [folderAclDraft, setFolderAclDraft] = useState('private')
  const [objectAclDraft, setObjectAclDraft] = useState('private')
  const [bucketPolicyDraft, setBucketPolicyDraft] = useState('')
  const [publicAccessBlockDraft, setPublicAccessBlockDraft] = useState<PublicAccessBlock | undefined>()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | undefined>()
  const [invalidationDialog, setInvalidationDialog] = useState<InvalidationDialogState | undefined>()
  const [busy, setBusy] = useState<string | undefined>()
  const [loadingObjects, setLoadingObjects] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isDropActive, setIsDropActive] = useState(false)
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

  const clearObjectDetails = useCallback(() => {
    setSelectedObject(undefined)
    setMetadata(undefined)
    setPreview(undefined)
    setFolderPermissions(undefined)
    setObjectPermissions(undefined)
    setLinkedDistributions([])
    setPathOverrides({})
  }, [])

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
    } catch (error) {
      pushToast('error', `AWS profile discovery failed: ${errorText(error)}`)
      setProfiles([{ name: 'default', region: DEFAULT_REGION, source: 'fallback' }])
      setSelectedProfile('default')
      setRegion(DEFAULT_REGION)
    } finally {
      setBusy(undefined)
    }
  }, [pushToast])

  const loadBucketList = useCallback(async () => {
    setBusy('Loading buckets')
    try {
      const result = await listBuckets(awsContext)
      setBuckets(result)
      setSelectedBucket((current) => (result.length > 0 && result.some((bucket) => bucket.name === current) ? current : result[0]?.name || ''))
      if (result.length === 0) {
        setObjects([])
        clearBucketDetails()
        clearSelection()
      }
    } catch (error) {
      pushToast('error', `Bucket load failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }, [awsContext, clearBucketDetails, clearSelection, pushToast])

  const fetchObjectPage = useCallback(
    async (append: boolean, continuationToken?: string) => {
      if (!selectedBucket) return
      setLoadingObjects(true)
      try {
        const result = await listObjects({
          ...awsContext,
          bucket: selectedBucket,
          prefix,
          continuationToken,
        })
        setObjects((current) => (append ? [...current, ...result.entries] : result.entries))
        setNextToken(result.next_continuation_token)
        if (!append) clearSelection()
      } catch (error) {
        pushToast('error', `Object load failed: ${errorText(error)}`)
      } finally {
        setLoadingObjects(false)
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
        setMetadata(nextMetadata)
        setPreview(nextPreview)
        setLinkedDistributions(links)
        setObjectPermissions(permissions)
        setPathOverrides(Object.fromEntries(links.map((link) => [link.id, link.invalidation_path])))
      } catch (error) {
        pushToast('error', `Object details failed: ${errorText(error)}`)
      } finally {
        setLoadingDetails(false)
      }
    },
    [awsContext, pushToast, selectedBucket],
  )

  const loadBucketDetails = useCallback(async () => {
    if (!selectedBucket) return
    setLoadingDetails(true)
    setBucketPermissions(undefined)
    try {
      const permissions = await getBucketPermissions({ ...awsContext, bucket: selectedBucket })
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
      pushToast('error', `Bucket details failed: ${errorText(error)}`)
    } finally {
      setLoadingDetails(false)
    }
  }, [awsContext, pushToast, selectedBucket])

  const loadFolderDetails = useCallback(
    async (entry: S3Entry) => {
      if (!selectedBucket || entry.kind !== 'folder') return
      setLoadingDetails(true)
      setFolderPermissions(undefined)
      try {
        const permissions = await getPrefixPermissions({ ...awsContext, bucket: selectedBucket, prefix: entry.key })
        setFolderPermissions(permissions)
      } catch (error) {
        pushToast('error', `Folder details failed: ${errorText(error)}`)
      } finally {
        setLoadingDetails(false)
      }
    },
    [awsContext, pushToast, selectedBucket],
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
  }, [prefix, reloadObjectList])

  useEffect(() => {
    if (!selectedBucket) return
    if (!selectedEntry) {
      void loadBucketDetails()
      return
    }
    if (selectedEntry.kind === 'folder') {
      void loadFolderDetails(selectedEntry)
    }
  }, [loadBucketDetails, loadFolderDetails, selectedBucket, selectedEntry])

  useEffect(() => {
    if (selectedObject?.kind === 'object') {
      void loadObjectDetails(selectedObject)
    }
  }, [loadObjectDetails, selectedObject])

  useEffect(() => {
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

  function chooseProfile(profileName: string) {
    const profile = profiles.find((item) => item.name === profileName)
    window.localStorage.setItem(LAST_PROFILE_KEY, profileName)
    setSelectedProfile(profileName)
    setRegion(profile?.region || region || DEFAULT_REGION)
    setSelectedBucket('')
    setPrefix('')
    setObjects([])
    clearBucketDetails()
    clearSelection()
  }

  function chooseBucket(bucketName: string) {
    setSelectedBucket(bucketName)
    setPrefix('')
    setObjects([])
    setNextToken(undefined)
    clearBucketDetails()
    clearSelection()
  }

  function navigateToPrefix(nextPrefix: string) {
    setPrefix(nextPrefix)
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
      setBusy('Deleting folder')
      try {
        const result = await deletePrefix({
          ...awsContext,
          bucket: selectedBucket,
          prefix: entry.key,
        })
        pushToast('success', `Deleted ${result.deleted} object${result.deleted === 1 ? '' : 's'}`)
        clearSelection()
        await reloadObjectList()
      } catch (error) {
        pushToast('error', `Folder delete failed: ${errorText(error)}`)
      } finally {
        setBusy(undefined)
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
    setBusy(`Deleting ${entries.length} selected items`)
    try {
      const result = await deleteEntries({
        ...awsContext,
        bucket: selectedBucket,
        entries: entrySelections(entries),
      })
      pushToast('success', `Deleted ${result.deleted} object${result.deleted === 1 ? '' : 's'}`)
      clearSelection()
      await reloadObjectList()
    } catch (error) {
      pushToast('error', `Bulk delete failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
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

  async function applyBucketAcl() {
    if (!selectedBucket) return
    const confirmed = await confirm(`Apply ${bucketAclDraft} to ${selectedBucket}?`, {
      title: 'Bucket ACL',
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Updating bucket ACL')
    try {
      const result = await setBucketCannedAcl({ ...awsContext, bucket: selectedBucket, acl: bucketAclDraft })
      pushToast('success', result.message)
      await loadBucketDetails()
    } catch (error) {
      pushToast('error', `Bucket ACL update failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function applyObjectAcl() {
    if (!selectedBucket || !selectedObject) return
    const confirmed = await confirm(`Apply ${objectAclDraft} to ${selectedObject.key}?`, {
      title: 'Object ACL',
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Updating object ACL')
    try {
      const result = await setObjectCannedAcl({ ...awsContext, bucket: selectedBucket, key: selectedObject.key, acl: objectAclDraft })
      pushToast('success', result.message)
      await loadObjectDetails(selectedObject)
    } catch (error) {
      pushToast('error', `Object ACL update failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function applyFolderAcl() {
    if (!selectedBucket || selectedEntry?.kind !== 'folder') return
    const confirmed = await confirm(`Apply ${folderAclDraft} to every object under ${selectedEntry.key}?`, {
      title: 'Folder ACL',
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy('Updating folder ACLs')
    try {
      const result = await setPrefixCannedAcl({ ...awsContext, bucket: selectedBucket, prefix: selectedEntry.key, acl: folderAclDraft })
      pushToast('success', `Updated ${result.updated} object${result.updated === 1 ? '' : 's'}`)
      await loadFolderDetails(selectedEntry)
    } catch (error) {
      pushToast('error', `Folder ACL update failed: ${errorText(error)}`)
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
    const confirmed = await confirm(`Create a CloudFront invalidation for ${path}?`, {
      title: link.id,
      kind: 'warning',
    })
    if (!confirmed) return
    setBusy(`Invalidating ${link.id}`)
    try {
      const result = await createInvalidation({
        profile: awsContext.profile,
        distributionId: link.id,
        paths: [path],
      })
      pushToast('success', `Invalidation ${result.invalidation_id || ''} queued for ${link.id}`.trim())
    } catch (error) {
      pushToast('error', `Invalidation failed: ${errorText(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader
        profiles={profiles}
        selectedProfile={selectedProfile}
        region={region}
        onProfileChange={chooseProfile}
        onRegionChange={setRegion}
        onRefreshBuckets={loadBucketList}
      />

      <main className="workspace">
        <BucketPane
          buckets={buckets}
          filteredBuckets={filteredBuckets}
          bucketFilter={bucketFilter}
          selectedBucket={selectedBucket}
          onFilterChange={setBucketFilter}
          onChooseBucket={chooseBucket}
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

        <DetailsPane
          selectedBucket={selectedBucket}
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
          bucketAcl={bucketAclDraft}
          folderAcl={folderAclDraft}
          objectAcl={objectAclDraft}
          bucketPolicyDraft={bucketPolicyDraft}
          publicAccessBlockDraft={publicAccessBlockDraft}
          loadingDetails={loadingDetails}
          busy={busy}
          onBucketAclChange={setBucketAclDraft}
          onFolderAclChange={setFolderAclDraft}
          onObjectAclChange={setObjectAclDraft}
          onApplyBucketAcl={applyBucketAcl}
          onApplyFolderAcl={applyFolderAcl}
          onApplyObjectAcl={applyObjectAcl}
          onBucketPolicyChange={setBucketPolicyDraft}
          onSaveBucketPolicy={saveBucketPolicy}
          onDeleteBucketPolicy={removeBucketPolicy}
          onPublicAccessBlockChange={setPublicAccessBlockDraft}
          onSavePublicAccessBlock={savePublicAccessBlock}
          onPathOverride={(distributionId, value) => setPathOverrides((current) => ({ ...current, [distributionId]: value }))}
          onInvalidate={handleInvalidate}
        />
      </main>

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
          <span>{busy}</span>
        </div>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default App
