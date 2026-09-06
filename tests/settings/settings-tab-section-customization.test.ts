import type { SettingDefinitionAction, SettingDefinitionGroup, SettingDefinitionList } from 'obsidian';
import { Notice, mockApp } from 'obsidian';
import SectionWeekdayModal from '../../src/ui/modals/SectionWeekdayModal';
import SectionProfileModal from '../../src/ui/modals/SectionProfileModal';
import { TaskChuteSettingTab } from '../../src/settings/SettingsTab';
import { SectionConfigService } from '../../src/services/SectionConfigService';
import { VIEW_TYPE_TASKCHUTE } from '../../src/types';
import { flatten, pageNamed } from './definitionHelpers';

jest.mock('../../src/ui/modals/SectionWeekdayModal', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
}));

jest.mock('../../src/ui/modals/SectionProfileModal', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
}));

const MockedSectionWeekdayModal = SectionWeekdayModal as unknown as jest.MockedClass<typeof SectionWeekdayModal>;
const MockedSectionProfileModal = SectionProfileModal as unknown as jest.MockedClass<typeof SectionProfileModal>;

function createTab() {
  const plugin = {
    app: mockApp,
    manifest: { id: 'taskchute-plus', version: '2.2.0' },
    settings: { slotKeys: {} } as Record<string, unknown>,
    pathManager: { validatePath: () => ({ valid: true }) },
    saveSettings: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };
  const tab = new TaskChuteSettingTab(mockApp, plugin as never);
  return { tab, plugin };
}

function boundaryList(tab: TaskChuteSettingTab): SettingDefinitionList {
  const list = flatten(tab.getSettingDefinitions()).find(
    (item): item is SettingDefinitionList =>
      'type' in item && item.type === 'list',
  );
  if (!list) throw new Error('boundary list not found');
  return list;
}

function actionNamed(
  tab: TaskChuteSettingTab,
  name: string,
): SettingDefinitionAction {
  const row = flatten(tab.getSettingDefinitions()).find(
    (item): item is SettingDefinitionAction =>
      'action' in item && item.action !== undefined && item.name === name,
  );
  if (!row) throw new Error(`action row "${name}" not found`);
  return row;
}

describe('TaskChuteSettingTab section customization', () => {
  beforeEach(() => {
    (Notice as jest.Mock).mockClear();
    MockedSectionWeekdayModal.mockClear();
    MockedSectionProfileModal.mockClear();
    mockApp.workspace.getLeavesOfType.mockReset().mockReturnValue([]);
  });

  test('seeds one row per boundary in effect', () => {
    const { tab } = createTab();

    expect(boundaryList(tab).items).toHaveLength(
      SectionConfigService.DEFAULT_BOUNDARIES.length,
    );
    expect(tab.getControlValue('sectionBoundary.0')).toBe('00:00');
  });

  test('rejects a malformed time without touching the draft', async () => {
    const { tab } = createTab();
    const control = boundaryList(tab).items?.[1] as {
      control: { validate: (value: string) => string | undefined };
    };

    await tab.setControlValue('sectionBoundary.1', '01:30');
    expect(tab.getControlValue('sectionBoundary.1')).toBe('01:30');

    // The framework refuses the change on a non-empty message, so the handler
    // never runs and the previous value stands.
    expect(control.control.validate('99:99')).toBeTruthy();
    expect(tab.getControlValue('sectionBoundary.1')).toBe('01:30');
  });

  test('an added boundary survives the rebuild that adding it triggers', () => {
    const { tab } = createTab();
    const before = boundaryList(tab).items?.length ?? 0;

    boundaryList(tab).addItem?.action({} as HTMLElement);

    expect(boundaryList(tab).items).toHaveLength(before + 1);
  });

  test('keeps at least two boundaries by withholding the delete affordance', () => {
    const { tab } = createTab();

    let list = boundaryList(tab);
    while ((list.items?.length ?? 0) > 2) {
      list.onDelete?.(list.items!.length - 1);
      list = boundaryList(tab);
    }

    expect(list.items).toHaveLength(2);
    expect(list.onDelete).toBeUndefined();
  });

  test('applying sorts the boundaries before validating them', async () => {
    const { tab } = createTab();

    await tab.setControlValue('sectionBoundary.1', '02:00');
    await tab.setControlValue('sectionBoundary.2', '01:00');
    actionNamed(tab, 'Apply').action({} as HTMLElement, 0);

    expect(tab.getControlValue('sectionBoundary.1')).toBe('01:00');
    expect(tab.getControlValue('sectionBoundary.2')).toBe('02:00');
  });

  test('reset puts the default boundaries back', async () => {
    const { tab } = createTab();
    await tab.setControlValue('sectionBoundary.1', '02:00');

    actionNamed(tab, 'Reset to default').action({} as HTMLElement, 0);

    expect(tab.getControlValue('sectionBoundary.1')).toBe(
      `0${SectionConfigService.DEFAULT_BOUNDARIES[1].hour}:00`,
    );
  });

  test('groups named profiles and weekdays while moving the single default into a subpage', () => {
    const { tab } = createTab();
    const advanced = pageNamed(tab.getSettingDefinitions(), 'Advanced settings');
    expect(advanced).toBeDefined();
    const section = advanced?.items?.find(
      (item): item is SettingDefinitionGroup =>
        'type' in item && item.type === 'group' && item.heading === 'Section',
    );
    expect(section?.items?.map((item) => 'name' in item ? item.name : '')).toEqual([
      'Manage section profiles', 'Weekday settings', 'Default section settings',
    ]);
    const defaults = pageNamed(section?.items ?? [], 'Default section settings');
    expect(defaults).toBeDefined();
    const defaultList = flatten(defaults?.items ?? []).find(
      (item): item is SettingDefinitionList => 'type' in item && item.type === 'list',
    );
    expect(defaultList?.items).toHaveLength(SectionConfigService.DEFAULT_BOUNDARIES.length);
    expect(defaultList?.items?.[0]).toMatchObject({ control: { key: 'sectionBoundary.0' } });
    const weekdayAction = actionNamed(tab, 'Weekday settings');
    expect(weekdayAction?.desc).toBe(
      'Assign section profiles, such as weekdays and weekends, to each day of the week.',
    );
  });

  test('opens the shared profile editor in management mode without a target date or writes', () => {
    const { tab, plugin } = createTab();
    actionNamed(tab, 'Manage section profiles').action({} as HTMLElement, 0);

    expect(MockedSectionProfileModal).toHaveBeenCalledTimes(1);
    const host = MockedSectionProfileModal.mock.calls[0][1];
    expect(host).toMatchObject({ mode: 'manage' });
    expect(host).not.toHaveProperty('dateKey');
    expect(host).not.toHaveProperty('applyProfile');
    const modal = MockedSectionProfileModal.mock.results[0].value as { open: jest.Mock };
    expect(modal.open).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(mockApp.vault.create).not.toHaveBeenCalled();
    expect(mockApp.vault.modify).not.toHaveBeenCalled();
  });

  test('opens weekday settings without persisting anything', () => {
    const { tab, plugin } = createTab();
    const action = actionNamed(tab, 'Weekday settings');

    action.action({} as HTMLElement, 0);

    expect(MockedSectionWeekdayModal).toHaveBeenCalledTimes(1);
    const modal = MockedSectionWeekdayModal.mock.results[0]?.value as {
      open: jest.Mock
    };
    expect(modal.open).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(mockApp.vault.create).not.toHaveBeenCalled();
    expect(mockApp.vault.modify).not.toHaveBeenCalled();
  });

  test('waits for every open view to reload after weekday settings are saved', async () => {
    const { tab } = createTab();
    const firstReload = jest.fn().mockResolvedValue(undefined);
    const secondReload = jest.fn().mockResolvedValue(undefined);
    mockApp.workspace.getLeavesOfType.mockReturnValue([
      { view: { reloadTasksAndRestore: firstReload } },
      { view: { reloadTasksAndRestore: secondReload } },
    ]);
    const action = actionNamed(tab, 'Weekday settings');
    action.action({} as HTMLElement, 0);

    const onSaved = MockedSectionWeekdayModal.mock.calls[0]?.[2];
    await onSaved();

    expect(mockApp.workspace.getLeavesOfType).toHaveBeenCalledWith(VIEW_TYPE_TASKCHUTE);
    expect(firstReload).toHaveBeenCalledWith({ runBoundaryCheck: false });
    expect(secondReload).toHaveBeenCalledWith({ runBoundaryCheck: false });

    mockApp.workspace.getLeavesOfType.mockReturnValue([]);
    await expect(onSaved()).resolves.toBeUndefined();
  });
});
