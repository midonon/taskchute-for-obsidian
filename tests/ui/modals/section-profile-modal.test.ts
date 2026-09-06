import { Notice } from 'obsidian'
import SectionProfileModal from '../../../src/ui/modals/SectionProfileModal'
import type { SectionProfile } from '../../../src/types'

type FakeSectionProfileService = {
  list: jest.Mock<Promise<SectionProfile[]>, []>
  save: jest.Mock<Promise<void>, [SectionProfile]>
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const createService = (profiles: SectionProfile[]): FakeSectionProfileService => ({
  list: jest.fn().mockResolvedValue(profiles),
  save: jest.fn().mockResolvedValue(undefined),
})

const findButton = (modal: SectionProfileModal, className: string): HTMLButtonElement => {
  const button = modal.contentEl.querySelector(`.${className}`)
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${className}`)
  }
  return button
}

const rows = (modal: SectionProfileModal): HTMLTableRowElement[] =>
  Array.from(modal.contentEl.querySelectorAll('tr.section-profile-row'))

const rowInput = (row: HTMLTableRowElement, className: string): HTMLInputElement => {
  const input = row.querySelector(`input.${className}`)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${className}`)
  }
  return input
}

const setInputValue = (input: HTMLInputElement, value: string): void => {
  input.value = value
}

const setRows = (
  modal: SectionProfileModal,
  values: Array<{ time: string; name?: string }>,
): void => {
  expect(rows(modal)).toHaveLength(values.length)
  rows(modal).forEach((row, index) => {
    setInputValue(rowInput(row, 'section-profile-time'), values[index].time)
    setInputValue(rowInput(row, 'section-profile-name'), values[index].name ?? '')
  })
}

const submitForm = (modal: SectionProfileModal): void => {
  const form = modal.contentEl.querySelector('form')
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Missing section profile form')
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

describe('SectionProfileModal', () => {
  const weekday: SectionProfile = {
    id: 'weekday',
    name: 'Weekday',
    boundaries: [
      { hour: 0, minute: 0 },
      { hour: 8, minute: 0 },
      { hour: 12, minute: 0 },
    ],
  }

  const holiday: SectionProfile = {
    id: 'holiday',
    name: 'Holiday',
    boundaries: [
      { hour: 0, minute: 0 },
      { hour: 10, minute: 0 },
      { hour: 18, minute: 0 },
    ],
  }

  const openModal = (
    service: FakeSectionProfileService,
    options: Partial<ConstructorParameters<typeof SectionProfileModal>[1]> = {},
  ): SectionProfileModal => {
    const modal = new SectionProfileModal({} as ConstructorParameters<typeof SectionProfileModal>[0], {
      service: service as never,
      dateKey: '2025-10-09',
      applyProfile: jest.fn().mockResolvedValue(undefined),
      ...options,
    })
    modal.open()
    return modal
  }

  const openManageModal = (service: FakeSectionProfileService): SectionProfileModal => {
    const modal = new SectionProfileModal({} as ConstructorParameters<typeof SectionProfileModal>[0], {
      mode: 'manage',
      service: service as never,
    })
    modal.open()
    return modal
  }

  beforeEach(() => {
    document.body.replaceChildren()
    ;(Notice as unknown as jest.Mock).mockClear()
  })

  test('rejects an empty time without saving and keeps the modal open', async () => {
    const service = createService([weekday])
    const modal = openModal(service)
    await flushPromises()

    const timeInput = rowInput(rows(modal)[1], 'section-profile-time')
    expect(timeInput.type).toBe('time')
    expect(timeInput.step).toBe('60')
    setInputValue(timeInput, '')
    submitForm(modal)
    await flushPromises()

    expect(service.save).not.toHaveBeenCalled()
    expect(Notice).toHaveBeenCalled()
    expect(document.activeElement).toBe(timeInput)
    expect(document.body.contains(modal.containerEl)).toBe(true)
  })

  test('saves sorted time/name pairs without applying, then applies on the explicit action', async () => {
    const service = createService([weekday])
    const applyProfile = jest.fn().mockResolvedValue(undefined)
    const modal = openModal(service, { applyProfile })
    await flushPromises()

    setInputValue(
      modal.contentEl.querySelector('input.section-profile-profile-name') as HTMLInputElement,
      '  Workday  ',
    )
    setRows(modal, [
      { time: '12:00', name: 'Noon' },
      { time: '00:00', name: 'Start' },
      { time: '08:00' },
    ])

    submitForm(modal)
    await flushPromises()

    const expected: SectionProfile = {
      id: 'weekday',
      name: 'Workday',
      boundaries: [
        { hour: 0, minute: 0, label: 'Start' },
        { hour: 8, minute: 0 },
        { hour: 12, minute: 0, label: 'Noon' },
      ],
    }
    expect(service.save).toHaveBeenCalledWith(expected)
    expect(applyProfile).not.toHaveBeenCalled()
    expect(document.body.contains(modal.containerEl)).toBe(true)

    findButton(modal, 'section-profile-apply').click()
    await flushPromises()

    expect(service.save).toHaveBeenCalledTimes(2)
    expect(applyProfile).toHaveBeenCalledWith(expected)
    expect(document.body.contains(modal.containerEl)).toBe(false)
  })

  test('uses the displayed date snapshot before an edited catalog entry', async () => {
    const service = createService([
      {
        ...weekday,
        name: 'Edited catalog weekday',
        boundaries: [
          { hour: 0, minute: 0 },
          { hour: 9, minute: 0 },
          { hour: 17, minute: 0 },
        ],
      },
    ])
    const modal = openModal(service, {
      currentProfile: {
        id: 'weekday',
        name: 'Weekday snapshot',
        boundaries: [
          { hour: 0, minute: 0 },
          { hour: 6, minute: 0 },
          { hour: 18, minute: 0 },
        ],
        updatedAt: 1,
      },
    })
    await flushPromises()

    expect((modal.contentEl.querySelector('select') as HTMLSelectElement).value).toBe('weekday')
    expect((modal.contentEl.querySelector('input.section-profile-profile-name') as HTMLInputElement).value).toBe(
      'Weekday snapshot',
    )
    expect(rows(modal).map((row) => rowInput(row, 'section-profile-time').value)).toEqual([
      '00:00',
      '06:00',
      '18:00',
    ])
    expect(modal.contentEl.textContent).toContain('2025-10-09')
    expect(modal.contentEl.textContent).toContain('Other dates are unchanged')
  })

  test('saves optional section names alongside their sorted start times', async () => {
    const service = createService([weekday])
    const applyProfile = jest.fn().mockResolvedValue(undefined)
    const modal = openModal(service, { applyProfile })
    await flushPromises()

    setRows(modal, [
      { time: '12:00' },
      { time: '00:00', name: '  睡眠  ' },
      { time: '08:00', name: '朝の 支度' },
    ])
    findButton(modal, 'section-profile-apply').click()
    await flushPromises()

    const expected: SectionProfile = {
      ...weekday,
      boundaries: [
        { hour: 0, minute: 0, label: '睡眠' },
        { hour: 8, minute: 0, label: '朝の 支度' },
        { hour: 12, minute: 0 },
      ],
    }
    expect(service.save).toHaveBeenCalledWith(expected)
    expect(applyProfile).toHaveBeenCalledWith(expected)
  })

  test('keeps names when copying a setting and omits a cleared name', async () => {
    const service = createService([{
      ...weekday,
      boundaries: [
        { hour: 0, minute: 0, label: '睡眠' },
        { hour: 8, minute: 0, label: '仕事' },
      ],
    }])
    const modal = openModal(service)
    await flushPromises()

    findButton(modal, 'section-profile-new').click()
    expect(rows(modal)).toHaveLength(2)
    expect(rowInput(rows(modal)[0], 'section-profile-name').value).toBe('睡眠')
    setInputValue(rowInput(rows(modal)[1], 'section-profile-name'), '')
    submitForm(modal)
    await flushPromises()

    const saved = service.save.mock.calls[0][0]
    expect(saved.id).not.toBe(weekday.id)
    expect(saved.boundaries).toEqual([
      { hour: 0, minute: 0, label: '睡眠' },
      { hour: 8, minute: 0 },
    ])
  })

  test('adds an empty row, removes it without saving, and disables removal at two rows', async () => {
    const service = createService([weekday])
    const modal = openModal(service)
    await flushPromises()

    findButton(modal, 'section-profile-add-row').click()
    expect(rows(modal)).toHaveLength(4)
    expect(rowInput(rows(modal)[3], 'section-profile-time')).toBe(document.activeElement)
    expect(rowInput(rows(modal)[3], 'section-profile-name').value).toBe('')

    const addedRowRemove = rows(modal)[3].querySelector('.section-profile-remove-row')
    expect(addedRowRemove).toBeInstanceOf(HTMLButtonElement)
    ;(addedRowRemove as HTMLButtonElement).click()
    expect(rows(modal)).toHaveLength(3)

    ;(rows(modal)[0].querySelector('.section-profile-remove-row') as HTMLButtonElement).click()
    expect(rows(modal)).toHaveLength(2)
    rows(modal).forEach((row) => {
      expect((row.querySelector('.section-profile-remove-row') as HTMLButtonElement).disabled).toBe(true)
    })
    expect(service.save).not.toHaveBeenCalled()
  })

  test.each([
    { caseName: 'duplicate', times: ['00:00', '00:00', '12:00'] },
    { caseName: 'missing 0:00', times: ['01:00', '08:00', '12:00'] },
    { caseName: 'invalid time', times: ['00:00', '25:00', '12:00'] },
  ])('rejects $caseName rows without saving', async ({ times }) => {
    const service = createService([weekday])
    const modal = openModal(service)
    await flushPromises()

    setRows(modal, times.map((time) => ({ time })))
    submitForm(modal)
    await flushPromises()

    expect(service.save).not.toHaveBeenCalled()
    expect(Notice).toHaveBeenCalled()
    expect(document.body.contains(modal.containerEl)).toBe(true)
  })

  test('disables every editable control during a pending save and ignores repeated submits', async () => {
    const service = createService([weekday])
    let releaseSave!: () => void
    service.save.mockImplementation(() => new Promise<void>((resolve) => {
      releaseSave = resolve
    }))
    const modal = openModal(service)
    await flushPromises()

    submitForm(modal)
    await Promise.resolve()
    expect(service.save).toHaveBeenCalledTimes(1)
    const controls = Array.from(
      modal.contentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button'),
    )
    expect(controls.every((element) => element.disabled)).toBe(true)

    submitForm(modal)
    expect(service.save).toHaveBeenCalledTimes(1)

    releaseSave()
    await flushPromises()
    expect((modal.contentEl.querySelector('.section-profile-save') as HTMLButtonElement).disabled).toBe(false)
  })

  test('manage mode shows catalog editing without a date or apply action', async () => {
    const service = createService([weekday, holiday])
    const modal = openManageModal(service)
    await flushPromises()

    expect(modal.titleEl.textContent).toBe('Manage section profiles')
    expect(modal.contentEl.textContent).toContain(
      'Add and edit section profiles such as weekdays and weekends. Assign them using weekday settings. Days with an existing section setting are unchanged.',
    )
    expect(modal.contentEl.querySelector('.section-profile-date')).toBeNull()
    expect(modal.contentEl.textContent).not.toContain('Other dates are unchanged')
    expect(modal.contentEl.querySelector('.section-profile-apply')).toBeNull()
    expect(Array.from(modal.contentEl.querySelectorAll('select option')).map((option) => option.textContent)).toEqual([
      'Weekday',
      'Holiday',
    ])
  })

  test('manage mode selects and saves a catalog profile without applying it', async () => {
    const service = createService([weekday, holiday])
    const modal = openManageModal(service)
    await flushPromises()

    const profileSelect = modal.contentEl.querySelector('select') as HTMLSelectElement
    profileSelect.value = 'holiday'
    profileSelect.dispatchEvent(new Event('change', { bubbles: true }))
    setInputValue(
      modal.contentEl.querySelector('input.section-profile-profile-name') as HTMLInputElement,
      '  Weekend  ',
    )
    submitForm(modal)
    await flushPromises()

    expect(service.save).toHaveBeenCalledWith({
      ...holiday,
      name: 'Weekend',
    })
    expect(document.body.contains(modal.containerEl)).toBe(true)
  })

  test('manage mode creates a new catalog profile and saves it', async () => {
    const service = createService([weekday])
    const modal = openManageModal(service)
    await flushPromises()

    findButton(modal, 'section-profile-new').click()
    expect(modal.contentEl.querySelectorAll('select option')).toHaveLength(2)
    expect((modal.contentEl.querySelector('select') as HTMLSelectElement).value).not.toBe('weekday')

    submitForm(modal)
    await flushPromises()

    expect(service.save).toHaveBeenCalledTimes(1)
    const saved = service.save.mock.calls[0][0]
    expect(saved.id).not.toBe('weekday')
    expect(saved.name).toBe('Weekday')
    expect(saved.boundaries).toEqual(weekday.boundaries)
  })
})
