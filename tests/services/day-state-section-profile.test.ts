import { TFile } from 'obsidian'
import DayStatePersistenceService from '../../src/services/DayStatePersistenceService'
import DayStateStoreService from '../../src/services/DayStateStoreService'
import type { DayState, TaskChutePluginLike } from '../../src/types'

const date = new Date(2026, 1, 19)
const statePath = 'LOGS/2026-02-state.json'

function createFile(path: string): TFile {
  const file = new TFile()
  file.path = path
  Object.setPrototypeOf(file, TFile.prototype)
  return file
}

function emptyState(overrides: Partial<DayState> = {}): DayState {
  return {
    hiddenRoutines: [],
    deletedInstances: [],
    duplicatedInstances: [],
    slotOverrides: {},
    orders: {},
    ...overrides,
  }
}

function createPlugin(customSections = [
  { hour: 0, minute: 0 },
  { hour: 8, minute: 0 },
  { hour: 12, minute: 0 },
  { hour: 16, minute: 0 },
]) {
  const store = new Map<string, string>()
  const vault = {
    getAbstractFileByPath: jest.fn((path: string) => (
      store.has(path) ? createFile(path) : null
    )),
    read: jest.fn(async (file: TFile) => store.get(file.path) ?? ''),
    create: jest.fn(async (path: string, content: string) => {
      store.set(path, content)
      return createFile(path)
    }),
    modify: jest.fn(async (file: TFile, content: string) => {
      store.set(file.path, content)
    }),
  }
  const pathManager = {
    getTaskFolderPath: () => 'TASKS',
    getProjectFolderPath: () => null,
    getLogDataPath: () => 'LOGS',
    getReviewDataPath: () => 'REVIEWS',
    ensureFolderExists: jest.fn().mockResolvedValue(undefined),
    getLogYearPath: (year: string | number) => `LOGS/${year}`,
    ensureYearFolder: jest.fn().mockResolvedValue(undefined),
    validatePath: jest.fn(() => ({ valid: true })),
  }
  const plugin = {
    app: { vault },
    settings: { customSections, useOrderBasedSort: true, slotKeys: {} },
    pathManager,
    routineAliasService: { loadAliases: jest.fn().mockResolvedValue({}) },
    dayStateService: {},
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as TaskChutePluginLike
  return { plugin, store, vault }
}

describe('DayStatePersistenceService section profiles', () => {
  it('normalizes and clones a day profile while saving and loading', async () => {
    const { plugin } = createPlugin()
    const service = new DayStatePersistenceService(plugin)
    const profile = {
      id: ' holiday ',
      name: ' Holiday ',
      boundaries: [
        { hour: 0, minute: 0, label: ' Sleep ' },
        { hour: 10, minute: 0, label: 'Day' },
      ],
      updatedAt: 10,
    }

    await service.saveDay(date, emptyState({ sectionProfile: profile }))
    profile.boundaries[0].hour = 6
    profile.boundaries[0].label = 'Changed'
    const loaded = await service.loadDay(date)

    expect(loaded.sectionProfile).toEqual({
      id: 'holiday',
      name: 'Holiday',
      boundaries: [
        { hour: 0, minute: 0, label: 'Sleep' },
        { hour: 10, minute: 0, label: 'Day' },
      ],
      updatedAt: 10,
    })
    const loadedProfile = loaded.sectionProfile
    if (!loadedProfile) throw new Error('Expected a normalized section profile')
    loadedProfile.boundaries[1].hour = 18
    expect((await service.loadDay(date)).sectionProfile?.boundaries[1]?.hour).toBe(10)
  })

  it('writes when only the day profile changes', async () => {
    const { plugin, vault } = createPlugin()
    const service = new DayStatePersistenceService(plugin)
    const base = emptyState({
      sectionProfile: {
        id: 'weekday',
        name: 'Weekday',
        boundaries: [{ hour: 0, minute: 0 }, { hour: 8, minute: 0 }],
        updatedAt: 100,
      },
    })

    await service.saveDay(date, base)
    const writesAfterFirstSave = vault.create.mock.calls.length + vault.modify.mock.calls.length
    await service.saveDay(date, {
      ...base,
      sectionProfile: { ...base.sectionProfile!, updatedAt: 200, name: 'New weekday' },
    })

    expect(vault.create.mock.calls.length + vault.modify.mock.calls.length)
      .toBe(writesAfterFirstSave + 1)
    expect((await service.loadDay(date)).sectionProfile?.name).toBe('New weekday')
  })

  it('merges the newer remote profile without dropping profile-specific orders', async () => {
    const { plugin, store } = createPlugin()
    const service = new DayStatePersistenceService(plugin)
    const localProfile = {
      id: 'weekday',
      name: 'Weekday',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 8, minute: 0 }, { hour: 12, minute: 0 }],
      updatedAt: 100,
    }
    const remoteProfile = {
      id: 'holiday',
      name: 'Holiday',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 10, minute: 0 }, { hour: 18, minute: 0 }],
      updatedAt: 200,
    }
    const month = (profile: typeof localProfile, orders: Record<string, number>) => ({
      days: {
        '2026-02-19': emptyState({ sectionProfile: profile, orders }),
      },
      metadata: { version: '1.0', lastUpdated: '2026-02-19T00:00:00.000Z' },
    })

    store.set(statePath, JSON.stringify(month(localProfile, { 'task::8:00-12:00': 1 })))
    await service.loadDay(date)
    store.set(statePath, JSON.stringify(month(remoteProfile, { 'task::10:00-18:00': 2 })))

    const result = await service.mergeExternalChange('2026-02')
    const merged = result.merged?.days['2026-02-19']
    expect(merged?.sectionProfile?.id).toBe('holiday')
    expect(result.affectedDateKeys).toContain('2026-02-19')
    expect(merged?.orders).toEqual({
      'task::8:00-12:00': 1,
      'task::10:00-18:00': 2,
    })
  })

  it('uses each day profile when merging a month and keeps both boundary order keys', async () => {
    const { plugin, store } = createPlugin()
    const service = new DayStatePersistenceService(plugin)
    const localProfile = {
      id: 'weekday',
      name: 'Weekday',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 8, minute: 0 }, { hour: 12, minute: 0 }],
      updatedAt: 100,
    }
    const remoteProfile = {
      id: 'holiday',
      name: 'Holiday',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 10, minute: 0 }, { hour: 18, minute: 0 }],
      updatedAt: 200,
    }
    store.set(statePath, JSON.stringify({
      days: {
        '2026-02-19': emptyState({
          sectionProfile: remoteProfile,
          orders: { 'task::10:00-18:00': 2 },
        }),
      },
      metadata: { version: '1.0', lastUpdated: '2026-02-19T00:00:00.000Z' },
    }))

    await service.mergeAndSaveMonth('2026-02', new Map([
      ['2026-02-19', emptyState({
        sectionProfile: localProfile,
        orders: { 'task::8:00-12:00': 1 },
      })],
    ]))

    const saved = JSON.parse(store.get(statePath)!) as {
      days: Record<string, DayState>
    }
    expect(saved.days['2026-02-19']?.sectionProfile?.id).toBe('holiday')
    expect(saved.days['2026-02-19']?.orders).toEqual({
      'task::10:00-18:00': 2,
      'task::8:00-12:00': 1,
    })
  })
})

describe('DayStateStoreService section profiles', () => {
  it('normalizes a loaded profile and persists a copied snapshot', async () => {
    const loadedState = emptyState({
      sectionProfile: {
        id: 'holiday',
        name: 'Holiday',
        boundaries: [
          { hour: 0, minute: 0, label: 'Sleep' },
          { hour: 10, minute: 0, label: 'Day' },
        ],
        updatedAt: 1,
      },
    })
    const savedStates: DayState[] = []
    const dayStateService = {
      loadDay: jest.fn(async () => JSON.parse(JSON.stringify(loadedState)) as DayState),
      saveDay: jest.fn(async (_date: Date, state: DayState) => {
        savedStates.push(JSON.parse(JSON.stringify(state)) as DayState)
      }),
      updateDay: jest.fn(async (
        _date: Date,
        mutator: (state: DayState) => DayState | void,
      ) => {
        const next = JSON.parse(JSON.stringify(loadedState)) as DayState
        return JSON.parse(JSON.stringify(mutator(next) ?? next)) as DayState
      }),
      mergeDayState: jest.fn(),
      clearCache: jest.fn(),
      getDateFromKey: jest.fn(),
      renameTaskPath: jest.fn().mockResolvedValue(undefined),
    }
    const manager = new DayStateStoreService({
      dayStateService,
      getCurrentDateString: () => '2026-02-19',
      parseDateString: (key: string) => {
        const [year, month, day] = key.split('-').map(Number)
        return new Date(year, month - 1, day)
      },
    })

    const state = await manager.ensure()
    expect(state.sectionProfile).toEqual(loadedState.sectionProfile)
    await manager.persist()
    expect(savedStates[0]?.sectionProfile).toEqual(loadedState.sectionProfile)
    expect(savedStates[0]?.sectionProfile).not.toBe(loadedState.sectionProfile)
  })
})
