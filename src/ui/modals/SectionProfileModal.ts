import { App, Modal, Notice } from 'obsidian'
import { SectionConfigService } from '../../services/SectionConfigService'
import { t } from '../../i18n'
import { createElCompat } from '../components/domCompat'
import { createModalFooter, type ModalFooterButtonSpec } from '../components/modalFooter'
import type { DaySectionProfile, SectionBoundary, SectionProfile } from '../../types'
import type { SectionProfileService } from '../../services/SectionProfileService'

interface SectionProfileDayModalHost {
  mode?: 'day'
  service: SectionProfileService
  dateKey: string
  currentProfile?: DaySectionProfile
  applyProfile: (profile: SectionProfile) => Promise<void>
}

export interface SectionProfileManageModalHost {
  mode: 'manage'
  service: SectionProfileService
}

export type SectionProfileModalHost =
  | SectionProfileDayModalHost
  | SectionProfileManageModalHost

type BoundaryValidationError =
  | 'minimum'
  | 'emptyTime'
  | 'invalidFormat'
  | 'duplicate'
  | 'firstMustBeZero'
  | 'notAscending'

interface DraftProfile {
  id: string
  name: string
  boundaries: SectionBoundary[]
}

interface BoundaryParseResult {
  boundaries?: SectionBoundary[]
  error?: BoundaryValidationError
  invalidInput?: HTMLInputElement
}

const cloneBoundaries = (boundaries: SectionBoundary[]): SectionBoundary[] =>
  boundaries.map(({ hour, minute, label }) => ({
    hour, minute, ...(label?.trim() ? { label: label.trim() } : {}),
  }))

const cloneProfile = (profile: SectionProfile): SectionProfile => ({
  id: profile.id,
  name: profile.name,
  boundaries: cloneBoundaries(profile.boundaries),
})

const formatBoundaryTime = ({ hour, minute }: SectionBoundary): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

const generateProfileId = (): string => {
  const cryptoApi = activeWindow.crypto as Crypto & { randomUUID?: () => string }
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Edit a named set of section boundaries and explicitly apply it to one day.
 * The service owns persistence; this modal only validates and coordinates the
 * two distinct save/apply actions.
 */
export default class SectionProfileModal extends Modal {
  private profiles: SectionProfile[] = []
  private selectedProfileId = ''
  private profileSelectEl: HTMLSelectElement | null = null
  private nameInputEl: HTMLInputElement | null = null
  private boundaryTableBodyEl: HTMLTableSectionElement | null = null
  private addRowButtonEl: HTMLButtonElement | null = null
  private validationEl: HTMLElement | null = null
  private actionButtons: HTMLButtonElement[] = []
  private busy = false
  private loadGeneration = 0

  constructor(
    app: App,
    private readonly host: SectionProfileModalHost,
  ) {
    super(app)
  }

  onOpen(): void {
    this.loadGeneration += 1
    const generation = this.loadGeneration
    this.modalEl.classList.add(
      'taskchute-modal',
      'taskchute-modal--no-close',
      'section-profile-modal',
    )
    this.setTitle(
      this.host.mode === 'manage'
        ? t('sectionProfiles.manage', 'Manage section profiles')
        : t('sectionProfiles.title', 'Section settings'),
    )
    this.contentEl.empty()
    this.renderForm()
    void this.loadProfiles(generation)
  }

  onClose(): void {
    this.loadGeneration += 1
    this.contentEl.empty()
    this.modalEl.classList.remove(
      'taskchute-modal',
      'taskchute-modal--no-close',
      'section-profile-modal',
    )
    this.profileSelectEl = null
    this.nameInputEl = null
    this.boundaryTableBodyEl = null
    this.addRowButtonEl = null
    this.validationEl = null
    this.actionButtons = []
    this.busy = false
  }

  private renderForm(): void {
    const form = createElCompat(this.contentEl, 'form', {
      cls: ['task-form', 'section-profile-form'],
    })

    if (this.host.mode === 'manage') {
      createElCompat(form, 'p', {
        cls: 'modal-description section-profile-description',
        text: t(
          'sectionProfiles.manageDescription',
          'Add and edit section profiles such as weekdays and weekends. Assign them using weekday settings. Days with an existing section setting are unchanged.',
        ),
      })
    } else {
      createElCompat(form, 'p', {
        cls: 'section-profile-date',
        text: t('sectionProfiles.targetDate', 'Display date: {date}', {
          date: this.host.dateKey,
        }),
      })
      createElCompat(form, 'p', {
        cls: 'modal-description section-profile-description',
        text: t(
          'sectionProfiles.dateDescription',
          'Saving a setting does not change this date. Applying it changes only this date. Other dates are unchanged.',
          { date: this.host.dateKey },
        ),
      })
    }

    const selectGroup = createElCompat(form, 'div', { cls: 'form-group' })
    createElCompat(selectGroup, 'label', {
      cls: 'form-label',
      text: t('sectionProfiles.profileLabel', 'Saved setting'),
    })
    const profileSelect = createElCompat(selectGroup, 'select', {
      cls: 'form-input',
      attr: { 'aria-label': t('sectionProfiles.profileLabel', 'Saved setting') },
    })
    this.profileSelectEl = profileSelect
    profileSelect.addEventListener('change', () => {
      this.selectProfile(profileSelect.value)
    })

    const nameGroup = createElCompat(form, 'div', { cls: 'form-group' })
    createElCompat(nameGroup, 'label', {
      cls: 'form-label',
      text: t('sectionProfiles.nameLabel', 'Name'),
    })
    const nameInput = createElCompat(nameGroup, 'input', {
      cls: 'form-input section-profile-profile-name',
      attr: {
        type: 'text',
        'aria-label': t('sectionProfiles.nameLabel', 'Name'),
        placeholder: t('sectionProfiles.namePlaceholder', 'e.g. Weekday'),
      },
    })
    this.nameInputEl = nameInput

    const boundariesGroup = createElCompat(form, 'div', { cls: 'form-group' })
    const table = createElCompat(boundariesGroup, 'table', {
      cls: 'section-profile-table',
      attr: {
        'aria-label': t('sectionProfiles.boundariesLabel', 'Section start times and names'),
        'aria-describedby': 'section-profile-boundaries-description',
      },
    })
    const tableHead = createElCompat(table, 'thead')
    const headingRow = createElCompat(tableHead, 'tr')
    ;[
      t('sectionProfiles.startTimeColumn', 'Start time'),
      t('sectionProfiles.nameColumn', 'Name (optional)'),
      t('sectionProfiles.actionsColumn', 'Actions'),
    ].forEach((text) => {
      createElCompat(headingRow, 'th', {
        text,
        attr: { scope: 'col' },
      })
    })
    const tableBody = createElCompat(table, 'tbody', {
      cls: 'section-profile-table-body',
    })
    this.boundaryTableBodyEl = tableBody
    const addRowButton = createElCompat(boundariesGroup, 'button', {
      cls: ['form-button', 'secondary', 'section-profile-add-row'],
      type: 'button',
      text: t('sectionProfiles.addRow', 'Add row'),
      attr: {
        'aria-label': t('sectionProfiles.addRow', 'Add row'),
      },
    })
    this.addRowButtonEl = addRowButton
    addRowButton.addEventListener('click', (event) => {
      event.preventDefault()
      this.addBoundaryRow()
    })
    createElCompat(boundariesGroup, 'p', {
      cls: 'modal-description',
      text: t(
        'sectionProfiles.boundariesDescription',
        'Enter a start time and an optional name in each row. Include 0:00 and at least two rows.',
      ),
      attr: { id: 'section-profile-boundaries-description' },
    })

    this.validationEl = createElCompat(form, 'p', {
      cls: ['section-profile-error', 'hidden'],
      attr: { role: 'alert', 'aria-live': 'polite' },
    })

    const footerSpecs: ModalFooterButtonSpec[] = [
      {
        text: t('sectionProfiles.newProfile', 'New setting'),
        role: 'secondary',
        cls: 'section-profile-new',
        onClick: (event) => {
          event.preventDefault()
          this.createNewProfile()
        },
      },
      {
        text: t('sectionProfiles.cancel', 'Cancel'),
        role: 'cancel',
        cls: 'section-profile-cancel',
        onClick: (event) => {
          event.preventDefault()
          this.close()
        },
      },
      {
        text: t('sectionProfiles.save', 'Save setting'),
        role: 'primary',
        type: 'submit',
        cls: 'section-profile-save',
      },
    ]
    if (this.host.mode !== 'manage') {
      footerSpecs.push({
        text: t('sectionProfiles.apply', 'Apply to display date'),
        role: 'primary',
        cls: 'section-profile-apply',
        onClick: (event) => {
          event.preventDefault()
          void this.saveAndApply()
        },
      })
    }
    const { buttons } = createModalFooter(form, footerSpecs)
    this.actionButtons = buttons

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.saveProfile()
    })

    const initial = this.host.mode !== 'manage' ? this.host.currentProfile : undefined
    if (initial) {
      this.setProfileFields(initial)
    }
  }

  private async loadProfiles(generation: number): Promise<void> {
    this.setBusy(true)
    try {
      const loaded = await this.host.service.list()
      if (generation !== this.loadGeneration) return

      const profiles = loaded.map((profile) => cloneProfile(profile))
      const snapshot = this.host.mode !== 'manage' && this.host.currentProfile
        ? cloneProfile(this.host.currentProfile)
        : undefined
      if (snapshot) {
        const index = profiles.findIndex((profile) => profile.id === snapshot.id)
        if (index >= 0) {
          profiles[index] = snapshot
        } else {
          profiles.unshift(snapshot)
        }
      }
      this.profiles = profiles
      this.populateProfileOptions()

      const initial = snapshot ?? profiles[0]
      if (initial) {
        this.setProfileFields(initial)
      }
    } catch (error) {
      if (generation !== this.loadGeneration) return
      console.error('[SectionProfileModal] Failed to load section profiles', error)
      this.showFailure('sectionProfiles.notices.loadFailed', 'Failed to load section settings')
    } finally {
      if (generation === this.loadGeneration) {
        this.setBusy(false)
      }
    }
  }

  private populateProfileOptions(): void {
    const select = this.profileSelectEl
    if (!select) return
    while (select.firstChild) {
      select.removeChild(select.firstChild)
    }
    this.profiles.forEach((profile) => {
      const option = createElCompat(select, 'option', { text: profile.name })
      option.value = profile.id
    })
    if (this.selectedProfileId) {
      select.value = this.selectedProfileId
    }
  }

  private selectProfile(profileId: string): void {
    if (this.busy) return
    const profile = this.profiles.find((candidate) => candidate.id === profileId)
    if (!profile) return
    this.setProfileFields(profile)
    this.clearValidation()
  }

  private setProfileFields(profile: SectionProfile): void {
    this.selectedProfileId = profile.id
    if (this.profileSelectEl) {
      this.profileSelectEl.value = profile.id
    }
    if (this.nameInputEl) {
      this.nameInputEl.value = profile.name
    }
    this.renderBoundaryRows(profile.boundaries)
  }

  private getBoundaryRows(): HTMLTableRowElement[] {
    return Array.from(this.boundaryTableBodyEl?.rows ?? [])
  }

  private renderBoundaryRows(boundaries: SectionBoundary[]): void {
    this.boundaryTableBodyEl?.replaceChildren()
    boundaries.forEach((boundary) => this.createBoundaryRow(boundary))
    this.updateBoundaryControls()
  }

  private createBoundaryRow(boundary?: SectionBoundary): HTMLInputElement | undefined {
    if (!this.boundaryTableBodyEl) return undefined
    const row = createElCompat(this.boundaryTableBodyEl, 'tr', { cls: 'section-profile-row' })
    const timeCell = createElCompat(row, 'td')
    const timeInput = createElCompat(timeCell, 'input', {
      cls: 'form-input section-profile-time',
      attr: { type: 'time', step: '60' },
    })
    timeInput.value = boundary ? formatBoundaryTime(boundary) : ''
    const nameCell = createElCompat(row, 'td')
    const nameInput = createElCompat(nameCell, 'input', {
      cls: 'form-input section-profile-name',
      attr: { type: 'text' },
    })
    nameInput.value = boundary?.label ?? ''
    const removeCell = createElCompat(row, 'td')
    const removeButton = createElCompat(removeCell, 'button', {
      cls: 'section-profile-remove-row',
      type: 'button',
      text: '×',
    })
    removeButton.addEventListener('click', () => {
      if (this.busy || this.getBoundaryRows().length <= 2) return
      const index = this.getBoundaryRows().indexOf(row)
      row.remove()
      this.updateBoundaryControls()
      const remaining = this.getBoundaryRows()
      remaining[Math.min(index, remaining.length - 1)]
        ?.querySelector<HTMLInputElement>('.section-profile-time')?.focus()
      this.clearValidation()
    })
    return timeInput
  }

  private addBoundaryRow(): void {
    if (this.busy) return
    const input = this.createBoundaryRow()
    this.updateBoundaryControls()
    this.clearValidation()
    input?.focus()
  }

  private updateBoundaryControls(): void {
    const rows = this.getBoundaryRows()
    rows.forEach((row, index) => {
      const time = row.querySelector<HTMLInputElement>('.section-profile-time')!
      const name = row.querySelector<HTMLInputElement>('.section-profile-name')!
      const remove = row.querySelector<HTMLButtonElement>('.section-profile-remove-row')!
      time.disabled = this.busy
      name.disabled = this.busy
      remove.disabled = this.busy || rows.length <= 2
      time.setAttribute('aria-label', t('sectionProfiles.rowStartTime', 'Row {row}: start time', { row: index + 1 }))
      name.setAttribute('aria-label', t('sectionProfiles.rowName', 'Row {row}: name (optional)', { row: index + 1 }))
      const removeLabel = t('sectionProfiles.removeRow', 'Remove row {row}', { row: index + 1 })
      remove.setAttribute('aria-label', removeLabel)
      remove.title = removeLabel
    })
    if (this.addRowButtonEl) this.addRowButtonEl.disabled = this.busy
  }

  private readDraft(): DraftProfile | undefined {
    const id = this.selectedProfileId.trim()
    if (!id) {
      this.showValidation(
        'sectionProfiles.errors.noProfile',
        'Select a section setting first',
      )
      return undefined
    }

    const name = this.nameInputEl?.value.trim() ?? ''
    if (!name) {
      this.showValidation(
        'sectionProfiles.errors.nameRequired',
        'Enter a name for the section setting',
      )
      this.nameInputEl?.focus()
      return undefined
    }

    const parsed = this.parseBoundaries()
    if (parsed.error || !parsed.boundaries) {
      this.showBoundaryValidation(parsed.error ?? 'invalidFormat')
      const input = parsed.invalidInput
        ?? this.getBoundaryRows()[0]?.querySelector<HTMLInputElement>('.section-profile-time')
      input?.focus()
      return undefined
    }

    this.nameInputEl!.value = name
    this.renderBoundaryRows(parsed.boundaries)
    return { id, name, boundaries: parsed.boundaries }
  }

  private parseBoundaries(): BoundaryParseResult {
    const rows = this.getBoundaryRows()
    if (rows.length < 2) {
      return { error: 'minimum' }
    }

    const boundaries: SectionBoundary[] = []
    for (const row of rows) {
      const timeInput = row.querySelector<HTMLInputElement>('.section-profile-time')!
      const value = timeInput.value.trim()
      if (!value) return { error: 'emptyTime', invalidInput: timeInput }
      const match = /^(\d{2}):(\d{2})$/u.exec(value)
      if (!match) {
        return { error: 'invalidFormat', invalidInput: timeInput }
      }
      const hour = Number(match[1])
      const minute = Number(match[2])
      if (hour > 23 || minute > 59) {
        return { error: 'invalidFormat', invalidInput: timeInput }
      }
      const label = row.querySelector<HTMLInputElement>('.section-profile-name')!.value.trim()
      boundaries.push({ hour, minute, ...(label ? { label } : {}) })
    }

    boundaries.sort((left, right) =>
      left.hour * 60 + left.minute - (right.hour * 60 + right.minute),
    )
    for (let index = 1; index < boundaries.length; index += 1) {
      const previous = boundaries[index - 1]
      const current = boundaries[index]
      const previousMinutes = previous.hour * 60 + previous.minute
      const currentMinutes = current.hour * 60 + current.minute
      if (currentMinutes === previousMinutes) {
        return { error: 'duplicate' }
      }
    }
    if (boundaries[0].hour !== 0 || boundaries[0].minute !== 0) {
      return { error: 'firstMustBeZero' }
    }

    const sanitized = SectionConfigService.sanitizeBoundaries(boundaries)
    return sanitized ? { boundaries: sanitized } : { error: 'notAscending' }
  }

  private createNewProfile(): void {
    if (this.busy) return
    const draft = this.readDraft()
    if (!draft) return
    const profile: SectionProfile = {
      id: generateProfileId(),
      name: draft.name,
      boundaries: cloneBoundaries(draft.boundaries),
    }
    this.profiles.push(profile)
    this.populateProfileOptions()
    this.setProfileFields(profile)
    this.clearValidation()
  }

  private async saveProfile(): Promise<void> {
    await this.saveDraft(false)
  }

  private async saveAndApply(): Promise<void> {
    await this.saveDraft(true)
  }

  private async saveDraft(applyAfterSave: boolean): Promise<void> {
    if (this.busy) return
    const draft = this.readDraft()
    if (!draft) return

    this.setBusy(true)
    try {
      await this.host.service.save(draft)
      this.replaceLocalProfile(draft)
      this.clearValidation()
      if (!applyAfterSave) {
        new Notice(t('sectionProfiles.notices.saved', 'Section setting saved'))
        return
      }

      if (this.host.mode === 'manage') return
      await this.host.applyProfile(draft)
      new Notice(
        t('sectionProfiles.notices.applied', 'Applied section setting to {date}', {
          date: this.host.dateKey,
        }),
      )
      this.close()
    } catch (error) {
      console.error('[SectionProfileModal] Failed to save/apply section profile', error)
      this.showFailure(
        applyAfterSave
          ? 'sectionProfiles.notices.applyFailed'
          : 'sectionProfiles.notices.saveFailed',
        applyAfterSave
          ? 'Failed to apply the section setting'
          : 'Failed to save the section setting',
      )
    } finally {
      this.setBusy(false)
    }
  }

  private replaceLocalProfile(profile: SectionProfile): void {
    const index = this.profiles.findIndex((candidate) => candidate.id === profile.id)
    if (index >= 0) {
      this.profiles[index] = cloneProfile(profile)
    } else {
      this.profiles.push(cloneProfile(profile))
    }
    this.populateProfileOptions()
    this.setProfileFields(profile)
  }

  private setBusy(busy: boolean): void {
    this.busy = busy
    this.actionButtons.forEach((button) => {
      button.disabled = busy
    })
    if (this.profileSelectEl) this.profileSelectEl.disabled = busy
    if (this.nameInputEl) this.nameInputEl.disabled = busy
    this.updateBoundaryControls()
  }

  private showBoundaryValidation(error: BoundaryValidationError): void {
    const keys: Record<BoundaryValidationError, { key: string; fallback: string }> = {
      minimum: {
        key: 'sectionProfiles.errors.minimum',
        fallback: 'At least 2 section times are required',
      },
      emptyTime: {
        key: 'sectionProfiles.errors.emptyTime',
        fallback: 'Enter a start time for every row',
      },
      invalidFormat: {
        key: 'sectionProfiles.errors.invalidFormat',
        fallback: 'Enter each time in H:mm or HH:mm format',
      },
      duplicate: {
        key: 'sectionProfiles.errors.duplicate',
        fallback: 'Duplicate section times are not allowed',
      },
      firstMustBeZero: {
        key: 'sectionProfiles.errors.firstMustBeZero',
        fallback: 'The first section time must be 0:00',
      },
      notAscending: {
        key: 'sectionProfiles.errors.notAscending',
        fallback: 'Section times must be in ascending order',
      },
    }
    const message = keys[error]
    this.showValidation(message.key, message.fallback)
  }

  private showValidation(key: string, fallback: string): void {
    const message = t(key, fallback)
    if (this.validationEl) {
      this.validationEl.textContent = message
      this.validationEl.classList.remove('hidden')
    }
    new Notice(message)
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
