# Changelog

This changelog records changes maintained in this fork. It begins with work
that has not yet been released from this repository.

## Unreleased

### Added

- Store per-task estimates in `estimatedMinutes` frontmatter.
- Add an estimate field to the basic new-task form and validate positive whole
  minutes.
- Let users edit estimates directly from task rows, including tasks without an
  existing estimate.
- Show labelled estimates and actual time together for completed tasks.
- Show each time slot's estimated total, capacity, utilisation bar, and
  full/over-capacity state.
- Add Japanese and English translations for estimate and capacity UI.

### Changed

- Keep task-row time, estimate, actual-time, and action columns stable across
  tasks with different estimate states.
