import type { ObjectPreview } from '../types'

export const DEFAULT_REGION = 'us-east-1'
export const PREVIEW_LIMIT = 1024 * 1024

export function formatBytes(size?: number) {
  if (size === undefined) return '-'
  if (size === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

export function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function fileNameFromKey(key: string) {
  const parts = key.split('/').filter(Boolean)
  return parts.at(-1) || key
}

export function objectParentPrefix(key: string) {
  const index = key.lastIndexOf('/')
  return index >= 0 ? key.slice(0, index + 1) : ''
}

export function parentPrefix(prefix: string) {
  const parts = prefix.split('/').filter(Boolean)
  parts.pop()
  return parts.length > 0 ? `${parts.join('/')}/` : ''
}

export function buildBreadcrumbs(prefix: string) {
  const parts = prefix.split('/').filter(Boolean)
  let current = ''
  return parts.map((part) => {
    current += `${part}/`
    return { label: part, prefix: current }
  })
}

export function isImagePreview(preview?: ObjectPreview) {
  const contentType = preview?.content_type || ''
  return contentType.startsWith('image/') && preview?.encoding === 'base64'
}

export function isPdfPreview(preview?: ObjectPreview) {
  return preview?.content_type === 'application/pdf' && preview.encoding === 'base64'
}

export function isTextPreview(preview?: ObjectPreview) {
  return preview?.encoding === 'text'
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function currentFolderLabel(prefix: string) {
  return prefix || '/'
}
