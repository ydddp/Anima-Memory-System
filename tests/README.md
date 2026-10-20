# Regression checks

Run with Node.js 22.7+ (no install or browser required):

```sh
node --test tests/*.test.cjs
```

The suite imports the actual browser-compatible parser and vendored repair
library. It executes the summary parsing/saving section in an isolated VM with
dictionary and worldbook writes captured in memory, so malformed responses must
fail before either write. Inputs are synthetic, anonymized examples.

Coverage includes unescaped dialogue quotes, nested tags mistaken for summaries,
status updates, incomplete responses, dictionary extraction, schema validation,
plain-text compatibility, and preservation of existing escapes and content.

## Tag rule regressions

`tag-rules.test.cjs` runs the actual tag compiler and existing text-processing
engine. It checks literal labels, multiline/repeated matches, deletion before
extraction, conservative legacy recognition, exact unchanged saves, custom
expressions and validation. It never modifies a settings profile.

The normal editor offers body extraction, whole-block deletion, removal before
a single label, and removal after a single label. Both single-label operations
use the first occurrence and remove the label itself; a missing label leaves the
original text unchanged (apart from the engine's existing outer whitespace trim).

## Regex list browser regression

The layout check uses the actual shared rule component, CSS (including injected
panel styles), all six consumer constructors, add bindings and save callbacks,
with jQuery/Sortable assets from a SillyTavern checkout. Install Playwright in
your development environment and its Chromium browser, then run:

```sh
SILLYTAVERN_ROOT=/path/to/SillyTavern node tests/regex-layout.browser.cjs
```

Set `ANIMA_UI_OUTPUT` to a screenshot directory if desired. The check covers
320/360/390/430/768/1280px widths, visible regex text, control/input bounds,
editing, cancellation, saving, toggling, adding, deleting and the sorting save
callback, exact legacy preservation and modal isolation. It also runs the entire
GC modal at its body mount to check draft cancellation and the original content
storage field at the persistence boundary. Host reads/writes are captured in
memory. It does not exercise physical touch dragging or a logged-in profile.

Set `ANIMA_CHROMIUM_PATH` when using a separately installed Chromium executable.
