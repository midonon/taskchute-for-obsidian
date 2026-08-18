# TaskChute Plus

[日本語](./README.ja.md)

TaskChute Plus is an Obsidian plugin for deciding what to do now, carrying it out, and keeping a record of the results.

This repository is a fork of [hiroyaiizuka/taskchute-for-obsidian](https://github.com/hiroyaiizuka/taskchute-for-obsidian) that adds task estimates and capacity for each time section. It makes it easier to check whether task estimates fit when arranging a day's schedule.

## What's different in this fork

- Store an estimate in task frontmatter as `estimatedMinutes`.
- Enter an estimate as a basic field when creating a task.
- Edit an estimate directly from a task row.
- Show estimate and actual time side by side for completed tasks.
- Show each time section's total estimated time, capacity, utilisation bar, and warnings when capacity is reached or exceeded.

<img width="1782" height="769" alt="TaskChute Plus view showing task estimates, actual time, and time-section capacity" src="https://github.com/user-attachments/assets/96f872f1-7b94-4d32-a0e6-50c45bf118e3" />

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

A time-section header compares the sum of task estimates with the section duration. For example, `60/240m` means that a 240-minute time section contains 60 estimated minutes.

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
