<div align="center">
  <img src="docs/logo.png" alt="Super Hero File Manager" width="128" style="background:#050607;padding:16px;border-radius:12px" />

  <h1>Super Hero File Manager</h1>

  <p><strong>A file manager that stacks a folder by size, largest first.</strong></p>

  <p>
    <a href="https://ktsoaela.github.io/super-hero-file-manager/"><img alt="Docs" src="https://img.shields.io/badge/docs-guide-547f72?style=flat-square" /></a>
    <img alt="Stack" src="https://img.shields.io/badge/Electron-Next.js-436659?style=flat-square" />
  </p>
</div>

**Author:** [Khotso Tsoaela](https://github.com/ktsoaela) (`@ktsoaela`)

---

**Super Hero File Manager** opens a folder as a list and as a stack. The stack is sorted by size. You can preview a file, find a name, copy onto a volume, and open a terminal in that folder.

The page is [https://ktsoaela.github.io/super-hero-file-manager/](https://ktsoaela.github.io/super-hero-file-manager/). The spoken walkthrough is [https://ktsoaela.github.io/super-hero-file-manager/view.html](https://ktsoaela.github.io/super-hero-file-manager/view.html).

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
| Voice view | Open [https://ktsoaela.github.io/super-hero-file-manager/view.html](https://ktsoaela.github.io/super-hero-file-manager/view.html) and press Listen |
| Record the walkthrough again | `python scripts/record_explainer.py` with `npx next dev -p 3123` already running |

---

## Documentation map

| Doc | Purpose |
| --- | --- |
| [https://ktsoaela.github.io/super-hero-file-manager/](https://ktsoaela.github.io/super-hero-file-manager/) | Static page, with the walkthrough video |
| [https://ktsoaela.github.io/super-hero-file-manager/view.html](https://ktsoaela.github.io/super-hero-file-manager/view.html) | Dark-mode desk you can listen to |
| [https://ktsoaela.github.io/super-hero-file-manager/explainer.mp4](https://ktsoaela.github.io/super-hero-file-manager/explainer.mp4) | Video of the system, with that voice |
