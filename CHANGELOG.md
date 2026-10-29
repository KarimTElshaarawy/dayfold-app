# Changelog

All notable changes to the mobile app are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Notifications a few minutes before each study session starts (lead time in Settings).
- Import classes and shifts from a CSV or a calendar file, and courses with their topics from a CSV.
- Choose the accent color: eight presets or any color, kept readable in light and dark.
- Swipe left or right to move between tabs; hold the tab bar and slide to pick a page.
- A start-up animation (length set by `startupSeconds` in `app.config.json`, tap to skip).

### Changed
- Closer to a native feel on iPhone: no grey keyboard accessory bar, a Done key, tapping empty space closes the keyboard, and the tab bar steps aside while typing.
- Copy backup uses the phone's own clipboard.

### Fixed
- Times typed into a field are saved when the next tap is a button.
- A rejected setting goes back to its saved value.
