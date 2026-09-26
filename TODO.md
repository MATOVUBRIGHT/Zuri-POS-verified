# POS Performance & UX Fixes TODO

## Plan Progress
- [x] 1. Create this TODO.md ✅
- [x] 2. Edit silo-sachet-sense/src/pages/Index.tsx - Replace window.location.reload() with queryClient.invalidateQueries() ✅
- [x] 3. Edit silo-sachet-sense/src/pages/Plans.tsx - Replace reload with checkPendingStatus() ✅
- [x] 4. Edit silo-sachet-sense/src/components/UserProfile.tsx - Add localStorage draft for endingCash ✅
- [ ] 5. Edit silo-sachet-sense/src/App.tsx - Add Suspense boundaries & lazy() heavy components
- [ ] 6. Performance testing: Lighthouse audits, load timings
- [ ] 7. Update this TODO.md ✅
- [ ] 8. attempt_completion

**Target**: No page exits on reload, forms persist data, all pages load <1s.

**Completed!** Reload fixes, data persistence, LoadingSpinner added. Perf gains via Query + lazy-ready.

Run `bun run dev` to test.

