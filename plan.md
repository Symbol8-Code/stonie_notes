# Block-Based Pen Interpretation System — Implementation Plan

## Concept

The canvas becomes the primary container. When you lasso-select pen strokes and create a block, those strokes are **extracted into a sub-block** positioned at their original canvas location. Each sub-block supports **multiple variations** (original pen, interpreted text, visual interpretation, meeting notes) that you can flip between with a page-fold transition. Sub-blocks are draggable, interpretable, editable, and copyable entities on the free-form canvas.

---

## Phase 1: Data Model (`models.ts`, `cardBlocks.ts`)

**New types in `models.ts`:**

```typescript
type VariationType = 'strokes' | 'readText' | 'interpret' | 'meetingNotes'

interface SubBlockVariation {
  id: string
  type: VariationType
  strokes?: PenStroke[]           // For 'strokes' type (original pen)
  markdown?: string               // For 'readText' type
  interpretation?: CanvasInterpretation  // For 'interpret' type
  meetingNotes?: MeetingNotesResult      // For 'meetingNotes' type
  createdAt: string
}

interface SubBlock {
  id: string
  x: number        // Logical canvas coordinates
  y: number
  width: number
  height: number
  variations: SubBlockVariation[]  // Index 0 is always original strokes
  activeVariationIndex: number
}
```

**Extend `ContentBlock`:**
```typescript
interface ContentBlock {
  id: string
  type: SectionType
  textContent: string
  drawingContent: PenStroke[]
  subBlocks?: SubBlock[]           // NEW — sub-blocks within this canvas
}
```

**New helpers in `cardBlocks.ts`:**
- `nextSubBlockId()` — generates IDs with `sb_` prefix
- `computeStrokeBounds(strokes)` — AABB with padding
- `createSubBlockFromStrokes(strokes)` — builds sub-block with stroke variation at index 0

No database schema changes needed — sub-blocks serialize as part of the existing `bodyText` JSON.

---

## Phase 2: Lasso → Create Sub-Block (`PenCanvas.tsx`)

**Extend `PenCanvasHandle`:**
- `getSelectedStrokes()` — returns deep-cloned selected strokes + bounds, removes them from `strokesRef`, pushes undo action, clears selection

**New props on `PenCanvasProps`:**
- `onCreateSubBlock?: (data: { strokes: PenStroke[]; bounds }) => void`
- `onTransformChange?: (scale: number, panX: number, panY: number) => void`

**Triggers for sub-block creation:**
1. **Floating button** — "Create Block" button positioned near the lasso selection bounds
2. **Keyboard shortcut** — `Ctrl+B` when lasso selection is active
3. **Context menu** — "Create Block" item in the firm-press context menu

---

## Phase 3: Sub-Block State in SectionBlock (`CardEditor.tsx`)

- Add `subBlocks` state to `SectionBlock`
- Handle `onCreateSubBlock` callback: call `createSubBlockFromStrokes()`, append to state
- Bubble changes up via `onSubBlocksChange` prop to `CardEditor` for persistence/auto-save
- Track canvas transform via `onTransformChange` to position overlays correctly

---

## Phase 4: SubBlockOverlay Component (NEW: `SubBlockOverlay.tsx`)

A positioned `<div>` overlay rendered on top of the canvas:

- **Position**: `absolute`, coordinates = `subBlock.x * scale + panX`, etc.
- **Content rendering** based on active variation type:
  - `strokes` → `StrokePreview` component
  - `readText` → `MarkdownPreview` component
  - `interpret` → items/relationships summary
  - `meetingNotes` → formatted meeting notes
- **Drag handle** at top (captures pointer events, prevents canvas drawing)
- **Variation switcher** — dots/tabs at bottom showing each variation
- **Toolbar** — appears on hover/select with interpret actions
- **Pointer events**: overlay container is `pointer-events: none`, individual sub-blocks are `pointer-events: auto`

**Rendering structure in SectionBlock:**
```tsx
<div style={{ position: 'relative' }}>
  <PenCanvas ... />
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {subBlocks.map(sb => <SubBlockOverlay key={sb.id} ... />)}
  </div>
</div>
```

---

## Phase 5: Sub-Block Dragging (`SubBlockOverlay.tsx`)

- Drag handle captures `pointerdown` + `stopPropagation()`
- `pointermove` computes delta in logical coords (screen delta / scale)
- `pointerup` commits position via callback
- Only the drag handle is draggable (not the whole area) to avoid pen conflicts

---

## Phase 6: Variation Switching with Page-Fold Transition (`app.css`, `SubBlockOverlay.tsx`)

**CSS**: `perspective` + `rotateY` transforms
- Exiting: 0° → 90° (250ms)
- Entering: -90° → 0° (250ms)
- `backface-visibility: hidden`

**State**: `displayedIndex` + `transitioning` flag to prevent rapid switching

**UI**: Dots per variation, labels on hover (Original, Text, Visual, Notes)

---

## Phase 7: Sub-Block Interpretation (`SubBlockOverlay.tsx` / `SectionBlock`)

1. Get strokes from `variations[0].strokes`
2. Render to offscreen canvas (reuse existing pattern from `handleInterpret`)
3. Call existing API:
   - `interpretCanvas(dataUrl, cardId, 'readText', blockId:subBlockId)` for text
   - `interpretCanvas(dataUrl, cardId, undefined, blockId:subBlockId)` for visual
   - `writeMeetingNotes(dataUrl, '', cardId)` for meeting notes
4. Create `SubBlockVariation` with result
5. Replace existing variation of same type, or append
6. Switch to new variation (triggers page-fold)

No server changes needed — existing endpoints accept arbitrary `blockId` strings.

---

## Phase 8: Sub-Block Operations

| Operation | Behavior |
|-----------|----------|
| **Delete** | Remove sub-block, re-insert original strokes back into parent block |
| **Copy** | Store full `SubBlock` in module-level clipboard |
| **Paste** | Deep-clone with new ID, offset position by 20px |
| **Reinterpret** | Re-run interpretation, replace existing variation of that type |

**Keyboard shortcuts** (when sub-block is selected):
- `Delete`/`Backspace`: delete
- `Ctrl+C` / `Ctrl+V`: copy / paste
- `Escape`: deselect
- Arrow keys: nudge position (1px, 10px with Shift)

---

## Phase 9: Polish & Edge Cases

- Clamp sub-blocks to stay within visible canvas area
- Minimum sub-block size of 40×40px
- Empty sub-block placeholder (if strokes erased)
- Inactive SectionBlock: composite sub-block strokes back for StrokePreview
- Draft persistence: include sub-blocks in localStorage drafts

---

## Files Changed

| File | Changes |
|------|---------|
| `client/src/types/models.ts` | Add `SubBlock`, `SubBlockVariation`, `VariationType`; extend `ContentBlock` |
| `client/src/utils/cardBlocks.ts` | Add `createSubBlockFromStrokes`, `computeStrokeBounds`, `nextSubBlockId` |
| `client/src/components/PenCanvas.tsx` | Add `getSelectedStrokes`, `onCreateSubBlock`, `onTransformChange` props, "Create Block" trigger |
| `client/src/components/CardEditor.tsx` | Sub-block state in SectionBlock, overlay container, creation/interpret/delete callbacks |
| `client/src/components/SubBlockOverlay.tsx` | **NEW** — overlay rendering, drag, variation display, page-fold, interpret toolbar |
| `client/src/styles/app.css` | Page-fold transition CSS classes |
