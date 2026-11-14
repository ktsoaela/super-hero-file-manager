<div align="center">
  <img src="docs/logo.png" alt="Super Hero File Manager" width="128" style="background:#050607;padding:16px;border-radius:12px" />

  <h1>Super Hero File Manager</h1>

  <p><strong>A file manager that stacks a folder by size, largest first.</strong></p>

  <p>
    <a href="docs/"><img alt="Docs" src="https://img.shields.io/badge/docs-guide-547f72?style=flat-square" /></a>
    <img alt="Stack" src="https://img.shields.io/badge/Electron-Next.js-436659?style=flat-square" />
  </p>
</div>

**Author:** [Khotso Tsoaela](https://github.com/ktsoaela) (`@ktsoaela`)

---

**Super Hero File Manager** opens a folder as a list and as a stack. The stack is sorted by size. You can preview a file, find a name, copy onto a volume, and open a terminal in that folder.

The page is [`docs/index.html`](docs/index.html). The spoken walkthrough is [`docs/view.html`](docs/view.html). Turn on GitHub Pages for the `docs` folder on the `main` branch.

---

## Why Super Hero File Manager

- **Size, in order.** The largest item sits at the front of the stack. Arrow keys walk it.
- **Preview in place.** Space opens a file, or the contents of a folder, without leaving.
- **Find.** Ctrl+F searches this folder. Tab searches every subfolder.
- **Volumes.** The right rail is volumes, the desktop, and pins. Drag a row onto a volume to copy it.
- **A terminal.** Ctrl+J opens a shell in the folder you are looking at.

---

## Quick start

**Requirements:** Node.js, Windows.

```bash
npm install
npm run dev
```

| Goal | Command |
| --- | --- |
| Run the app | `npm run dev` → http://localhost:3123 |
| Build, then open | `npm start` |
| Open the last build | `npm run electron` |
| Voice view | Open [`docs/view.html`](docs/view.html) and press Listen |
| Record the walkthrough again | `python scripts/record_explainer.py` with `npx next dev -p 3123` already running |

---

## Documentation map

| Doc | Purpose |
| --- | --- |
| [docs/index.html](docs/index.html) | Static page, with the walkthrough video |
| [docs/view.html](docs/view.html) | Dark-mode desk you can listen to |
| [docs/explainer.mp4](docs/explainer.mp4) | Video of the system, with that voice |
