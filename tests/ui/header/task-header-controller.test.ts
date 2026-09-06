import { Platform } from 'obsidian'
import { localeManager } from '../../../src/i18n'
import TaskHeaderController, {
  TaskHeaderControllerHost,
  TaskHeaderControllerDependencies,
} from '../../../src/ui/header/TaskHeaderController'

jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian')
  return {
    ...actual,
    Notice: jest.fn(),
  }
})

jest.mock('../../../src/i18n', () => {
  const actual = jest.requireActual('../../../src/i18n')
  return {
    ...actual,
    getCurrentLocale: () => 'en',
  }
})

describe('TaskHeaderController', () => {
  const attachCreateEl = (target: HTMLElement) => {
    target.createEl = (function (this: HTMLElement, tag: string, options: Record<string, unknown> = {}) {
      const el = document.createElement(tag)
      if (options.cls) {
        el.className = options.cls as string
      }
      if (options.text) {
        el.textContent = options.text as string
      }
      if (options.attr) {
        Object.entries(options.attr as Record<string, string>).forEach(([key, value]) => {
          el.setAttribute(key, value)
        })
      }
      attachCreateEl(el)
      this.appendChild(el)
      return el
    }) as unknown as HTMLElement['createEl']
  }

  const createHost = (overrides: Partial<TaskHeaderControllerHost> = {}): TaskHeaderControllerHost => {
    const registerManagedDomEvent = jest.fn((target: Document | HTMLElement, event: string, handler: EventListener) => {
      target.addEventListener(event, handler)
    })
    const plugin = {
      settings: {
        aiRobotButtonEnabled: overrides.plugin?.settings?.aiRobotButtonEnabled ?? false,
      },
    }
    const commands = overrides.app?.commands ?? {
      commands: { 'terminal:open-terminal.integrated.root': {} },
      executeCommandById: jest.fn(),
    }
    return {
      tv: overrides.tv ?? ((_key, fallback, vars) => {
        if (!vars) return fallback
        return Object.entries(vars).reduce(
          (text, [key, value]) => text.replace(`{${key}}`, String(value)),
          fallback,
        )
      }),
      getCurrentDate: overrides.getCurrentDate ?? (() => new Date(2025, 9, 9)),
      setCurrentDate: overrides.setCurrentDate ?? jest.fn(),
      adjustCurrentDate: overrides.adjustCurrentDate ?? jest.fn(),
      reloadTasksAndRestore: overrides.reloadTasksAndRestore ?? jest.fn().mockResolvedValue(undefined),
      showAddTaskModal: overrides.showAddTaskModal ?? jest.fn(),
      toggleNavigation: overrides.toggleNavigation ?? jest.fn(),
      plugin: overrides.plugin ?? (plugin as unknown as TaskHeaderControllerHost['plugin']),
      app: overrides.app ?? ({ commands } as unknown as TaskHeaderControllerHost['app']),
      registerManagedDomEvent,
      showSectionProfileModal: overrides.showSectionProfileModal,
      getSectionProfileLabel: overrides.getSectionProfileLabel,
    }
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    jest.clearAllMocks()
    localeManager.setLocale('en', false)
  })

  test('render wires drawer and navigation arrows', async () => {
    const toggleNavigation = jest.fn()
    const adjustCurrentDate = jest.fn()
    const host = createHost({ toggleNavigation, adjustCurrentDate })
    const controller = new TaskHeaderController(host)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)

    const drawer = container.querySelector('.drawer-toggle') as HTMLButtonElement
    expect(drawer).toBeTruthy()
    drawer.dispatchEvent(new Event('click'))
    expect(toggleNavigation).toHaveBeenCalled()

    const arrows = container.querySelectorAll('.date-nav-arrow')
    expect(arrows).toHaveLength(2)
    arrows[0].dispatchEvent(new Event('click'))
    expect(adjustCurrentDate).toHaveBeenCalledWith(-1)
    arrows[1].dispatchEvent(new Event('click'))
    expect(adjustCurrentDate).toHaveBeenCalledWith(1)
  })

  test('render action buttons trigger add modal and robot command', async () => {
    const executeCommand = jest.fn().mockResolvedValue(undefined)
    const host = createHost({
      plugin: { settings: { aiRobotButtonEnabled: true } } as TaskHeaderControllerHost['plugin'],
      app: {
        commands: {
          commands: { 'terminal:open-terminal.integrated.root': {} },
          executeCommandById: executeCommand,
        },
      } as unknown as TaskHeaderControllerHost['app'],
    })
    const controller = new TaskHeaderController(host)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)
    const addButton = container.querySelector('.add-task-button') as HTMLButtonElement
    addButton.dispatchEvent(new Event('click', { bubbles: true }))
    expect(host.showAddTaskModal).toHaveBeenCalled()

    const robotButton = container.querySelector('.robot-terminal-button') as HTMLButtonElement
    robotButton.dispatchEvent(new Event('click', { bubbles: true }))
    expect(executeCommand).toHaveBeenCalledWith('terminal:open-terminal.integrated.root')
  })

  test('labels the add action and places it immediately before section selection', () => {
    const host = createHost({
      showSectionProfileModal: jest.fn(),
      getSectionProfileLabel: () => 'Weekday',
    })
    const controller = new TaskHeaderController(host)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)

    const addButton = container.querySelector('.add-task-button') as HTMLButtonElement
    const actionSection = container.querySelector('.header-action-section') as HTMLElement
    const toolbar = container.querySelector('.section-profile-toolbar') as HTMLElement
    const profileButton = container.querySelector('.section-profile-button') as HTMLButtonElement
    expect(addButton.textContent).toBe('Add task')
    expect(addButton.getAttribute('type')).toBe('button')
    expect(actionSection.parentElement).toBe(toolbar)
    expect(actionSection.nextElementSibling).toBe(profileButton)
  })

  test('keeps the action section in its original container when profiles are unavailable', () => {
    const controller = new TaskHeaderController(createHost())
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)

    const actionSection = container.querySelector('.header-action-section') as HTMLElement
    expect(actionSection.parentElement).toBe(container)
    expect(container.querySelector('.section-profile-toolbar')).toBeNull()
  })

  /**
   * The setting is synced, so a vault switched on from a desktop reaches an
   * iPad with the flag set — where the Terminal plugin cannot be installed and
   * the button could only ever report it as missing.
   */
  test('omits the robot button on mobile even with the setting on', () => {
    Platform.isDesktop = false
    Platform.isMobile = true
    try {
      const host = createHost({
        plugin: { settings: { aiRobotButtonEnabled: true } } as TaskHeaderControllerHost['plugin'],
      })
      const controller = new TaskHeaderController(host)
      const container = document.createElement('div')
      attachCreateEl(container)

      controller.render(container)

      expect(container.querySelector('.robot-terminal-button')).toBeNull()
      expect(container.querySelector('.add-task-button')).toBeTruthy()
    } finally {
      Platform.isDesktop = true
      Platform.isMobile = false
    }
  })

  test('calendar selection updates current date and triggers reload', async () => {
    const setCurrentDate = jest.fn()
    const reloadSpy = jest.fn().mockResolvedValue(undefined)
    const host = createHost({ setCurrentDate, reloadTasksAndRestore: reloadSpy })
    let capturedSelect: ((isoDate: string) => Promise<void> | void) | null = null
    let capturedClose: (() => void) | null = null
    const dependencies: TaskHeaderControllerDependencies = {
      createCalendar: (options) => {
        capturedSelect = options.onSelect
        capturedClose = options.onClose ?? null
        return {
          open: jest.fn(),
          close: jest.fn(),
        }
      },
    }
    const controller = new TaskHeaderController(host, dependencies)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)
    const calendarButton = container.querySelector('.calendar-btn') as HTMLButtonElement
    calendarButton.dispatchEvent(new Event('click'))

    expect(capturedSelect).toBeTruthy()
    await (capturedSelect as ((isoDate: string) => Promise<void> | void) | null)?.('2025-10-11')
    expect(setCurrentDate).toHaveBeenCalled()
    expect(reloadSpy).toHaveBeenCalled()

    ;(capturedClose as (() => void) | null)?.()
  })

  test('the date label opens the calendar, by click and by keyboard', () => {
    const host = createHost()
    const open = jest.fn()
    const anchors: HTMLElement[] = []
    const dependencies: TaskHeaderControllerDependencies = {
      createCalendar: (options) => {
        anchors.push(options.anchor)
        return { open, close: jest.fn() }
      },
    }
    const controller = new TaskHeaderController(host, dependencies)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)
    const label = container.querySelector('.date-nav-label') as HTMLElement
    const calendarButton = container.querySelector('.calendar-btn') as HTMLElement

    expect(label.getAttribute('role')).toBe('button')
    expect(label.getAttribute('tabindex')).toBe('0')

    label.dispatchEvent(new Event('click'))
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))

    // Twice, not three times: an unrelated key is left alone.
    expect(open).toHaveBeenCalledTimes(2)

    // The popup hangs off the glyph either way, so it lands in the same place
    // whichever of the two the user reached for.
    expect(anchors).toEqual([calendarButton, calendarButton])
  })

  test('keeps daily section selection in the header without weekday settings', () => {
    const showSectionProfileModal = jest.fn()
    const host = createHost({
      showSectionProfileModal,
      getSectionProfileLabel: () => 'Weekday',
    })
    const controller = new TaskHeaderController(host)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)

    const toolbar = container.querySelector('.section-profile-toolbar')
    const button = container.querySelector('.section-profile-button') as HTMLButtonElement
    expect(toolbar).toBeTruthy()
    expect(button.textContent).toBe('Section: Weekday')

    button.click()
    expect(showSectionProfileModal).toHaveBeenCalledTimes(1)
    const weekdayButton = container.querySelector('.section-weekday-button')
    expect(weekdayButton).toBeNull()
  })

  test('refreshes the section profile label and falls back to current settings', () => {
    let profileLabel = 'Holiday'
    const host = createHost({
      showSectionProfileModal: jest.fn(),
      getSectionProfileLabel: () => profileLabel,
    })
    const controller = new TaskHeaderController(host)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)
    const button = container.querySelector('.section-profile-button') as HTMLButtonElement
    expect(button.textContent).toBe('Section: Holiday')

    profileLabel = ''
    controller.refreshDateLabel()
    expect(button.textContent).toBe('Current settings')
  })

  test('uses the root dictionary for the Japanese section profile label', () => {
    localeManager.setLocale('ja', false)
    const host = createHost({
      showSectionProfileModal: jest.fn(),
      getSectionProfileLabel: () => '平日',
    })
    const controller = new TaskHeaderController(host)
    const container = document.createElement('div')
    attachCreateEl(container)

    controller.render(container)

    expect(container.querySelector('.section-profile-button')?.textContent).toBe('セクション: 平日')
  })
})
