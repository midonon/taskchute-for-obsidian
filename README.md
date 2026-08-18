# TaskChute Plus

[日本語](./README.ja.md)

TaskChute Plus is an Obsidian plugin for execution-first task management.

This is a maintained fork of [hiroyaiizuka/taskchute-for-obsidian](https://github.com/hiroyaiizuka/taskchute-for-obsidian). It focuses on a practical question: can today's task estimates fit in the time that is actually available?

## What's different in this fork

- Store a planned duration for each task in `estimatedMinutes` frontmatter.
- Enter the estimate in the basic new-task form.
- Edit an estimate directly from the task row, including when it is not set.
- Show labelled estimate and actual time together for completed tasks.
- Compare each time slot's total estimate with its capacity.
- Indicate available, full, and over-capacity slots with a utilisation bar.
- Provide Japanese and English UI text for the added controls.

The estimate and capacity features are still being refined through daily use. The next area under consideration is configurable section profiles, such as weekday and weekend slot layouts. See the changelog for the full list of unreleased changes.

## Install

### GitHub Releases

When a release is available, download `main.js`, `manifest.json`, and `styles.css` from that release. Copy them into the `taskchute-plus` plugin directory in your vault, then enable the plugin in Obsidian.

### Build from source

Use this for the current development branch or before a release exists.

```bash
git clone https://github.com/midonon/taskchute-for-obsidian.git
cd taskchute-for-obsidian
npm install
npm run build
```

Copy these files into the `taskchute-plus` plugin directory in your vault:

- `main.js`
- `manifest.json`
- `styles.css`

Enable TaskChute Plus from Obsidian's Community plugins settings. This enables the local copy only; this fork is not listed as a separate Community Plugin.

## Estimates and section capacity

Set an estimate while creating a task, or select the estimate text in a task row to edit it. Saving an empty value clears the estimate.

```md
---
tags:
  - task
target_date: 2026-04-16
scheduled_time: 09:00
estimatedMinutes: 30
---

# Prepare weekly review
```

A time-slot header compares the sum of task estimates with its duration. For example, `60/240m` means 60 estimated minutes in a 240-minute slot.

## Upstream

For TaskChute's general workflow, commands, settings, and official plugin distribution, see the [upstream repository](https://github.com/hiroyaiizuka/taskchute-for-obsidian). The upstream author manages the official distribution; this fork is not submitted as a separate Obsidian Community Plugin.

## Development

Node.js 18+ and npm are required.

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

Use `npm run dev` for esbuild watch mode during local development.

## Feedback

Report issues or suggestions for this fork in the [issue tracker](https://github.com/midonon/taskchute-for-obsidian/issues).

## License and credits

This repository remains available under the [MIT License](./LICENSE). Copyright and license notices for the original project are preserved.

- Original project: [Hiroya Iizuka](https://github.com/hiroyaiizuka)
- Fork maintenance: [midonon](https://github.com/midonon)
