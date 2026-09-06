import { TFile } from 'obsidian'
import SectionProfileService, {
  mergeDaySectionProfile,
  normalizeDaySectionProfile,
} from '../../src/services/SectionProfileService'
import { PathService } from '../../src/services/PathService'
import type {
  SectionProfile,
  TaskChutePluginLike,
  WeekdaySectionAssignments,
} from '../../src/types'

type VaultStore = Map<string, string>

function createFile(path: string): TFile {
  const file = new TFile()
  file.path = path
  Object.setPrototypeOf(file, TFile.prototype)
  return file
}

function createPlugin(customSections?: SectionProfile['boundaries']) {
  const store: VaultStore = new Map()
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
    createFolder: jest.fn(async () => undefined),
  }
  const pathManager = {
    getTaskFolderPath: () => 'TaskChute/Task',
    getProjectFolderPath: () => null,
    getLogDataPath: () => 'TaskChute/Log',
    getReviewDataPath: () => 'TaskChute/Review',
    ensureFolderExists: jest.fn().mockResolvedValue(undefined),
    getLogYearPath: (year: string | number) => `TaskChute/Log/${year}`,
    ensureYearFolder: jest.fn().mockResolvedValue(undefined),
    validatePath: jest.fn(() => ({ valid: true })),
  }
  const plugin = {
    app: { vault },
    settings: {
      customSections,
      useOrderBasedSort: true,
      slotKeys: {},
    },
    pathManager,
    routineAliasService: { loadAliases: jest.fn().mockResolvedValue({}) },
    dayStateService: {},
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as TaskChutePluginLike
  return { plugin, store, vault, pathManager }
}

const boundaries = [
  { hour: 0, minute: 0 },
  { hour: 8, minute: 0 },
  { hour: 12, minute: 0 },
]

describe('SectionProfileService', () => {
  it('lists copied weekday and holiday defaults without creating a file', async () => {
    const customSections = boundaries.map((boundary) => ({ ...boundary }))
    const { plugin, vault } = createPlugin(customSections)
    const service = new SectionProfileService(plugin)

    const profiles = await service.list()

    expect(profiles.map((profile) => profile.id)).toEqual(['weekday', 'holiday'])
    expect(profiles[0]?.boundaries).toEqual(customSections)
    expect(profiles[0]?.boundaries).not.toBe(customSections)
    expect(vault.create).not.toHaveBeenCalled()

    profiles[0].boundaries[0].hour = 6
    const freshProfiles = await service.list()
    expect(freshProfiles[0]?.boundaries[0]?.hour).toBe(0)
  })

  it('preserves sanitized labels in default catalog profiles', async () => {
    const customSections = [
      { hour: 0, minute: 0, label: '  Sleep  ' },
      { hour: 8, minute: 0, label: 'Work' },
      { hour: 12, minute: 0 },
    ]
    const { plugin } = createPlugin(customSections)
    const service = new SectionProfileService(plugin)

    const profiles = await service.list()

    expect(profiles[0]?.boundaries).toEqual([
      { hour: 0, minute: 0, label: 'Sleep' },
      { hour: 8, minute: 0, label: 'Work' },
      { hour: 12, minute: 0 },
    ])
    expect(profiles[1]?.boundaries).toEqual(profiles[0]?.boundaries)
    expect(profiles[1]?.boundaries).not.toBe(profiles[0]?.boundaries)
  })

  it('keeps legacy unlabeled profile JSON valid', async () => {
    const { plugin, store } = createPlugin()
    store.set('TaskChute/Config/section-profiles.json', JSON.stringify({
      version: 1,
      profiles: [{
        id: 'weekday',
        name: 'Weekday',
        boundaries: [
          { hour: 0, minute: 0 },
          { hour: 8, minute: 0 },
        ],
      }],
    }))
    const service = new SectionProfileService(plugin)

    await expect(service.list()).resolves.toEqual([{
      id: 'weekday',
      name: 'Weekday',
      boundaries: [
        { hour: 0, minute: 0 },
        { hour: 8, minute: 0 },
      ],
    }])
    await expect(service.getWeekdayAssignments()).resolves.toBeNull()
  })

  it('trims and clones labels when saving and listing a profile', async () => {
    const { plugin } = createPlugin()
    const service = new SectionProfileService(plugin)
    const profile = {
      id: 'weekday',
      name: 'Workday',
      boundaries: [
        { hour: 0, minute: 0, label: '  Sleep  ' },
        { hour: 8, minute: 0, label: 'Work' },
      ],
    }

    await service.save(profile)
    profile.boundaries[0].label = 'Changed'

    const listed = await service.list()
    expect(listed.find((entry) => entry.id === 'weekday')?.boundaries).toEqual([
      { hour: 0, minute: 0, label: 'Sleep' },
      { hour: 8, minute: 0, label: 'Work' },
    ])
    listed[0].boundaries[0].label = 'Mutated'
    expect((await service.list()).find((entry) => entry.id === 'weekday')?.boundaries[0]?.label)
      .toBe('Sleep')
  })

  it('saves a profile under Config and replaces only the matching id', async () => {
    const { plugin, store, vault } = createPlugin()
    const service = new SectionProfileService(plugin)
    const profile = { id: 'weekday', name: 'Workday', boundaries }

    await service.save(profile)

    expect(store.has('TaskChute/Config/section-profiles.json')).toBe(true)
    const firstPayload = JSON.parse(store.get('TaskChute/Config/section-profiles.json')!) as {
      version: number
      profiles: SectionProfile[]
    }
    expect(firstPayload.version).toBe(1)
    expect(firstPayload.profiles.find((entry) => entry.id === 'weekday')).toEqual(profile)
    expect(firstPayload.profiles.map((entry) => entry.id)).toEqual(['weekday', 'holiday'])

    await service.save({
      id: 'weekday',
      name: 'Updated workday',
      boundaries: [
        { hour: 0, minute: 0 },
        { hour: 9, minute: 0 },
      ],
    })
    const secondPayload = JSON.parse(store.get('TaskChute/Config/section-profiles.json')!) as {
      profiles: SectionProfile[]
    }
    expect(secondPayload.profiles).toHaveLength(2)
    expect(secondPayload.profiles.find((entry) => entry.id === 'weekday')).toEqual({
      id: 'weekday',
      name: 'Updated workday',
      boundaries: [
        { hour: 0, minute: 0 },
        { hour: 9, minute: 0 },
      ],
    })
    expect(vault.modify).toHaveBeenCalledTimes(1)
  })

  it('calls the configured PathService method with its receiver intact', async () => {
    const { plugin, store } = createPlugin()
    const pathService = new PathService(
      { settings: plugin.settings, app: plugin.app } as ConstructorParameters<typeof PathService>[0],
    )
    plugin.pathManager = pathService
    const service = new SectionProfileService(plugin)

    await service.save({ id: 'weekday', name: 'Workday', boundaries })

    expect(store.has('TaskChute/Config/section-profiles.json')).toBe(true)
  })

  it('saves and reloads seven weekday assignments while retaining the default catalog', async () => {
    const { plugin, store, vault } = createPlugin()
    const service = new SectionProfileService(plugin)
    const assignments: WeekdaySectionAssignments = [
      'holiday',
      'weekday',
      null,
      'holiday',
      'weekday',
      'holiday',
      'weekday',
    ]

    await expect(service.getWeekdayAssignments()).resolves.toBeNull()
    expect(vault.create).not.toHaveBeenCalled()
    await service.saveWeekdayAssignments(assignments)

    const stored = JSON.parse(store.get('TaskChute/Config/section-profiles.json')!) as {
      profiles: SectionProfile[]
      weekdayAssignments: WeekdaySectionAssignments
    }
    expect(stored.profiles.map((profile) => profile.id)).toEqual(['weekday', 'holiday'])
    expect(stored.weekdayAssignments).toEqual(assignments)

    const loaded = await service.getWeekdayAssignments()
    expect(loaded).toEqual(assignments)
    expect(loaded).not.toBe(assignments)
    loaded![0] = 'weekday'
    expect(await service.getWeekdayAssignments()).toEqual(assignments)
  })

  it('resolves assignments for Sunday through Saturday using local calendar dates', async () => {
    const { plugin } = createPlugin()
    const service = new SectionProfileService(plugin)
    const assignments: WeekdaySectionAssignments = [
      'holiday',
      'weekday',
      null,
      'holiday',
      'weekday',
      'holiday',
      'weekday',
    ]
    await service.saveWeekdayAssignments(assignments)

    const ids = await Promise.all([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ].map(async (dateKey) => (await service.getProfileForDate(dateKey))?.id))
    expect(ids).toEqual([
      'holiday',
      'weekday',
      undefined,
      'holiday',
      'weekday',
      'holiday',
      'weekday',
    ])
  })

  it('rejects malformed calendar dates and preserves profile snapshots when resolving', async () => {
    const { plugin } = createPlugin()
    const service = new SectionProfileService(plugin)
    await service.saveWeekdayAssignments([
      'weekday',
      'weekday',
      'weekday',
      'weekday',
      'weekday',
      'weekday',
      'weekday',
    ])

    const profile = await service.getProfileForDate('2026-09-07')
    expect(profile?.id).toBe('weekday')
    profile!.boundaries[0].hour = 6
    expect((await service.getProfileForDate('2026-09-07'))?.boundaries[0]?.hour).toBe(0)
    await expect(service.getProfileForDate('2026-9-7')).resolves.toBeUndefined()
    await expect(service.getProfileForDate('2026-02-30')).resolves.toBeUndefined()
    await expect(service.getProfileForDate('not-a-date')).resolves.toBeUndefined()
  })

  it('keeps weekday assignments and boundary labels when either side is saved', async () => {
    const { plugin, store } = createPlugin()
    const service = new SectionProfileService(plugin)
    const assignments: WeekdaySectionAssignments = [
      'weekday',
      null,
      'holiday',
      null,
      'weekday',
      null,
      'holiday',
    ]
    await service.saveWeekdayAssignments(assignments)
    await service.save({
      id: 'weekday',
      name: 'Workday',
      boundaries: [
        { hour: 0, minute: 0, label: '  Start  ' },
        { hour: 8, minute: 0, label: 'Work' },
      ],
    })

    let stored = JSON.parse(store.get('TaskChute/Config/section-profiles.json')!) as {
      profiles: SectionProfile[]
      weekdayAssignments: WeekdaySectionAssignments
    }
    expect(stored.weekdayAssignments).toEqual(assignments)
    expect(stored.profiles.find((profile) => profile.id === 'weekday')?.boundaries[0]?.label)
      .toBe('Start')

    await service.saveWeekdayAssignments([
      'holiday',
      'weekday',
      null,
      'holiday',
      'weekday',
      'holiday',
      'weekday',
    ])
    stored = JSON.parse(store.get('TaskChute/Config/section-profiles.json')!) as {
      profiles: SectionProfile[]
      weekdayAssignments: WeekdaySectionAssignments
    }
    expect(stored.weekdayAssignments).toEqual([
      'holiday',
      'weekday',
      null,
      'holiday',
      'weekday',
      'holiday',
      'weekday',
    ])
    expect(stored.profiles.find((profile) => profile.id === 'weekday')?.boundaries[0]?.label)
      .toBe('Start')
  })

  it('rejects assignments with invalid length or unknown profile ids without writing', async () => {
    const { plugin, store, vault } = createPlugin()
    const service = new SectionProfileService(plugin)
    const path = 'TaskChute/Config/section-profiles.json'
    const invalidAssignments = [
      ['weekday', 'weekday'],
      ['weekday', 'missing', null, null, null, null, null],
      ['weekday', 1, null, null, null, null, null],
    ] as unknown[]

    for (const assignments of invalidAssignments) {
      await expect(service.saveWeekdayAssignments(assignments as WeekdaySectionAssignments))
        .rejects.toThrow()
    }
    expect(store.has(path)).toBe(false)
    expect(vault.create).not.toHaveBeenCalled()
  })

  it('throws for malformed files and leaves existing content untouched', async () => {
    const { plugin, store, vault } = createPlugin()
    const path = 'TaskChute/Config/section-profiles.json'
    store.set(path, '{not-json')
    const service = new SectionProfileService(plugin)

    await expect(service.list()).rejects.toThrow()
    await expect(service.save({ id: 'weekday', name: 'Workday', boundaries })).rejects.toThrow()
    expect(store.get(path)).toBe('{not-json')
    expect(vault.modify).not.toHaveBeenCalled()

    store.set(path, JSON.stringify({ version: 2, profiles: [] }))
    await expect(service.list()).rejects.toThrow()
    expect(store.get(path)).toBe(JSON.stringify({ version: 2, profiles: [] }))
  })

  it.each([
    { id: '', name: 'Workday', boundaries },
    { id: 'weekday', name: '  ', boundaries },
    { id: 'weekday', name: 'Workday', boundaries: [{ hour: 1, minute: 0 }, { hour: 2, minute: 0 }] },
    { id: 'weekday', name: 'Workday', boundaries: [{ hour: 0, minute: 0 }, { hour: 8, minute: 0 }, { hour: 8, minute: 0 }] },
  ])('rejects invalid profile input: %#', async (profile) => {
    const { plugin, store, vault } = createPlugin()
    const service = new SectionProfileService(plugin)

    await expect(service.save(profile)).rejects.toThrow()
    expect(store.size).toBe(0)
    expect(vault.create).not.toHaveBeenCalled()
  })
})

describe('day section profile helpers', () => {
  it('normalizes and clones a valid snapshot', () => {
    const input = {
      id: ' holiday ',
      name: ' Holiday ',
      boundaries: [
        { hour: 0, minute: 0, label: ' Sleep ' },
        { hour: 10, minute: 0, label: 'Day' },
      ],
      updatedAt: 10,
    }

    const normalized = normalizeDaySectionProfile(input)

    expect(normalized).toEqual({
      id: 'holiday',
      name: 'Holiday',
      boundaries: [
        { hour: 0, minute: 0, label: 'Sleep' },
        { hour: 10, minute: 0, label: 'Day' },
      ],
      updatedAt: 10,
    })
    expect(normalized).not.toBe(input)
    expect(normalized?.boundaries).not.toBe(input.boundaries)
    input.boundaries[0].hour = 6
    input.boundaries[0].label = 'Changed'
    expect(normalized?.boundaries[0]?.hour).toBe(0)
    expect(normalized?.boundaries[0]?.label).toBe('Sleep')
    expect(normalizeDaySectionProfile({ ...input, updatedAt: Number.NaN })).toBeUndefined()
  })

  it('selects the newer snapshot and uses local on equal timestamps', () => {
    const local = {
      id: 'weekday',
      name: 'Local',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 8, minute: 0 }],
      updatedAt: 100,
    }
    const remote = {
      id: 'weekday',
      name: 'Remote',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 9, minute: 0 }],
      updatedAt: 200,
    }

    expect(mergeDaySectionProfile(local, remote)?.name).toBe('Remote')
    const tied = mergeDaySectionProfile(local, { ...remote, updatedAt: 100 })
    expect(tied?.name).toBe('Local')
    expect(tied?.boundaries).not.toBe(local.boundaries)
    expect(mergeDaySectionProfile({ ...remote, updatedAt: 100 }, local)?.name).toBe('Local')
  })
})
