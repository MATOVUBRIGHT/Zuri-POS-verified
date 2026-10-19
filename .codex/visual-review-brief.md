Objective: Refresh the existing Zuri POS application so shared cards, inputs, buttons, dialogs, popovers, and page shells feel intentionally designed by a product team rather than generated from one repeated template.

Constraints:
- Keep existing pages, labels, routes, and business behavior.
- Do not redesign individual workflows or remove useful information.
- Use the existing Tailwind/shadcn primitives and current brand colors.
- Reduce excessive rounded corners, repetitive shadows, oversized padding, and empty white space.
- Make dialogs and form controls consistent, compact, and clearly layered.
- Avoid decorative gradients and generic glassmorphism.

Write scope:
- src/components/ui/card.tsx
- src/components/ui/dialog.tsx
- src/components/ui/input.tsx
- src/components/ui/textarea.tsx
- src/components/ui/select.tsx
- src/components/ui/button.tsx
- src/index.css

Implementation should be conservative and preserve accessibility, focus states, disabled states, and mobile behavior. Report changed files and any assumptions.
