import { Modal, Notice, TFile } from 'obsidian'
import type { TaskInstance } from '../../types'

export interface EstimatedTimeModalHost {
  tv: (key: string, fallback: string, vars?: Record<string, string | number>) => string
  app: {
    vault: { getAbstractFileByPath: (path: string) => unknown }
    fileManager: {
      processFrontMatter: (
        file: TFile,
        updater: (frontmatter: Record<string, unknown>) => void,
      ) => Promise<void>
    }
  }
  reloadTasksAndRestore: (options?: { runBoundaryCheck?: boolean }) => Promise<void>
}

export default class EstimatedTimeModal extends Modal {
  constructor(
    private readonly host: EstimatedTimeModalHost,
    private readonly instance: TaskInstance,
  ) {
    super(host.app as unknown as Modal['app'])
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    const form = contentEl.createEl('form', { cls: 'task-form estimated-time-form' })
    form.createEl('h3', { text: this.host.tv('forms.estimatedTimeTitle', 'Set estimated time') })
    const group = form.createDiv({ cls: 'form-group' })
    group.createEl('label', {
      cls: 'form-label',
      text: this.host.tv('forms.estimatedMinutesLabel', 'Estimated time (minutes):'),
    })
    const input = group.createEl('input', {
      type: 'number',
      cls: 'form-input',
      value: this.instance.task.estimatedMinutes?.toString() ?? '',
      attr: { min: '1', step: '5', placeholder: '30' },
    })
    contentEl.createEl('p', {
      cls: 'modal-description',
      text: this.host.tv('forms.estimatedTimeInfo', 'Leave empty to clear the estimate.'),
    })
    const footer = form.createDiv({ cls: 'form-button-group' })
    const cancel = footer.createEl('button', {
      type: 'button', cls: 'form-button cancel', text: this.host.tv('common.cancel', 'Cancel'),
    })
    footer.createEl('button', {
      type: 'submit', cls: 'form-button create', text: this.host.tv('buttons.save', 'Save'),
    })
    cancel.addEventListener('click', () => this.close())
    form.addEventListener('submit', (event) => {
      void (async () => {
        event.preventDefault()
        const raw = input.value.trim()
        const minutes = raw === '' ? undefined : Number(raw)
        if (minutes !== undefined && (!Number.isFinite(minutes) || minutes <= 0)) {
          new Notice(this.host.tv('forms.estimatedTimeInvalid', 'Enter a positive number of minutes'))
          return
        }
        const file = this.host.app.vault.getAbstractFileByPath(this.instance.task.path)
        if (!(file instanceof TFile)) {
          new Notice(this.host.tv('notices.taskFileMissing', 'Task file not found'))
          return
        }
        await this.host.app.fileManager.processFrontMatter(file, (frontmatter) => {
          if (minutes === undefined) delete frontmatter.estimatedMinutes
          else frontmatter.estimatedMinutes = Math.round(minutes)
        })
        await this.host.reloadTasksAndRestore({ runBoundaryCheck: false })
        new Notice(this.host.tv('forms.estimatedTimeUpdated', 'Estimated time updated'))
        this.close()
      })().catch((error) => {
        console.error('[EstimatedTimeModal] Failed to update estimated time', error)
        new Notice(this.host.tv('forms.estimatedTimeUpdateFailed', 'Failed to update estimated time'))
      })
    })
    input.focus()
  }
}
