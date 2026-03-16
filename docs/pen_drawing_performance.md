# Pen Drawing Performance: Event Path & Improvement Areas

## Event Path Overview

The pen drawing pipeline has 3 phases: pointer down (setup), pointer move (hot path), and pointer up (commit). All drawing state is stored in refs to avoid React re-renders during active drawing.

---

## Phase 1: `handlePointerDown` (PenCanvas.tsx:760)

1. Reads cached bounding rect (`cachedRectRef`) — avoids `getBoundingClientRect()` per event
2. `canvas.setPointerCapture(e.pointerId)` — locks all future events to this canvas
3. If 2 pointers detected → enters pinch mode, returns early
4. For pen tool:
   - Sets `drawingRef.current = true`
   - Creates `currentStrokeRef.current = { points: [firstPoint], color, width, lineStyle }`
   - Color/width/lineStyle read from **refs** (not props)
5. **No React state changes** — entirely ref-based

## Phase 2: `handlePointerMove` — HOT PATH (PenCanvas.tsx:820)

Takes a fast exit at the very top when `drawingRef.current && currentStrokeRef.current`:

```
1. e.getCoalescedEvents()         → get all batched stylus events (4-8 per frame on stylus)
2. For each coalesced event:
   getPoint(ce)                   → screenToLogical() coord transform, reads pressure/tilt/timestamp
   currentStroke.points.push(pt)  → append to existing array
3. For solid lines (common case):
   getCtx()                       → cached ref lookup (created once with desynchronized: true)
   ctx.setTransform(ds,0,0,ds,dx,dy) → apply zoom/pan (no save/restore)
   ctx.lineCap/lineJoin/strokeStyle/lineWidth → set stroke properties
   ctx.beginPath()                → only draw NEW segments (not full redraw)
   ctx.moveTo(lastExistingPoint)
   ctx.lineTo(newPoints...)
   ctx.stroke()                   → render to canvas
   ctx.setTransform(dpr,0,0,dpr,0,0) → reset transform
4. return                         → skip all other handler logic (eraser, lasso, pinch)
```

**What does NOT happen in the hot path:**
- No React state updates
- No DOM manipulation
- No full canvas redraw
- No buffer invalidation
- No localStorage save
- No callback to parent component

## Phase 3: `handlePointerUp` — Stroke Commit (PenCanvas.tsx:935)

1. `drawingRef.current = false`
2. If stroke has >1 point, calls `onStrokeDrawnRef.current(stroke)`:
   - **CardEditor.tsx:977** `handleStrokeDrawn`: checks if stroke centroid falls inside a sub-block
   - If inside sub-block: routes stroke there → `updateSubBlocks()` → `setSubBlocks()` → **React state update**
   - If not consumed: pushes to `strokesRef`, `undoStackRef`, marks buffer dirty
3. `notifyUndoState()` → `setCanUndo(true)` → **React state update** (but PenCanvas memo ignores it)
4. `notifyStrokeComplete()` → starts 2-second debounce timer for localStorage save
5. `currentStrokeRef.current = null`
6. `redraw()`:
   - Clears entire canvas
   - `updateBuffer()` — if buffer dirty, re-renders ALL completed strokes to offscreen canvas
   - Blits offscreen buffer to visible canvas
   - Draws lasso overlay (if any)

---

## React Re-render Protection

PenCanvas is wrapped in `memo(forwardRef(...))` with a custom comparator:
```typescript
(prev, next) => {
  prev.color === next.color &&
  prev.strokeWidth === next.strokeWidth &&
  prev.lineStyle === next.lineStyle &&
  prev.tool === next.tool &&
  prev.className === next.className &&
  prev.initialStrokes === next.initialStrokes
}
```

All callback props are stored in refs (`onStrokeCompleteRef`, `onStrokeDrawnRef`, etc.) so callback identity changes don't cause re-renders or re-create handlers.

| Event | Triggers React re-render? | Re-renders PenCanvas? |
|-------|--------------------------|----------------------|
| `handlePointerMove` (drawing) | No | No |
| `handlePointerUp` → `notifyUndoState` | Yes (`setCanUndo`) | No — memo ignores |
| `handlePointerUp` → consumed by sub-block | Yes (`setSubBlocks`) | No — memo ignores |
| `handleStrokeComplete` timer fires | No (localStorage only) | No |
| `handleCanvasTransformChange` (zoom) | Yes (`setCanvasTransform`) | No — memo ignores |
| Context menu show/hide | Yes (`setContextMenuVersion`) | No — memo ignores |

## Event Listener Stability

Event listeners are attached natively (not React synthetic) via `useEffect` at line 1008:
```typescript
canvas.addEventListener('pointerdown', handlePointerDown)
canvas.addEventListener('pointermove', handlePointerMove)
canvas.addEventListener('pointerup', handlePointerUp)
```

The `useEffect` depends on `[handlePointerDown, handlePointerMove, handlePointerUp]`. If any handler identity changes, listeners are detached and re-added — potentially dropping events mid-stroke.

All inner callbacks use `useCallback(fn, [])` with empty deps (reading from refs), so they should be identity-stable.

---

## Remaining Possible Lag Sources (Investigation Areas)

### 1. `desynchronized` canvas context may not be active
Even with `{ desynchronized: true }`, some browsers silently fall back. The drawing still goes through the browser's normal compositing pipeline (GPU sync, display refresh), adding ~16ms latency.

**To verify:** Log `ctx.getContextAttributes().desynchronized` after creation. If `false`, the optimization isn't working.

**Fix options:**
- Use `OffscreenCanvas` with a worker for drawing
- Investigate `WebGL` for direct GPU rendering

### 2. SubBlockOverlay DOM compositing
The `.subblock-overlay-container` div sits on top of the canvas with `pointer-events: none`. Even with pointer-events disabled, the browser still composites this layer every frame. If there are many sub-blocks with complex overlays, this adds compositor overhead over the canvas.

**To verify:** Temporarily remove the overlay container and test drawing latency. Check Chrome DevTools → Layers panel for unnecessary compositing layers.

**Fix options:**
- Hide overlay entirely during active drawing (set `display: none` on pointerdown, restore on pointerup)
- Move sub-block rendering into the canvas itself (eliminate DOM overlay)

### 3. Per-event `ctx.stroke()` calls
Each pointer move event does a full `beginPath/moveTo/lineTo/stroke` cycle. On a high-frequency stylus (Apple Pencil 240Hz, Surface Pen 120Hz), this can mean 120-240 `stroke()` calls per second. Each `stroke()` forces the browser to flush the canvas drawing pipeline.

**To verify:** Profile with Chrome DevTools → Performance tab. Look for `CanvasRenderingContext2D.stroke` taking significant time.

**Fix options:**
- Batch draw commands and only call `stroke()` once per `requestAnimationFrame`
- Accumulate points in the fast path, render them all in a single rAF callback:
```typescript
// In handlePointerMove: just accumulate points
pendingPointsRef.current.push(...newPoints)
if (!rafPendingRef.current) {
  rafPendingRef.current = requestAnimationFrame(() => {
    // Draw all accumulated segments in one stroke() call
    const pts = pendingPointsRef.current
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
    pendingPointsRef.current = []
    rafPendingRef.current = null
  })
}
```

### 4. Pressure-based lineWidth changes per segment
`ctx.lineWidth = baseWidth * (0.3 + p0 * 1.2)` changes for each coalesced event group. Changing `lineWidth` between segments may prevent the browser from batching GPU draw calls internally.

**To verify:** Temporarily use a fixed lineWidth and compare latency.

**Fix options:**
- Use a fixed lineWidth during the fast path, only apply pressure variation in the final redraw
- Group consecutive points with similar pressure and draw them in a single stroke

### 5. `getPoint()` screen-to-logical conversion overhead
Each coalesced event calls `getPoint()` which calls `screenToLogical()`. This is simple math but happens for every event (potentially 4-8x per pointermove).

**Likely not the bottleneck** but can be inlined for zero overhead:
```typescript
const invScale = 1 / scaleRef.current
const panX = panXRef.current
const panY = panYRef.current
for (const ce of coalescedEvents) {
  const sx = ce.clientX - rect.left
  const sy = ce.clientY - rect.top
  points.push({
    x: (sx - panX) * invScale,
    y: (sy - panY) * invScale,
    pressure: ce.pressure,
    tiltX: ce.tiltX,
    tiltY: ce.tiltY,
    timestamp: ce.timeStamp,
  })
}
```

### 6. Full redraw on `handlePointerUp`
When the pen lifts, `redraw()` re-renders ALL completed strokes via the offscreen buffer (if dirty), then blits to the visible canvas. For many strokes this could cause a visible pause at the end of each stroke.

**To verify:** Add a `performance.now()` measurement around the `redraw()` call in `handlePointerUp`.

**Fix options:**
- Keep the incremental canvas state and only do a full redraw when zoom/pan changes
- On pointerUp, just add the completed stroke to the buffer without clearing the visible canvas

### 7. `cachedRectRef` might be null
If `cachedRectRef.current` is null (e.g. before first resize observer callback), `getPoint()` falls back to `canvas.getBoundingClientRect()` which forces a synchronous layout recalculation. This is expensive and would stall the hot path.

**To verify:** Add a console.warn when the fallback is hit.

**Fix:** Ensure `cachedRectRef` is populated before any pointer events can fire (initialize it eagerly in the mount effect).

### 8. Event listener re-attachment during drawing
If any `useCallback` dependency is accidentally unstable, the `useEffect` re-runs mid-stroke, removing and re-adding listeners. This could cause dropped frames or lost events.

**To verify:** Add a `console.log('listeners reattached')` in the useEffect body and check if it fires during drawing.

---

## Recommended Investigation Order

1. **Check `desynchronized` is actually active** (quick, high impact if it's falling back)
2. **Profile `ctx.stroke()` frequency** in DevTools Performance tab (identifies if per-event drawing is the bottleneck)
3. **Test with overlay hidden** during drawing (identifies DOM compositing overhead)
4. **Batch draws to rAF** if #2 shows stroke() overhead (likely highest-impact code change)
5. **Measure `redraw()` duration** on pointerUp (identifies end-of-stroke pause)
6. **Check `cachedRectRef` fallback** frequency (quick fix if it's firing)
