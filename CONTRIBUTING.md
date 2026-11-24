# Contributing to NEXUS

**English · [Português (Brasil)](CONTRIBUTING.pt-BR.md)**

Thanks for your interest! A few ground rules to keep the project simple and secure.

## Running locally

```bash
npm install
npm run setup-pty
npm start
```

`Ctrl+Shift+F12` opens the UI's DevTools.

## Before opening a PR

- **One change per PR**, describing what changes and why. Visual change: include a screenshot.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat: …`, `fix: …`, `docs: …`).
- No bundler or framework in the UI: plain JavaScript in `src/renderer/`.
- New dependencies only when truly needed, pinned to an exact version (`npm install --save-exact`).
- Run `node --check` on the files you touched and test the app by actually opening it.
- Issues and PRs in English or Portuguese are both fine.

## Security rules

- The UI keeps `sandbox` and `contextIsolation`, without `nodeIntegration`.
- No `innerHTML` with external data (file names, command output, processes): use `textContent`.
- The app doesn't make internet calls on its own. If a feature needs the network, it must be optional and
  only act when the user asks (like the mini browser).
- The mini browser page never gets a preload, Node or access to the `window.nexus` bridge.
- New IPC channels validate what they receive in `main.js`.

## Screenshots

Changed the look? Regenerate the README images with:

```bash
npm run screenshots
```

They use demo mode, with fake data. Never commit screenshots showing your user, IP or files.
