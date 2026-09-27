# dsh-upload-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that attaches photos and files from the chat composer.

**Photos reach the model as real image content. Files reach it through a Context injection block.** Your own message text stays yours — nothing is pasted into your draft, and no instruction is spliced into what you send.

---

## Why this exists

A model can only read what it is given. Out of the box, the DSH composer has no attach affordance, and the obvious workaround — write the file's path into your message and ask the model to go read it — has three failure points and pollutes your own text.

This plugin adds the affordance, and picks the shortest correct route for each kind of attachment:

| Attachment | How the model gets it | Instruction needed? |
|---|---|---|
| **Photo** | Native draft image — the image bytes ride in the message content | **No.** The model sees the picture. |
| **File** | A reference chip in your draft; a Context injection block carries the read instruction | Yes, as a separate block |

That asymmetry is deliberate. DSH's content-block vocabulary is `text`, `reasoning`, `image`, `tool-call`, `tool-result` — there is no `file` block — so a document cannot be handed over the way an image can, and needs the instruction path instead.

---

## Features

### Attaching

- **📷 Add photo** (`/photos`) — pick one or many images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`). They are admitted as **native draft images**, so the model receives the image itself. Nothing is typed into your composer.
- **📄 Add file** (`/files`) — pick one or many documents (`.txt`, `.pdf`, `.json`, `.csv`, source code, archives…). They are uploaded to the workspace and a **reference chip** is minted into your draft.
- **📂 Uploaded files** (`/uploads`) — browse everything uploaded in this session and re-reference it with one click.
- Both `[📷]` and `[📄]` also sit **directly on the composer toolbar**, left of the model button, so you never have to open the `+` menu.
- The `/photos` command and the `[📷]` button run **the same code path**, so the two entry points cannot drift apart.

### The attachment rail

- The rail draws exactly the files your **live draft** references, so it empties itself once you send. There is no separate plugin-side list to get out of sync.
- Removing an attachment with `✕` deletes only that chip. **Text you have already typed is preserved.**
- Photos do not appear on this rail — they are DSH's own native draft images, rendered and removed by the composer itself.

### Injection: one shot per send

- The read instruction travels as a **Context injection** row, the same way DSH injects its own context — it is **not** part of your message.
- **One shot per send.** The live attachment set is handed to the host and consumed when the next turn starts, so **the message after a send carries no instruction** unless you attach again. There is no pending queue.
- A file-only message also carries one invisible zero-width character. That is not decoration: DSH silently refuses to send a message with no text and no images, and the chip's serialization is what keeps an attach-then-send alive.

### Model + reasoning effort

- The composer keeps **DSH's own model selector** — this plugin does not take that seat over.
- An **effort button** sits to its left, offering the levels the model declares on the Host plus a **Custom…** row for a value the catalog does not list.
- The list is built from the Host's own vocabulary, so it can never offer a level the Host would reject. **A model that declares no reasoning shows no effort button at all** — see [Enabling the effort button](#enabling-the-effort-button).

### Vision declarations

- **Settings → Vision** gives you one checkbox per model, grouped by provider, writing `input: ["text", "image"]` into that model's row. Turning one off removes the `input` key.
- The page writes into the **same settings document the Models page owns**, addressed at exactly `providers.<id>.models`, so **every other field of the row and the provider survives** — including fields this plugin knows nothing about.
- It reads the document back immediately before writing and sends an `expectedRevision`, so a concurrent edit is refused ("the configuration just changed elsewhere") rather than overwritten.
- It subscribes to `settings/document-updated` for its namespace, so it stays fresh when another surface changes the document.
- **This is a declaration, not a probe.** The page states that a model is declared able to read images; it never checks whether the upstream actually serves them.

---

## Requirements

- **DeepSeek Harness** with the `web` profile.
- **Node.js** and **pnpm** for a source install.

---

## Installation

### From GitHub (recommended)

```bash
dsh plugin --profile web add github:danhcng3822f/dsh-upload-plugin
```

or with pnpm directly:

```bash
pnpm --prefix ~/.dsh/profiles/web add github:danhcng3822f/dsh-upload-plugin
```

DSH registers the plugin into the `web` profile for you — no hand-editing configuration files. Restart DSH or reload `http://127.0.0.1:3080`.

### From a local checkout (development)

```bash
git clone https://github.com/danhcng3822f/dsh-upload-plugin.git
cd dsh-upload-plugin
pnpm install
pnpm run build
pnpm --prefix ~/.dsh/profiles/web add link:/path/to/dsh-upload-plugin
```

---

## Configuration

### Enabling vision for a model

For a model from a custom provider to be able to read images, its row needs the `image` modality:

```json
{
  "id": "claude-opus-5-thinking",
  "name": "Claude Opus 5 Thinking",
  "input": ["text", "image"]
}
```

You can write that by hand, or use **Settings → Vision** in the UI.

A model that does **not** declare vision still accepts an attached photo — the plugin only warns. Because the photo now travels as real image content, the provider refuses that turn outright rather than the model quietly ignoring an instruction.

### Enabling the effort button

A model declared by hand in your settings carries **no reasoning metadata** until you declare it, and the Host reports none — which is why the effort button can be absent on a model that plainly reasons.

Add `reasoningEfforts` to the model's row:

```json
{
  "id": "your-model",
  "name": "Your Model",
  "input": ["text", "image"],
  "reasoningEfforts": { "off": null, "low": "low", "medium": "medium", "high": "high" }
}
```

- Each **key** is a level the menu offers; each **value** is the wire spelling sent to the provider.
- `off` may be `null`, meaning *supported, send no parameter* — for most providers not thinking is the parameter's absence.
- The levels the Host recognises are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. A level you leave out is simply not offered.

---

## Troubleshooting

**The effort button does not appear.**
The model declares no reasoning. Add `reasoningEfforts` to its row as above — this is the single most common cause, and it is a declaration you have to make, not a bug.

**The model does not seem to see an attached photo.**
Check that the model's row declares `input: ["text", "image"]`. Then confirm the provider actually serves image content: this plugin states a declaration, it cannot probe the upstream for you.

**A message with only a file attached does nothing when I press Enter.**
DSH refuses a message with no text and no images. The plugin keeps a zero-width character on the chip so this does not happen; if you have removed the chip by hand, type something or re-attach.

**The instruction row appears on a message that has no attachment.**
It should not. The attachment set is consumed when a turn starts; if you see this, the client's sync and the host's consumption have gone out of step — please open an issue with what you did.

---

## Development

```bash
pnpm install     # install dependencies
pnpm test        # Vitest — 167 unit tests over the pure logic
pnpm run build   # tsc for the host half, esbuild for the browser bundle
```

The suite runs in a plain `node` environment with no DOM, so it covers the pure logic — record arithmetic, the admission planner, the effort menu, the settings read-modify-write, the injection handler — while the rendered components are exercised by hand in a running harness.

---

## Project structure

```text
dsh-upload-plugin/
├── src/
│   ├── types.ts                   # Shared API and data types
│   ├── instruction.ts             # The read instruction — ONE definition, shared by host and client
│   ├── index.ts                   # Host entry (Cordis plugin, web server endpoints, context injection)
│   ├── host/
│   │   ├── endpoints.ts           # Vision check, upload, list, view and ref sync
│   │   ├── file-utils.ts          # File identity and unique path resolution
│   │   ├── refs-store.ts          # Live attachment set per session (host-held, client-pushed)
│   │   ├── context-injection.ts   # Injects the instruction into the next turn via `agent/pre-step`
│   │   └── llm-modules.d.ts       # Harness contracts the host half consumes
│   └── client/
│       ├── index.ts               # Client entry (loaded into the browser)
│       ├── commands.ts            # /photos, /files and /uploads registrations
│       ├── attachment-bar.ts      # The composer rail and the lightbox viewer
│       ├── attachments.ts         # Attachment records and pure list operations
│       ├── attachment-store.ts    # Per-session record store (localStorage)
│       ├── reference.ts           # The `vision` reference source and chip minting
│       ├── ref-sync.ts            # Pushes the live attachment set to the host as the draft changes
│       ├── intake.ts              # Native image admission, shared by 📷 and /photos
│       ├── effort.ts              # Builds the effort menu from the Host's metadata
│       ├── vision-setting.ts      # Read-modify-write of one model row's `input` field
│       ├── platform-modules.d.ts  # Types for platform modules that cannot be installed from npm
│       ├── composer/
│       │   ├── attach-buttons.tsx # The 📷 and 📄 toolbar buttons
│       │   ├── effort-control.tsx # The effort button, left of the model button
│       │   └── icons.tsx          # This plugin's own glyphs
│       ├── settings/
│       │   └── vision-section.tsx # The Settings → Vision page
│       └── uploader.ts            # File picker and upload
├── lib/
│   ├── index.js                   # Compiled host bundle
│   └── client.js                  # Compiled browser bundle
├── tests/                         # Vitest unit tests
├── cordis.patch.yml               # Cordis dependency-injection configuration
├── LICENSE                        # MIT
└── package.json
```

---

## License

Released under the [MIT License](LICENSE).
