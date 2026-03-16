# Agent Guidelines for koh-tools

This is a React + TypeScript + Vite project for displaying a collection of tools.

## Build Commands

```bash
npm run dev       # Start development server
npm run build     # Type-check and build for production
npm run preview   # Preview production build locally
```

- Build output goes to `dist/` directory
- Type-checking is done via `tsc -p tsconfig.json --noEmit`

### Running a Single Test

This project has no test suite configured.

## Code Style Guidelines

### General Principles

- Write clean, readable code with minimal complexity
- No comments unless explaining non-obvious logic
- Prefer explicit over implicit

### TypeScript

- Use `strict: true` (enabled in tsconfig.json)
- Always type function parameters and return values
- Use `type` for object shapes, `interface` for extendable types
- Use `unknown` when the type is uncertain, narrow with type guards

```typescript
// Good
function normalizeTool(raw: unknown): Tool | null {
  if (!raw || typeof raw !== 'object') return null
  // ...
}

// Avoid
function normalizeTool(raw: any): Tool | null { /* ... */ }
```

### React

- Use function components with hooks
- Use `useMemo` for expensive computations
- Use `useCallback` for callback functions passed as props
- Prefer `type` over `interface` for component props unless extension needed

```typescript
// Good
type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; tools: Tool[] }
  | { status: 'error'; message: string }
```

### Imports

- Use absolute imports from `./` or `../` (no relative `../../`)
- Import React hooks directly: `import { useState, useEffect } from 'react'`
- Use `import type` for type-only imports

```typescript
import { useEffect, useMemo, useState } from 'react'
import type { Tool } from './types'
import { normalizeTool, safeUrl } from './utils'
```

### Naming Conventions

- PascalCase for components and types: `App`, `LoadState`, `Tool`
- camelCase for variables, functions: `loadState`, `safeUrl`
- SCREAMING_SNAKE_CASE for constants (rarely used)
- Prefix boolean variables with `is`, `has`, `should`: `isLoading`, `hasError`

### Error Handling

- Use try/catch for async operations
- Provide meaningful error messages
- Handle unknown errors gracefully

```typescript
try {
  const res = await fetch('/data.json')
  if (!res.ok) throw new Error(`Failed to load: ${res.status}`)
} catch (e) {
  const message = e instanceof Error ? e.message : 'Unknown error'
  setLoadState({ status: 'error', message })
}
```

### CSS / Styling

- Use CSS classes (see `src/styles.css`)
- Avoid inline styles except for dynamic values
- Follow BEM-ish naming: `.navItem`, `.navItemActive`, `.navSection`

### Formatting

- Use 2 spaces for indentation
- No semicolons at end of statements
- Use single quotes for strings
- Trailing commas in objects and arrays
- Max line length ~100 characters (soft limit)

### Null Handling

- Use `??` for nullish coalescing: `counts.get(key) ?? 0`
- Use `?.` for optional chaining: `tool.categories?.length`
- Prefer `undefined` over `null` for optional values

### React Best Practices

- Use `aria-*` attributes for accessibility
- Use `key` prop in lists
- Use `type="button"` on button elements
- Use `rel="noreferrer"` when using `target="_blank"`

```tsx
<a href={url} target="_blank" rel="noreferrer">
  Link
</a>

<button type="button" onClick={handleClick}>
  Action
</button>
```

### File Organization

```
src/
  App.tsx         # Main application component
  main.tsx        # Entry point
  types.ts        # TypeScript type definitions
  utils.ts        # Utility functions
  styles.css      # Global styles
  vite-env.d.ts   # Vite type declarations
```

### Data Validation

- Validate external data (JSON imports) with type guards
- Use discriminated unions for state types
- Normalize external data on input (see `normalizeTool` in utils.ts)

### URLs and Links

- Always validate URLs before rendering: use `safeUrl()` utility
- Use `rel="noreferrer"` for external links

## Common Tasks

### Adding a new utility function

1. Add to `src/utils.ts`
2. Export with proper type annotations
3. Import where needed

### Adding a new type

1. Add to `src/types.ts`
2. Use `export type` for simple types
3. Import with `import type { NewType } from './types'`

### Modifying the UI

1. Update `src/App.tsx` for component changes
2. Update `src/styles.css` for styling changes
3. Test in development with `npm run dev`

## Notes

- This project has no ESLint or Prettier configured
- TypeScript's strict mode is enforced at build time
- The app fetches data from `/data.json` at runtime
