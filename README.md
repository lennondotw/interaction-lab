# interaction-lab

A monorepo for interaction experiments — UI motion, gestures, view transitions, prototypes — built on a modern web/Node toolchain.

## About this workspace

This workspace ships several apps and shared packages under one roof. Each app is a self-contained experiment built on the same toolchain:

- Vite 6 for fast development and optimized builds
- Vitest for testing
- React 19 with latest hooks and features
- TypeScript 5.8 with strict type checking
- Tailwind CSS 4.0 for utility-first styling
- ESLint 9 with flat config system
- Complete ESM support for all configuration files
- Optimized developer experience with excellent IDE integrations

Currently, this template uses [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) which leverages [SWC](https://swc.rs/) for Fast Refresh.

## Key Features

- ✨ Full ES Module support
- 🧪 Vitest for testing
- 📐 All configuration files written in ESM with strict TypeScript type checking and JSDoc annotations, providing excellent IDE code suggestions
- 🎨 Using Tailwind CSS 4.0
- 🛠️ Separate tsconfig files for source code and configuration files
- 📏 Well-written, standardized ESLint Flat Config
- 🤖 Good Cursor Rules, AI programming friendly
- 📦 Using Corepack and pnpm package manager

## Before using this template

Use `pnpm update --latest` to update the dependencies to the latest versions.

```bash
pnpx update --latest
```

Remove `pnpm-lock.yaml` from `.gitignore` .
