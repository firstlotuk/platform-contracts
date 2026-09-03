/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Jest does not honor .gitignore. Without this, a git worktree checked out under
  // .claude/worktrees/ (or any other nested dir) gets its __tests__ collected AGAIN
  // alongside the real src/ tests — silently re-running an OLD package version's
  // tests via relative imports (they resolve within the worktree's own src/, not
  // this tree's), producing confusing duplicate suite counts and false-red/stale-
  // green rows if that old checkout's assertions no longer match current contracts.
  // Found 2026-09-03 via a Fable+Grok adversarial review after exactly this
  // happened with a stale v0.10.0 worktree under .claude/worktrees/.
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/', '/\\.git/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};
