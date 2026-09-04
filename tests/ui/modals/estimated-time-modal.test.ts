import { Notice, TFile } from 'obsidian'
import type { TaskInstance } from '../../../src/types'
import EstimatedTimeModal from '../../../src/ui/modals/EstimatedTimeModal'

jest.mock('obsidian', () => {
  const { Modal } = jest.requireActual('obsidian')
  return {
    App: class MockApp {},
    Modal,
    Notice: jest.fn(),
    TFile: class MockTFile {
      path = ''
      basename = ''
      extension = 'md'
    },
  }
})

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('EstimatedTimeModal', () => {
  const createInstance = (estimatedMinutes?: number): TaskInstance => ({
    task: {
      path: 'Tasks/sample.md',
      frontmatter: estimatedMinutes === undefined ? {} : { estimatedMinutes },
      name: 'sample',
      estimatedMinutes,
    },
  } as TaskInstance)

  const createHost = (frontmatter: Record<string, unknown>) => {
    const file = new TFile()
    file.path = 'Tasks/sample.md'
    return {
      tv: (_key: string, fallback: string) => fallback,
      app: {
        vault: {
          getAbstractFileByPath: jest.fn(() => file),
        },
        fileManager: {
          processFrontMatter: jest.fn(async (
            _file: TFile,
            updater: (value: Record<string, unknown>) => void,
          ) => updater(frontmatter)),
        },
      },
      reloadTasksAndRestore: jest.fn().mockResolvedValue(undefined),
    }
  }

  beforeEach(() => {
    document.body.replaceChildren()
    ;(Notice as unknown as jest.Mock).mockClear()
  })

  test('uses the standard modal shell and footer, then saves a positive integer', async () => {
    const frontmatter: Record<string, unknown> = { estimatedMinutes: 30 }
    const host = createHost(frontmatter)
    const instance = createInstance(30)
    const modal = new EstimatedTimeModal(host, instance)

    modal.open()

    const input = document.querySelector('.estimated-time-form input[type="number"]') as HTMLInputElement
    expect(document.querySelector('.estimated-time-modal')).toBe(modal.modalEl)
    expect(input.value).toBe('30')
    expect(input.min).toBe('1')
    expect(input.step).toBe('1')
    expect(input.inputMode).toBe('numeric')
    expect(document.querySelector('.estimated-time-form .modal-button-container')).not.toBeNull()

    input.value = '45'
    const form = document.querySelector('.estimated-time-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(host.app.vault.getAbstractFileByPath).toHaveBeenCalledWith('Tasks/sample.md')
    expect(host.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1)
    expect(frontmatter.estimatedMinutes).toBe(45)
    expect(host.reloadTasksAndRestore).toHaveBeenCalledWith({ runBoundaryCheck: false })
    expect(Notice).toHaveBeenCalledWith('Estimated time updated')
    expect(document.querySelector('.estimated-time-modal')).toBeNull()
  })

  test('clearing the value removes estimatedMinutes', async () => {
    const frontmatter: Record<string, unknown> = { estimatedMinutes: 30 }
    const host = createHost(frontmatter)
    const modal = new EstimatedTimeModal(host, createInstance(30))

    modal.open()
    const input = document.querySelector('.estimated-time-form input[type="number"]') as HTMLInputElement
    input.value = ''
    const form = document.querySelector('.estimated-time-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(frontmatter).not.toHaveProperty('estimatedMinutes')
    expect(host.reloadTasksAndRestore).toHaveBeenCalledWith({ runBoundaryCheck: false })
    expect(document.querySelector('.estimated-time-modal')).toBeNull()
  })

  test.each(['0', '1.5'])('rejects invalid estimate %s without changing the file', async (value) => {
    const frontmatter: Record<string, unknown> = { estimatedMinutes: 30 }
    const host = createHost(frontmatter)
    const modal = new EstimatedTimeModal(host, createInstance(30))

    modal.open()
    const input = document.querySelector('.estimated-time-form input[type="number"]') as HTMLInputElement
    input.value = value
    const form = document.querySelector('.estimated-time-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(host.app.vault.getAbstractFileByPath).not.toHaveBeenCalled()
    expect(host.app.fileManager.processFrontMatter).not.toHaveBeenCalled()
    expect(host.reloadTasksAndRestore).not.toHaveBeenCalled()
    expect(Notice).toHaveBeenCalledWith('Enter a whole number of minutes greater than 0')
    expect(document.querySelector('.estimated-time-modal')).not.toBeNull()
  })
})
