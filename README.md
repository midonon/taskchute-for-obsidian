# TaskChute Plus — midonon Fork

[日本語](./README.ja.md)

This is a personal fork of [TaskChute Plus by Hiroya Iizuka](https://github.com/hiroyaiizuka/taskchute-for-obsidian). It adds task estimates, section capacity indicators, and different time-slot layouts for weekdays, weekends, or other schedules.

For the plugin's basic usage, commands, and official installation instructions, see the [upstream repository](https://github.com/hiroyaiizuka/taskchute-for-obsidian) and [official documentation](https://obsidian.levers.co.jp/). This README focuses on the additions and changes in this fork.

## Main changes

### Task estimates and section capacity

- Enter an estimate when creating a task. Both regular and routine tasks are supported.
- Click or tap the estimate text in a task row to open the editor directly. Unset estimates also provide an editable placeholder.
- Completed tasks display estimated and actual durations side by side, such as a 30-minute estimate and 60 minutes of actual time.
- Section headers show the total estimated time, section capacity, and a usage bar. The indicator uses a warning color at capacity and red when over capacity.

For example, `60/240m` means a total estimate of 60 minutes in a 240-minute section. The “No time” section has no time window, so it does not display a capacity comparison.

![Task estimates, actual durations, and section capacity in the Japanese UI](https://github.com/user-attachments/assets/96f872f1-7b94-4d32-a0e6-50c45bf118e3)

*An example of the estimate feature. The current version also includes the section settings and UI changes described below.*

### Multiple section profiles and weekday assignments

- Save multiple time-slot layouts, such as weekday and weekend profiles. You can add more than two profiles.
- Give each time slot an optional name, such as “Sleep,” “Morning,” or “After dinner.” Start times and names are edited in separate table fields.
- Assign a saved profile to each day of the week, such as one for Monday–Friday and another for Saturday–Sunday.
- Apply a different profile to a specific date from the task list.

Public holidays are not detected automatically. Use a manual date-specific selection for holidays or other exceptions.

### Display and controls

Start/end times, estimates, and actual durations use aligned columns. Estimates appear as clickable text. The add-task button sits beside the section selector, and the comment, routine, and settings buttons use equal square dimensions. The added features support both Japanese and English UI.

## Using the added features

### Estimates

Enter an estimate when creating a task, or select the estimate text in a task row. Editing from the gear menu remains available. Values are in minutes and must be positive integers. Save an empty field to clear the estimate.

Estimates are stored in the task note's frontmatter:

```yaml
estimatedMinutes: 30
```

### Section profiles

1. Open Obsidian settings → TaskChute Plus → Advanced settings → Sections.
2. Open the section profile manager, edit and save a profile's name, start times, and optional time-slot names.
3. Open the weekday settings and select a saved profile for each day of the week.

Include 0:00 and at least two start times. Time-slot names are optional.

Weekday assignments apply to today and future dates that do not yet have a date-specific section profile. Once applied, the time boundaries and names are stored for that date. Editing saved profiles or weekday assignments does not bulk-rewrite dates with an existing profile or past dates.

To change a particular date, use the section selector in the task list and apply the chosen profile to the displayed date. Saving a profile alone does not change dates where a profile has already been applied.

## Trying this fork

`main` contains the combined version with both estimates and section profiles. Installing the upstream community plugin alone does not install this fork's additions.

### Build from source

Requires Node.js 22.22.1 or later and npm.

```bash
git clone --branch main https://github.com/midonon/taskchute-for-obsidian.git
cd taskchute-for-obsidian
npm install
npm run build
```

Back up your vault and try a test vault first. Disable TaskChute Plus, copy the built `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/taskchute-plus/` inside the vault, then enable the plugin again.

This fork uses the same plugin ID as upstream, so it replaces the upstream plugin within that vault. Do not delete your existing `data.json`, tasks, or logs, or overwrite them with another vault's settings. Updating to an upstream version replaces the plugin code and removes access to this fork's added features.

If installing from a GitHub Release, first check that the release includes the features you need, then use the same three files.

### Verification status

Tested in a Windows test vault. The section profile features and UI changes described here have not yet been verified on a physical iPhone.

## Upstream and feedback

The upstream author maintains and distributes the official plugin. There are no plans to submit this fork as a separate plugin to the Obsidian community plugin directory.

Please direct feedback and bug reports about this fork's additions to this fork. Do not report a fork-specific issue upstream unless you have confirmed that it also occurs in the upstream version.

## License and credits

[MIT License](./LICENSE). The upstream copyright and license notices are preserved.

- Original author: [Hiroya Iizuka](https://github.com/hiroyaiizuka)
- Fork maintainer: [midonon](https://github.com/midonon)
