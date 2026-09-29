# UI Language Toggle Design

## Goal

Let users switch the chatbot tester interface between Vietnamese and English. Vietnamese is the initial default. Keep the selected language after reload.

## User-facing behavior

- Add a compact `VI | EN` two-option selector beside the existing theme button.
- Mark the active language accessibly and update the document's `lang` attribute when it changes.
- Translate app-owned navigation, labels, buttons, hints, placeholders, status text, validation messages, and transient notifications across all workspace tabs.
- Persist the choice in local storage under a language-specific key. If the stored value is missing or invalid, use Vietnamese.
- Changing language updates visible app UI without clearing conversation, session, scenario, replay, simulator, or history state, and without making network requests.

## Translation architecture

- Add a small first-party `i18n.js` module with complete Vietnamese and English catalogs and a `t(key, values)` lookup with safe fallback for missing keys.
- Mark static HTML copy with translation keys. Support text content and the UI attributes that need translation, such as placeholders, titles, and accessible labels.
- Replace app-owned dynamic UI strings with catalog lookups, including runtime-created elements, status summaries, and toasts.
- Initialize the selected language before normal UI rendering; on selection, update `document.documentElement.lang`, static copy, and app-rendered UI from existing state.
- Do not add dependencies or change the conversation/API data model.

## Content boundaries

Translate interface chrome and explanatory copy. Preserve user and bot messages, scenario names/messages/expectations, configuration-provided names, AI evaluator summaries/check reasons, backend response payloads, and JSON export keys/format as data. Translate fixed app-authored text surrounding raw errors, but do not rewrite the raw error itself.

## Alternatives considered

1. **Central translation catalogs plus static keys and dynamic lookups (selected):** consistent across all tabs, keeps translations together, and supports runtime state without replacing user data.
2. **Duplicate a full HTML interface per language:** duplicates markup and risks behavior drifting between copies.
3. **Translate only selected tabs:** smaller change, but does not meet the approved all-UI scope.

## Validation and delivery

- Review the catalog for matching key coverage in both languages.
- Run JavaScript syntax checks and `git diff --check`; do not run tests, browser QA, or live API calls unless separately requested.
- No CI or live verification is part of this design.

## Open implementation detail

The language selector's exact visual treatment should follow the current header controls and remain usable at narrow widths; it must not replace or alter the theme toggle.
