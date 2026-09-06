import { TFile, normalizePath } from 'obsidian'
import { t } from '../i18n'
import type {
  DaySectionProfile,
  SectionBoundary,
  SectionProfile,
  TaskChutePluginLike,
  WeekdaySectionAssignments,
} from '../types'
import { SectionConfigService } from './SectionConfigService'

export type {
  DaySectionProfile,
  SectionProfile,
  WeekdaySectionAssignments,
} from '../types'

const SECTION_PROFILES_VERSION = 1

function cloneBoundaries(boundaries: SectionBoundary[]): SectionBoundary[] {
  return boundaries.map((boundary) => ({
    hour: boundary.hour,
    minute: boundary.minute,
    ...(boundary.label ? { label: boundary.label } : {}),
  }))
}

function normalizeSectionProfile(value: unknown): SectionProfile | undefined {
  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!id || !name) return undefined

  const boundaries = SectionConfigService.sanitizeBoundaries(record.boundaries)
  if (!boundaries) return undefined

  return {
    id,
    name,
    boundaries: cloneBoundaries(boundaries),
  }
}

function cloneProfile(profile: SectionProfile): SectionProfile {
  return {
    id: profile.id,
    name: profile.name,
    boundaries: cloneBoundaries(profile.boundaries),
  }
}

function cloneDayProfile(profile: DaySectionProfile): DaySectionProfile {
  return {
    ...cloneProfile(profile),
    updatedAt: profile.updatedAt,
  }
}

export function normalizeDaySectionProfile(value: unknown): DaySectionProfile | undefined {
  const profile = normalizeSectionProfile(value)
  if (!profile) return undefined

  const updatedAt = (value as { updatedAt?: unknown }).updatedAt
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    return undefined
  }

  return {
    ...profile,
    updatedAt,
  }
}

export function mergeDaySectionProfile(
  local: unknown,
  remote: unknown,
): DaySectionProfile | undefined {
  const localProfile = normalizeDaySectionProfile(local)
  const remoteProfile = normalizeDaySectionProfile(remote)

  if (!localProfile) return remoteProfile ? cloneDayProfile(remoteProfile) : undefined
  if (!remoteProfile) return cloneDayProfile(localProfile)

  if (remoteProfile.updatedAt !== localProfile.updatedAt) {
    return cloneDayProfile(
      remoteProfile.updatedAt > localProfile.updatedAt ? remoteProfile : localProfile,
    )
  }

  // Equal timestamps use a canonical serialized representation so both
  // devices reach the same result regardless of merge argument order.
  const localKey = JSON.stringify(localProfile)
  const remoteKey = JSON.stringify(remoteProfile)
  return cloneDayProfile(localKey <= remoteKey ? localProfile : remoteProfile)
}

interface StoredSectionProfiles {
  version: number
  profiles: unknown
  weekdayAssignments?: unknown
}

interface ParsedSectionProfiles {
  profiles: SectionProfile[]
  weekdayAssignments?: WeekdaySectionAssignments
}

export class SectionProfileService {
  constructor(
    private readonly plugin: Pick<TaskChutePluginLike, 'app' | 'settings' | 'pathManager'>,
  ) {}

  async list(): Promise<SectionProfile[]> {
    const stored = await this.readStoredDocument()
    return stored ? stored.profiles.map(cloneProfile) : this.createDefaultProfiles()
  }

  async save(profile: SectionProfile): Promise<void> {
    const normalized = normalizeSectionProfile(profile)
    if (!normalized) {
      throw new Error('Invalid section profile')
    }

    const stored = await this.readStoredDocument()
    const profiles = stored ? stored.profiles.map(cloneProfile) : this.createDefaultProfiles()
    const existingIndex = profiles.findIndex((entry) => entry.id === normalized.id)
    if (existingIndex >= 0) {
      profiles[existingIndex] = cloneProfile(normalized)
    } else {
      profiles.push(cloneProfile(normalized))
    }

    await this.writeDocument(profiles, stored?.weekdayAssignments)
  }

  async getWeekdayAssignments(): Promise<WeekdaySectionAssignments | null> {
    const stored = await this.readStoredDocument()
    return stored?.weekdayAssignments ? cloneAssignments(stored.weekdayAssignments) : null
  }

  async saveWeekdayAssignments(assignments: WeekdaySectionAssignments): Promise<void> {
    const normalizedAssignments = normalizeWeekdayAssignments(assignments)
    if (!normalizedAssignments) {
      throw new Error('Invalid weekday section assignments')
    }

    const stored = await this.readStoredDocument()
    const profiles = stored ? stored.profiles.map(cloneProfile) : this.createDefaultProfiles()
    const profileIds = new Set(profiles.map((profile) => profile.id))
    if (normalizedAssignments.some((id) => id !== null && !profileIds.has(id))) {
      throw new Error('Invalid weekday section assignment profile id')
    }

    await this.writeDocument(profiles, normalizedAssignments)
  }

  async getProfileForDate(dateKey: string): Promise<SectionProfile | undefined> {
    const date = this.parseLocalDateKey(dateKey)
    if (!date) return undefined

    const stored = await this.readStoredDocument()
    if (!stored?.weekdayAssignments) return undefined
    const profileId = stored.weekdayAssignments[date.getDay()]
    if (!profileId) return undefined
    const profile = stored.profiles.find((entry) => entry.id === profileId)
    return profile ? cloneProfile(profile) : undefined
  }

  private async writeDocument(
    profiles: SectionProfile[],
    weekdayAssignments?: WeekdaySectionAssignments,
  ): Promise<void> {
    const path = this.getSectionProfilesPath()
    const parentPath = path.slice(0, path.lastIndexOf('/'))
    if (parentPath) {
      await this.plugin.pathManager.ensureFolderExists(parentPath)
    }

    const document: {
      version: number
      profiles: SectionProfile[]
      weekdayAssignments?: WeekdaySectionAssignments
    } = {
      version: SECTION_PROFILES_VERSION,
      profiles: profiles.map(cloneProfile),
    }
    if (weekdayAssignments) {
      document.weekdayAssignments = cloneAssignments(weekdayAssignments)
    }
    const payload = JSON.stringify(document, null, 2)
    const existing = this.plugin.app.vault.getAbstractFileByPath(path)
    if (existing) {
      if (!(existing instanceof TFile)) {
        throw new Error(`Section profiles path is not a file: ${path}`)
      }
      await this.plugin.app.vault.modify(existing, payload)
      return
    }
    await this.plugin.app.vault.create(path, payload)
  }

  private getSectionProfilesPath(): string {
    const configured = this.plugin.pathManager.getSectionProfilesPath
    if (typeof configured === 'function') {
      const configuredPath = this.plugin.pathManager.getSectionProfilesPath!()
      if (typeof configuredPath === 'string' && configuredPath.trim().length > 0) {
        return configuredPath
      }
    }

    const logPath = normalizePath(this.plugin.pathManager.getLogDataPath()).replace(/\/+$/, '')
    const parentPath = logPath.includes('/')
      ? logPath.slice(0, logPath.lastIndexOf('/'))
      : ''
    return normalizePath([parentPath, 'Config', 'section-profiles.json']
      .filter((part) => part.length > 0)
      .join('/'))
  }

  private async readStoredDocument(): Promise<ParsedSectionProfiles | null> {
    const path = this.getSectionProfilesPath()
    const existing = this.plugin.app.vault.getAbstractFileByPath(path)
    if (!existing) return null
    if (!(existing instanceof TFile)) {
      throw new Error(`Section profiles path is not a file: ${path}`)
    }

    const raw = await this.plugin.app.vault.read(existing)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error('Invalid section profiles JSON', { cause: error })
    }
    return this.parseStoredProfiles(parsed)
  }

  private parseStoredProfiles(value: unknown): ParsedSectionProfiles {
    if (!value || typeof value !== 'object') {
      throw new Error('Invalid section profiles schema')
    }
    const record = value as StoredSectionProfiles
    if (record.version !== SECTION_PROFILES_VERSION || !Array.isArray(record.profiles)) {
      throw new Error('Invalid section profiles schema')
    }

    const ids = new Set<string>()
    const profiles: SectionProfile[] = []
    for (const entry of record.profiles) {
      const profile = normalizeSectionProfile(entry)
      if (!profile || ids.has(profile.id)) {
        throw new Error('Invalid section profiles schema')
      }
      ids.add(profile.id)
      profiles.push(profile)
    }
    const weekdayAssignments = normalizeWeekdayAssignments(record.weekdayAssignments)
    if (
      record.weekdayAssignments !== undefined
      && record.weekdayAssignments !== null
      && !weekdayAssignments
    ) {
      throw new Error('Invalid weekday section assignments schema')
    }
    if (weekdayAssignments) {
      const profileIds = new Set(profiles.map((profile) => profile.id))
      if (weekdayAssignments.some((id) => id !== null && !profileIds.has(id))) {
        throw new Error('Invalid weekday section assignments schema')
      }
    }

    return {
      profiles,
      ...(weekdayAssignments ? { weekdayAssignments } : {}),
    }
  }

  private parseLocalDateKey(dateKey: string): Date | undefined {
    if (typeof dateKey !== 'string') return undefined
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
    if (!match) return undefined

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day)
    if (
      date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) {
      return undefined
    }
    return date
  }

  private createDefaultProfiles(): SectionProfile[] {
    const boundaries = SectionConfigService.sanitizeBoundaries(this.plugin.settings.customSections)
      ?? SectionConfigService.DEFAULT_BOUNDARIES
    return [
      {
        id: 'weekday',
        name: t('sectionProfiles.weekday', 'Weekday'),
        boundaries: cloneBoundaries(boundaries),
      },
      {
        id: 'holiday',
        name: t('sectionProfiles.holiday', 'Holiday'),
        boundaries: cloneBoundaries(boundaries),
      },
    ]
  }
}

function normalizeWeekdayAssignments(value: unknown): WeekdaySectionAssignments | undefined {
  if (!Array.isArray(value) || value.length !== 7) return undefined
  const assignments: Array<string | null | undefined> = []
  for (let index = 0; index < 7; index += 1) {
    const entry: unknown = value[index]
    if (entry === null) {
      assignments.push(null)
      continue
    }
    if (typeof entry !== 'string') {
      assignments.push(undefined)
      continue
    }
    const normalized = entry.trim()
    assignments.push(normalized.length > 0 ? normalized : undefined)
  }
  if (assignments.some((entry) => entry === undefined)) return undefined
  return assignments as WeekdaySectionAssignments
}

function cloneAssignments(assignments: WeekdaySectionAssignments): WeekdaySectionAssignments {
  return [...assignments] as WeekdaySectionAssignments
}

export default SectionProfileService
