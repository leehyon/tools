import type { Tool } from './types'

export function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
}

export function normalizeTool(raw: unknown): Tool | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.name !== 'string' || typeof obj.url !== 'string') return null
  const platform = normalizeArray(obj.Platform ?? obj.platform)
  const tags = normalizeArray(obj.tags)
  const categories = normalizeArray(obj.categories)

  return {
    month: typeof obj.month === 'string' ? obj.month : undefined,
    timestamp: typeof obj.timestamp === 'number' ? obj.timestamp : undefined,
    name: obj.name,
    url: obj.url,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    tags,
    categories,
    Platform: platform
  }
}

export function uniq(items: string[]): string[] {
  const set = new Set<string>()
  for (const item of items) set.add(item)
  return [...set]
}

export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString()
    return ''
  } catch {
    return ''
  }
}

export function toolMatchesKeyword(tool: Tool, keyword: string): boolean {
  if (!keyword) return true
  const haystackParts: string[] = []
  haystackParts.push(tool.name)
  if (tool.description) haystackParts.push(tool.description)
  if (tool.tags?.length) haystackParts.push(tool.tags.join(' '))
  if (tool.categories?.length) haystackParts.push(tool.categories.join(' '))
  if (tool.Platform?.length) haystackParts.push(tool.Platform.join(' '))
  const haystack = haystackParts.join(' ').toLowerCase()
  return haystack.includes(keyword.toLowerCase())
}

export function monthLabel(yyyymm: string): string {
  if (!/^\d{6}$/.test(yyyymm)) return yyyymm
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function weekStartIsoFromTimestampSeconds(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000)
  if (Number.isNaN(date.getTime())) return 'unknown'
  // Make it the Monday of the same week.
  const day = date.getDay() // 0(Sun)..6(Sat)
  const diffToMonday = (day + 6) % 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - diffToMonday)
  monday.setHours(0, 0, 0, 0)
  return `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`
}

export function shortDateLabel(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(5)
  return iso
}
