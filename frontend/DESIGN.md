# TechSpar DESIGN.md

Phase 1: Modern Minimal Frontend Refresh

## Design direction

TechSpar is an AI interview training workspace. The interface should feel professional, quiet, focused, and data-driven.

Keywords:
- Modern
- Minimal
- Professional
- Focused
- Low-noise
- Data-aware

Core principle:
The product is for serious interview practice. UI should reduce friction and visual noise, not compete with the training task.

## Phased roadmap

### Phase 1: Low-risk shell and entry experience

Scope:
- Global design tokens
- App background and surfaces
- Header / navigation
- Home / training entry page
- Login page
- 404 page
- Topic card component

Goal:
Establish the visual language and improve the first-touch flow without changing backend APIs or core business logic.

### Phase 2: Core product pages

Scope:
- Interview page
- Review page
- Profile page
- History page
- Knowledge page
- Graph page

Goal:
Apply the same minimal language to high-frequency workflows, especially chat, scoring, feedback and progress visualization.

### Phase 3: Admin and polish

Scope:
- Admin users
- Admin content
- Admin settings
- Empty/loading/error state unification
- Micro-interactions
- Accessibility pass

Goal:
Make the full product consistent, easier to maintain and more polished.

## Tokens

### Colors

Dark theme defaults:
- bg: #0f172a
- bg-soft: #111827
- card: rgba(30, 41, 59, 0.72)
- surface: rgba(15, 23, 42, 0.74)
- hover: rgba(51, 65, 85, 0.72)
- input: rgba(15, 23, 42, 0.82)
- border: rgba(148, 163, 184, 0.18)
- text: #f8fafc
- dim: #94a3b8
- muted: #64748b
- accent: #3b82f6
- accent-hover: #2563eb
- accent-light: #60a5fa
- teal: #2dd4bf
- green: #10b981
- red: #ef4444
- orange: #f59e0b

Light theme keeps the same structure but shifts surfaces to white/slate neutrals.

### Typography

Font stack:
Inter, DM Sans, -apple-system, BlinkMacSystemFont, Noto Sans SC, system-ui, sans-serif

Usage:
- Page hero: 40-60px, bold, tight tracking
- Section heading: 20-28px, bold
- Card heading: 15-18px, semibold
- Body: 14-16px, 1.6-1.8 line-height
- Metadata/kickers: 10-12px, uppercase, wide tracking

### Radius

- Small controls: 12-16px
- Cards: 24-32px
- Pills: 999px

### Shadows

Use soft deep shadows only for layered panels. Prefer border + translucent surface over heavy shadows.

## Components

### Button

Base class: ts-btn

Variants:
- ts-btn-primary: gradient accent, used for primary CTA
- ts-btn-secondary: subtle bordered surface, used for secondary actions

Rules:
- Primary CTA should appear once per decision area
- Disabled state uses opacity and cursor-not-allowed
- Hover can move up by 1px max

### Input

Base class: ts-input

Rules:
- Always include a visible label
- Placeholder is helper text, not label replacement
- Focus ring must be visible
- Error state should include message text, not only red border

### Card

Classes:
- glass-card: major panels and hero areas
- soft-panel: nested panels and lower-emphasis content

Rules:
- Use generous padding
- Prefer one clear purpose per card
- Avoid unnecessary decorative gradients

## Phase 1 acceptance checklist

- Header is sticky and minimal
- Desktop nav has clear active state
- Mobile nav works through a compact menu
- Home page presents value, training choices, and start CTA clearly
- Login page is modern and focused, with disabled/loading/error states
- 404 page has clear explanation and recovery actions
- Frontend builds successfully
- Docker frontend container is redeployed
- Live service returns app HTML and the built JS bundle contains Phase 1 markers
