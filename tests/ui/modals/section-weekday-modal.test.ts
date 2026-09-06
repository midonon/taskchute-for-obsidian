import { Notice } from 'obsidian'
import SectionWeekdayModal from '../../../src/ui/modals/SectionWeekdayModal'
import type { SectionProfile, WeekdaySectionAssignments } from '../../../src/types'

type FakeSectionProfileService = {
  list: jest.Mock<Promise<SectionProfile[]>, []>
  getWeekdayAssignments: jest.Mock<Promise<WeekdaySectionAssignments | null>, []>
  saveWeekdayAssignments: jest.Mock<Promise<void>, [WeekdaySectionAssignments]>
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const createService = (
  profiles: SectionProfile[],
  assignments: WeekdaySectionAssignments | null,
): FakeSectionProfileService => ({
  list: jest.fn().mockResolvedValue(profiles),
  getWeekdayAssignments: jest.fn().mockResolvedValue(assignments),
  saveWeekdayAssignments: jest.fn().mockResolvedValue(undefined),
})

const rows = (modal: SectionWeekdayModal): HTMLTableRowElement[] =>
  Array.from(modal.contentEl.querySelectorAll('tr.section-weekday-row'))

const selects = (modal: SectionWeekdayModal): HTMLSelectElement[] =>
  Array.from(modal.contentEl.querySelectorAll('select.section-weekday-select'))

const findButton = (modal: SectionWeekdayModal, className: string): HTMLButtonElement => {
  const button = modal.contentEl.querySelector(`.${className}`)
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${className}`)
  }
  return button
}

const submitForm = (modal: SectionWeekdayModal): void => {
  const form = modal.contentEl.querySelector('form')
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Missing weekday settings form')
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

describe('SectionWeekdayModal', () => {
  const profiles: SectionProfile[] = [
    {
      id: 'weekday',
      name: 'Weekday',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 8, minute: 0 }],
    },
    {
      id: 'holiday',
      name: 'Holiday',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 10, minute: 0 }],
    },
    {
      id: 'focus',
      name: 'Focus',
      boundaries: [{ hour: 0, minute: 0 }, { hour: 9, minute: 0 }],
    },
  ]

  const openModal = (
    service: FakeSectionProfileService,
    onSaved: jest.Mock<Promise<void>, []> = jest.fn().mockResolvedValue(undefined),
  ): SectionWeekdayModal => {
    const modal = new SectionWeekdayModal(
      {} as ConstructorParameters<typeof SectionWeekdayModal>[0],
      service as never,
      onSaved,
    )
    modal.open()
    return modal
  }

  beforeEach(() => {
    document.body.replaceChildren()
    ;(Notice as unknown as jest.Mock).mockClear()
  })

  test('renders seven rows Monday-to-Sunday and does not write before save', async () => {
    const service = createService(profiles, null)
    const modal = openModal(service)
    await flushPromises()

    expect(service.saveWeekdayAssignments).not.toHaveBeenCalled()
    expect(rows(modal)).toHaveLength(7)
    expect(rows(modal).map((row) => row.dataset.weekday)).toEqual([
      '1', '2', '3', '4', '5', '6', '0',
    ])
    expect(rows(modal).map((row) => row.querySelector('th')?.textContent)).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ])
    expect(selects(modal).map((select) => select.dataset.weekday)).toEqual([
      '1', '2', '3', '4', '5', '6', '0',
    ])
    expect(selects(modal).map((select) => select.getAttribute('aria-label'))).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ])
    expect(selects(modal).map((select) => select.value)).toEqual([
      'weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'holiday', 'holiday',
    ])
    expect(selects(modal).every((select) => select.options[0].value === '')).toBe(true)
    expect(selects(modal).every((select) => select.options.length === 4)).toBe(true)
    expect(modal.contentEl.textContent).toContain(
      'This is an initial suggestion. Save weekday settings to enable automatic switching.',
    )
  })

  test('shows saved assignments including none and saves only on explicit action', async () => {
    const assignments: WeekdaySectionAssignments = [
      'holiday', 'weekday', null, 'focus', 'weekday', null, 'holiday',
    ]
    const service = createService(profiles, assignments)
    const onSaved = jest.fn().mockResolvedValue(undefined)
    const modal = openModal(service, onSaved)
    await flushPromises()

    expect(selects(modal).map((select) => select.value)).toEqual([
      assignments[1] ?? '',
      assignments[2] ?? '',
      assignments[3] ?? '',
      assignments[4] ?? '',
      assignments[5] ?? '',
      assignments[6] ?? '',
      assignments[0] ?? '',
    ])
    const initialHint = modal.contentEl.querySelector('.section-weekday-initial-hint')
    expect(initialHint?.classList.contains('hidden')).toBe(true)

    selects(modal)[1].value = 'focus'
    selects(modal)[1].dispatchEvent(new Event('change', { bubbles: true }))
    expect(service.saveWeekdayAssignments).not.toHaveBeenCalled()

    selects(modal)[1].value = ''
    selects(modal)[1].dispatchEvent(new Event('change', { bubbles: true }))
    submitForm(modal)
    await flushPromises()

    expect(service.saveWeekdayAssignments).toHaveBeenCalledWith(assignments)
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(document.body.contains(modal.containerEl)).toBe(false)
  })

  test('cancels without saving', async () => {
    const service = createService(profiles, null)
    const modal = openModal(service)
    await flushPromises()

    findButton(modal, 'section-weekday-cancel').click()
    await flushPromises()

    expect(service.saveWeekdayAssignments).not.toHaveBeenCalled()
    expect(document.body.contains(modal.containerEl)).toBe(false)
  })

  test('keeps the modal open and shows an inline alert when saving fails', async () => {
    const service = createService(profiles, null)
    service.saveWeekdayAssignments.mockRejectedValue(new Error('write failed'))
    const modal = openModal(service)
    await flushPromises()

    submitForm(modal)
    await flushPromises()

    expect(service.saveWeekdayAssignments).toHaveBeenCalledTimes(1)
    expect(Notice).toHaveBeenCalled()
    const alert = modal.contentEl.querySelector('[role="alert"]')
    expect(alert).toBeInstanceOf(HTMLElement)
    expect(alert?.textContent).toContain('Failed to save weekday settings')
    expect(document.body.contains(modal.containerEl)).toBe(true)
  })

  test('disables controls during save and ignores repeated saves', async () => {
    const service = createService(profiles, null)
    let releaseSave!: () => void
    service.saveWeekdayAssignments.mockImplementation(() => new Promise<void>((resolve) => {
      releaseSave = resolve
    }))
    const modal = openModal(service)
    await flushPromises()

    submitForm(modal)
    await Promise.resolve()
    expect(service.saveWeekdayAssignments).toHaveBeenCalledTimes(1)
    const controls = Array.from(
      modal.contentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        'select, button',
      ),
    )
    expect(controls.every((element) => element.disabled)).toBe(true)

    submitForm(modal)
    expect(service.saveWeekdayAssignments).toHaveBeenCalledTimes(1)

    releaseSave()
    await flushPromises()
    expect(document.body.contains(modal.containerEl)).toBe(false)
  })

  test('keeps a load failure visible without closing the modal', async () => {
    const service = createService(profiles, null)
    service.getWeekdayAssignments.mockRejectedValue(new Error('read failed'))
    const modal = openModal(service)
    await flushPromises()

    expect(Notice).toHaveBeenCalled()
    expect(modal.contentEl.querySelector('[role="alert"]')?.textContent).toContain(
      'Failed to load weekday settings',
    )
    expect(findButton(modal, 'section-weekday-save').disabled).toBe(true)
    expect(selects(modal).every((select) => select.disabled)).toBe(true)
    expect(findButton(modal, 'section-weekday-cancel').disabled).toBe(false)
    submitForm(modal)
    await flushPromises()
    expect(service.saveWeekdayAssignments).not.toHaveBeenCalled()
    expect(document.body.contains(modal.containerEl)).toBe(true)
  })
})
