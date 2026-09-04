import { Modal, Notice, TFile } from 'obsidian'
import { t } from '../../i18n'
import { createModalFooter } from '../components/modalFooter'
import type { TaskInstance } from '../../types'

export interface EstimatedTimeModalHost {
  tv: (
    key: string,
    fallback: string,
    vars?: Record<string, string | number>,
  ) => string
  app: {
    vault: {
      getAbstractFileByPath: (path: string) => unknown
    }
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

  onClose(): void {
    this.contentEl.empty()
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    this.modalEl.addClass(
      'taskchute-modal',
      'taskchute-modal--no-close',
      'estimated-time-modal',
    )
    this.setTitle(this.host.tv('forms.estimatedTimeTitle', 'Estimated time'))

    const form = contentEl.createEl('form', { cls: 'task-form estimated-time-form' })
    const group = form.createDiv({ cls: 'form-group' })
    group.createEl('label', {
      text: this.host.tv(
        'forms.estimatedMinutesLabel',
        'Estimated time (minutes):',
      ),
      cls: 'form-label',
    })
    const input = group.createEl('input', {
      type: 'number',
      cls: 'form-input',
      value: this.instance.task.estimatedMinutes?.toString() ?? '',
      attr: {
        min: '1',
        step: '1',
        inputmode: 'numeric',
        placeholder: '30',
      },
    })

    const descriptionText = this.host.tv(
      'forms.estimatedTimeInfo',
      'Leave empty to clear the estimate.',
    )
    const description = form.createEl('p', {
      cls: 'modal-description',
    })
    descriptionText.split('\n').forEach((line, index) => {
      if (index > 0) description.createEl('br')
      description.appendChild(activeDocument.createTextNode(line))
    })

    createModalFooter(form, [
      {
        text: t('common.cancel', 'Cancel'),
        role: 'cancel',
        onClick: () => this.close(),
      },
      {
        text: this.host.tv('buttons.save', 'Save'),
        role: 'primary',
        type: 'submit',
      },
    ])

    form.addEventListener('submit', (event) => {
      void (async () => {
        event.preventDefault()
        const raw = input.value.trim()
        const minutes = raw === '' ? undefined : Number(raw)
        if (
          minutes !== undefined &&
          (!Number.isInteger(minutes) || minutes <= 0)
        ) {
          new Notice(
            this.host.tv(
              'forms.estimatedTimeInvalid',
              'Enter a whole number of minutes greater than 0',
            ),
          )
          input.focus()
          return
        }

        const path = this.instance.task.path
        if (!path) {
          new Notice(this.host.tv('notices.taskFileMissing', 'Task file not found'))
          return
        }
        const file = this.host.app.vault.getAbstractFileByPath(path)
        if (!(file instanceof TFile)) {
          new Notice(this.host.tv('notices.taskFileMissing', 'Task file not found'))
          return
        }

        try {
          await this.host.app.fileManager.processFrontMatter(file, (frontmatter) => {
            if (minutes === undefined) {
              delete frontmatter.estimatedMinutes
            } else {
              frontmatter.estimatedMinutes = minutes
            }
          })
          await this.host.reloadTasksAndRestore({ runBoundaryCheck: false })
          new Notice(
            this.host.tv('forms.estimatedTimeUpdated', 'Estimated time updated'),
          )
          this.close()
        } catch (error) {
          console.error('[EstimatedTimeModal] Failed to update estimated time', error)
          new Notice(
            this.host.tv(
              'forms.estimatedTimeUpdateFailed',
              'Failed to update estimated time',
            ),
          )
        }
      })()
    })

    input.focus()
  }
}
