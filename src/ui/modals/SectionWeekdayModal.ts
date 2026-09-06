import { App, Modal, Notice } from 'obsidian'
import { t } from '../../i18n'
import type {
  SectionProfile,
  WeekdaySectionAssignments,
} from '../../types'
import type { SectionProfileService } from '../../services/SectionProfileService'
import { createElCompat } from '../components/domCompat'
import { createModalFooter } from '../components/modalFooter'

const DAY_LABEL_KEYS = [
  'daySunday',
  'dayMonday',
  'dayTuesday',
  'dayWednesday',
  'dayThursday',
  'dayFriday',
  'daySaturday',
] as const

const DAY_LABEL_FALLBACKS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

// The persisted tuple follows JavaScript's Date#getDay convention (Sunday
// first), while the form reads naturally from Monday through Sunday.
const DISPLAY_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const

const emptyAssignments = (): WeekdaySectionAssignments => [
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]

const cloneAssignments = (
  assignments: WeekdaySectionAssignments,
): WeekdaySectionAssignments => [...assignments] as WeekdaySectionAssignments

/**
 * Select a saved section profile for each calendar weekday.
 *
 * The service owns persistence. This modal only presents the catalog,
 * collects the seven profile ids, and coordinates the explicit save callback.
 */
export default class SectionWeekdayModal extends Modal {
  private profiles: SectionProfile[] = []
  private assignments: WeekdaySectionAssignments = emptyAssignments()
  private weekdaySelects: HTMLSelectElement[] = []
  private actionButtons: HTMLButtonElement[] = []
  private initialHintEl: HTMLElement | null = null
  private validationEl: HTMLElement | null = null
  private saveButtonEl: HTMLButtonElement | null = null
  private busy = false
  private loaded = false
  private loadGeneration = 0

  constructor(
    app: App,
    private readonly service: SectionProfileService,
    private readonly onSaved: () => Promise<void>,
  ) {
    super(app)
  }

  onOpen(): void {
    this.loadGeneration += 1
    const generation = this.loadGeneration
    this.profiles = []
    this.assignments = emptyAssignments()
    this.weekdaySelects = []
    this.actionButtons = []
    this.initialHintEl = null
    this.validationEl = null
    this.saveButtonEl = null
    this.busy = false
    this.loaded = false

    this.modalEl.classList.add(
      'taskchute-modal',
      'taskchute-modal--no-close',
      'section-weekday-modal',
    )
    this.setTitle(t('sectionProfiles.weekdays.title', 'Weekday settings'))
    this.contentEl.empty()
    this.renderForm()
    void this.loadWeekdaySettings(generation)
  }

  onClose(): void {
    this.loadGeneration += 1
    this.contentEl.empty()
    this.modalEl.classList.remove(
      'taskchute-modal',
      'taskchute-modal--no-close',
      'section-weekday-modal',
    )
    this.profiles = []
    this.assignments = emptyAssignments()
    this.weekdaySelects = []
    this.actionButtons = []
    this.initialHintEl = null
    this.validationEl = null
    this.saveButtonEl = null
    this.busy = false
    this.loaded = false
  }

  private renderForm(): void {
    const form = createElCompat(this.contentEl, 'form', {
      cls: ['task-form', 'section-weekday-form'],
    })

    const description = createElCompat(form, 'p', {
      cls: 'modal-description section-weekday-description',
      text: t(
        'sectionProfiles.weekdays.description',
        'Saving applies the selected profiles automatically to today and future dates without a daily section setting. Days with a daily setting and past days are unchanged. Holidays are not detected automatically.',
      ),
      attr: { id: 'section-weekday-description' },
    })

    const table = createElCompat(form, 'table', {
      cls: 'section-weekday-table',
      attr: { 'aria-describedby': description.id },
    })
    const tableBody = createElCompat(table, 'tbody')

    DISPLAY_WEEKDAYS.forEach((weekday) => {
      const key = DAY_LABEL_KEYS[weekday]
      const dayLabel = t(
        `sectionProfiles.weekdays.${key}`,
        DAY_LABEL_FALLBACKS[weekday],
      )
      const row = createElCompat(tableBody, 'tr', {
        cls: 'section-weekday-row',
        attr: { 'data-weekday': String(weekday) },
      })
      createElCompat(row, 'th', {
        text: dayLabel,
        attr: { scope: 'row' },
      })
      const controlCell = createElCompat(row, 'td')
      const select = createElCompat(controlCell, 'select', {
        cls: ['form-input', 'section-weekday-select'],
        attr: {
          'data-weekday': String(weekday),
          'aria-label': dayLabel,
        },
      })
      this.weekdaySelects.push(select)
      select.addEventListener('change', () => {
        if (this.busy || !this.loaded) return
        const selectedWeekday = Number(select.dataset.weekday)
        if (!Number.isInteger(selectedWeekday) || selectedWeekday < 0 || selectedWeekday > 6) {
          return
        }
        this.assignments[selectedWeekday] = select.value || null
        this.clearValidation()
      })
    })

    this.initialHintEl = createElCompat(form, 'p', {
      cls: ['modal-description', 'section-weekday-initial-hint', 'hidden'],
      text: t(
        'sectionProfiles.weekdays.initialHint',
        'This is an initial suggestion. Save weekday settings to enable automatic switching.',
      ),
    })

    this.validationEl = createElCompat(form, 'p', {
      cls: ['section-weekday-error', 'hidden'],
      attr: { role: 'alert', 'aria-live': 'polite' },
    })

    const { buttons } = createModalFooter(form, [
      {
        text: t('sectionProfiles.weekdays.cancel', 'Cancel'),
        role: 'cancel',
        cls: 'section-weekday-cancel',
        onClick: (event) => {
          event.preventDefault()
          if (!this.busy) this.close()
        },
      },
      {
        text: t('sectionProfiles.weekdays.save', 'Save weekday settings'),
        role: 'primary',
        type: 'submit',
        cls: 'section-weekday-save',
        ref: (button) => {
          this.saveButtonEl = button
        },
      },
    ])
    this.actionButtons = buttons

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.saveWeekdaySettings()
    })
  }

  private async loadWeekdaySettings(generation: number): Promise<void> {
    this.setBusy(true)
    try {
      const [profiles, savedAssignments] = await Promise.all([
        this.service.list(),
        this.service.getWeekdayAssignments(),
      ])
      if (generation !== this.loadGeneration) return

      this.profiles = profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        boundaries: profile.boundaries.map((boundary) => ({ ...boundary })),
      }))
      this.assignments = savedAssignments
        ? cloneAssignments(savedAssignments)
        : this.createInitialAssignments(this.profiles)
      this.populateProfileOptions()
      this.setInitialHint(savedAssignments === null)
      this.clearValidation()
      this.loaded = true
    } catch (error) {
      if (generation !== this.loadGeneration) return
      console.error('[SectionWeekdayModal] Failed to load weekday settings', error)
      this.showFailure(
        'sectionProfiles.weekdays.loadFailed',
        'Failed to load weekday settings',
      )
    } finally {
      if (generation === this.loadGeneration) {
        this.setBusy(false)
      }
    }
  }

  private createInitialAssignments(profiles: SectionProfile[]): WeekdaySectionAssignments {
    const weekdayId = profiles.some((profile) => profile.id === 'weekday') ? 'weekday' : null
    const holidayId = profiles.some((profile) => profile.id === 'holiday') ? 'holiday' : null
    return [
      holidayId,
      weekdayId,
      weekdayId,
      weekdayId,
      weekdayId,
      weekdayId,
      holidayId,
    ]
  }

  private populateProfileOptions(): void {
    this.weekdaySelects.forEach((select) => {
      const weekday = Number(select.dataset.weekday)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return
      while (select.firstChild) {
        select.removeChild(select.firstChild)
      }
      createElCompat(select, 'option', {
        text: t('sectionProfiles.weekdays.none', 'Do not apply automatically'),
        attr: { value: '' },
      })
      this.profiles.forEach((profile) => {
        const option = createElCompat(select, 'option', {
          text: profile.name,
          attr: { value: profile.id },
        })
        option.value = profile.id
      })
      select.value = this.assignments[weekday] ?? ''
    })
  }

  private setInitialHint(visible: boolean): void {
    this.initialHintEl?.classList.toggle('hidden', !visible)
  }

  private async saveWeekdaySettings(): Promise<void> {
    if (this.busy || !this.loaded) return
    const generation = this.loadGeneration
    const assignments = cloneAssignments(this.assignments)
    this.setBusy(true)
    try {
      await this.service.saveWeekdayAssignments(assignments)
      if (generation !== this.loadGeneration) return
      await this.onSaved()
      if (generation !== this.loadGeneration) return
      new Notice(t('sectionProfiles.weekdays.saved', 'Weekday settings saved'))
      this.close()
    } catch (error) {
      if (generation !== this.loadGeneration) return
      console.error('[SectionWeekdayModal] Failed to save weekday settings', error)
      this.showFailure(
        'sectionProfiles.weekdays.saveFailed',
        'Failed to save weekday settings',
      )
    } finally {
      if (generation === this.loadGeneration) {
        this.setBusy(false)
      }
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy
    this.actionButtons.forEach((button) => {
      button.disabled = busy
    })
    if (this.saveButtonEl) {
      this.saveButtonEl.disabled = busy || !this.loaded
    }
    this.weekdaySelects.forEach((select) => {
      select.disabled = busy || !this.loaded
    })
  }

  private clearValidation(): void {
    if (!this.validationEl) return
    this.validationEl.textContent = ''
    this.validationEl.classList.add('hidden')
  }

  private showFailure(key: string, fallback: string): void {
    const message = t(key, fallback)
    new Notice(message)
    if (this.validationEl) {
      this.validationEl.textContent = message
      this.validationEl.classList.remove('hidden')
    }
  }
}
