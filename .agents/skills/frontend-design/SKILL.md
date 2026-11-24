# Frontend Design

Use this skill for visual and interaction changes in the MTG Deckbuilder project.

## Project intent

ArcaneForge is a dense deck-building workspace, not a marketing page. Every screen should help a player compare deck composition, inspect cards, build a deck, and check format legality quickly.

Preserve:
- Fast scanning over decorative empty space
- Compact data alongside card imagery
- Clear selected/current states
- Smooth panel and card transitions
- The three-zone desktop workspace: full deck list, center deck surface, card inspector

## Project design system

### Palette

Use the existing CSS variables in `src/index.css`:
- `--ink`: `#111820`
- `--ink-soft`: `#17202a`
- `--glass`: `rgba(18, 27, 35, 0.78)`
- `--glass-strong`: `rgba(14, 21, 28, 0.92)`
- `--line`: `rgba(177, 197, 208, 0.11)`
- `--line-strong`: `rgba(177, 197, 208, 0.19)`
- `--text-main`: `#edf2f4`
- `--text-soft`: `#9aa8b1`
- `--accent`: `#91adbc`
- `--accent-bright`: `#b1ccd8`

The primary surface is charcoal-blue, with muted steel-blue as the interaction accent. Do not introduce warm cream, neon green, or unrelated gradients. Card mana identities and rules states retain their semantic colors, but neutral chrome must stay consistent.

### Typography

Use Inter/system sans-serif with this hierarchy:
- Deck name: 18px, bold
- Section labels: 11px, semibold
- Card names: 12-14px, bold
- Supporting card text: 11-12px
- Dense table data: 10-12px

Avoid unnecessary tracked-out labels and all-caps text. Format names and rules/status text can remain compact but should read naturally.

### Shape and surfaces

- Use 6-8px radii for application panels.
- Use 4-5px radii for compact controls and card-stack mini panels.
- Reserve rounded pill shapes for quantities and small status indicators.
- Use hairline borders based on `--line`.
- Avoid repeated large card shadows and decorative gradients.
- Preserve card aspect ratios and card artwork as the strongest visual element.

## Layout

### Desktop

Use the persistent deck list on the left, the deck summary and card stage in the center, and the inspector on the right. Side panels are resizable and the center must recalculate its width from their open state.

Anchor major regions to the workspace rather than the viewport bottom:
- Header: 64px
- Workspace padding: 16px
- Left deck list: fixed to its workspace side and independent of the card stage
- Center: CSS grid with deck header, analytics, and card table rows
- Right inspector: fixed side panel with scrollable content

### Constrained width

At medium widths:
- Hide or condense the full deck list only if it would cover the center stage.
- Preserve at least the deck name, format controls, violation status, and card stage.
- Recalculate analytics to fit without overlap or clipped text.
- Truncate long names with ellipsis; never let them overlap adjacent values.
- Move the left deck list beside or below the card stage rather than allowing it to cover it.

At mobile widths:
- Use a horizontal deck-card strip or a compact scrollable list.
- Show the deck header and format selector in a single-column flow.
- Use a 2-column type-stack grid only when it fits.
- Keep the card stage usable through touch and wheel gestures.
- Card database and inspector panels should become overlays or use the available viewport cleanly.

### Card formations

The app supports both:
1. A single selected card stack for linear browsing.
2. Type-separated stacks grouped by primary type, with commander separated where applicable.

Keep these behaviors consistent:
- The header toggle is named `Stacks` or `Single stack`.
- Mini-stack quantities reflect the total card quantity, not only unique printings.
- Each mini-stack has independent wheel/touch navigation.
- The active card in a mini-stack updates the card inspector.
- The card stage uses selection, hover, and z-index changes rather than layout jumps.
- The stack index and count remain visible.

## Interaction and motion

- Use 180-220ms ease or cubic-bezier(`.2,.8,.2,1`) transitions.
- Animate card grouping, panel opening, and stack changes; do not animate every card or text element.
- A formation change should look like cards travelling into stacks, not a hard content swap.
- Wheel, touch, drag, and click navigation must change only the intended stack or selected card.
- Respect `prefers-reduced-motion`.
- Provide visible keyboard focus and meaningful button titles/labels.
- Do not use bounce or perpetual motion for notifications.

## Components

### Header

Keep the header lean:
- Product brand
- Card database toggle
- Inspector toggle
- Active deck selector
- New deck
- Playtest
- Stack/single-stack toggle
- Import/export
- Authentication actions

Do not add a separate competing rules tag when one is already in the deck header.

### Deck header

Show:
- Editable deck name
- Format selector
- One rules/legality badge
- Mainboard count
- Sideboard count for applicable formats
- Average CMC
- Total prices

The rules badge is the single status control and opens the rules popup.

### Analytics

Use a dense, three-column summary only where width permits:
- Mana curve
- Color identity
- Card types

When panels reduce the center width:
- Reduce section padding
- Use concise labels and ellipses
- Collapse repeated text first
- Never allow identity, CMC, or type values to overlap

### Card database

Card results are scannable rows:
- Thumbnail
- Card name
- Mana cost
- Type line
- Price
- Quick add actions

Long names and type lines truncate. Actions remain fixed and tappable.

### Inspector

The inspector should show:
- Card image
- Name and mana cost
- Type line
- Rules text
- Price
- Quick add action

Keep it scrollable inside its panel and preserve the card as the visual anchor.

## Responsive rules

Design at 1440px, 1280px, 1024px, 800px, and 390px equivalent widths.
- 1440px: show full deck list and usable center stage.
- 1280px: retain the deck list and reduce spacing before hiding data.
- 1024px: protect the center stage and condense side content.
- 800px: use horizontal deck strip and stacked viewport flow.
- 390px: prioritize deck name, format, card stage, and one open overlay panel.

Before finishing, verify:
1. The app builds.
2. Both side panels can open and resize without overlap.
3. The deck list shifts or overlays correctly.
4. Analytics remain legible at constrained widths.
5. Mini-stacks scroll independently.
6. Single-stack and separated-stack transitions work.
7. Mobile controls remain reachable and not clipped.
