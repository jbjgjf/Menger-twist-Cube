# Menger Twist Cube

Browser MVP for a rotational 3D puzzle based on a level-1 Menger sponge.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Vercel deployment

This repo is configured for Vercel (`vercel.json`) and Vite output:

1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Framework preset: **Vite** (auto-detected).
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Click Deploy.

If previous builds failed with TypeScript lib errors (`Set`, `Map`, `WeakMap`, `Iterable`), this repo now uses a root `tsconfig.json` with modern libs (`ES2022`, `DOM`, `DOM.Iterable`) so Vercel's TypeScript step uses the correct configuration.
