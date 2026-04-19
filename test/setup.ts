// Register jest-dom custom matchers (toBeInTheDocument, toHaveTextContent, etc.)
// with Vitest's expect. The side-effect import extends `expect` at runtime; the
// triple-slash reference pulls the matcher type augmentations into the TS world
// (so `expect(el).toBeInTheDocument()` typechecks everywhere under tsconfig.json).
/// <reference types="@testing-library/jest-dom/vitest" />
import '@testing-library/jest-dom/vitest';
