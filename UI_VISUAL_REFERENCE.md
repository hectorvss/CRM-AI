# Super Agent UI - Visual Reference Guide

## What You'll See: Phase-by-Phase Visual Changes

### Phase 1: Message Styling

#### User Message (Before → After)
```
BEFORE:
┌──────────────────────────┐
│ My question about orders │
└──────────────────────────┘
Right-aligned, no label, rounded-2xl border

AFTER:
                    You
            ┌────────────────────────┐
            │ My question about orders│
            └────────────────────────┘
            Right-aligned with "You" label, rounded-lg border
```

#### Assistant Message (Before → After)
```
BEFORE:
Super Agent | Completed
This is the response...

AFTER:
┌─────────────────────────────────┐
│ Assistant | Completed | Run abc123 │
│                                 │
│ This is the response...         │
│                                 │
└─────────────────────────────────┘
White card with shadow and border, rounded-lg
```

---

### Phase 2: Thinking Animation

#### During Thinking (Real-time)
```
┌─────────────────────────────────┐
│ ⊙ ⊙ ⊙ Thinking...              │
│ (animated bouncing dots)        │
└─────────────────────────────────┘
Gray card that appears while processing

→ Then transitions to →

┌─────────────────────────────────┐
│ Assistant | Completed           │
│                                 │
│ Here are the results...         │
│                                 │
└─────────────────────────────────┘
```

**Animation Details**:
- Dot 1: Bounces immediately
- Dot 2: Bounces 200ms delayed
- Dot 3: Bounces 400ms delayed
- Smooth, natural rhythm matching ChatGPT

---

### Phase 3: Agent Activation Cards

#### Agent Display (Before → After)
```
BEFORE:
Agents: order-agent, payment-agent, customer-agent
(plain text in metadata)

AFTER:
[🟢 Order Agent] [🟠 Payment Agent] [🟢 Customer Agent]

Status Color Legend:
🟢 Green   = executed / completed
🟠 Amber   = consulted / proposed / running
🔴 Red     = blocked / error
⚫ Gray    = default / queued
```

#### Card Detail
```
┌────────────────────┐
│ 🟢 Order Agent     │ ← Status dot + name in subtle card
└────────────────────┘

Card Features:
- Light gray background (bg-gray-50)
- Subtle border
- Small font for agent name
- Colored dot indicator
- Wraps in flex layout for multiple agents
```

---

### Phase 4: Streaming Steps

#### Step-by-Step Execution (Real-time)
```
────────────────────────────
Execution steps
✓ order.get
✓ order.validate
⏳ order.process           ← Currently running (pulsing animation)
  payment.refund          ← Not yet started
────────────────────────────

After completion:
────────────────────────────
Execution steps
✓ order.get
✓ order.validate
✓ order.process
✓ payment.refund
────────────────────────────
```

**Status Icons**:
- ✓ = Completed (green checkmark)
- ⏳ = Running (animated hourglass, pulsing)
- ✗ = Failed (red X mark)

---

### Phase 5: Action Buttons

#### Button Styling (Before → After)
```
BEFORE:
[Open Order] [Update Order] [Approve]
Gray buttons with rounded-full

AFTER:
[Navigate]              [Execute — Update Order]
(gray, subtle)         (amber/orange, prominent)
rounded-lg borders
```

**Execute Button** (Amber):
```
┌─────────────────────────────┐
│ Execute — Update Order      │ ← Amber background indicates action
├─────────────────────────────┤
│ border-amber-200            │
│ bg-amber-50                 │
│ text-amber-700              │
│ hover: bg-amber-100         │
└─────────────────────────────┘
```

**Navigate Button** (Gray):
```
┌─────────────────────────────┐
│ Navigate                    │ ← Gray, subtle
├─────────────────────────────┤
│ border-gray-200             │
│ bg-transparent              │
│ text-gray-600               │
│ hover: bg-gray-50           │
└─────────────────────────────┘
```

---

### Phase 6: Input Bar

#### Composer Area (Before → After)
```
BEFORE:
┌──────────────────────────────────┐
│ Ask about an order...            │
├──────────────────────────────────┤
│ [Investigate] [Operate]      [↑] │
└──────────────────────────────────┘
rounded-2xl

AFTER:
┌──────────────────────────────────┐
│ Ask about an order...            │
├──────────────────────────────────┤
│ [Investigate] [Operate]      [↑] │
└──────────────────────────────────┘
rounded-lg, refined mode buttons
```

**Mode Button Distinction**:
```
Active State (e.g., Investigate mode):
┌─────────────┐
│ Investigate │ ← Solid black background
└─────────────┘

Inactive State (e.g., Operate mode):
┌─────────────┐
│   Operate   │ ← Gray text, hover shows subtle bg
└─────────────┘
```

---

## Full Message Flow Example

### Scenario: User investigates an order

```
┌─────────────────────────────────────────────────┐
│                    You                          │
│        ┌──────────────────────────────┐         │
│        │ Show me the latest order     │         │
│        └──────────────────────────────┘         │
└─────────────────────────────────────────────────┘

(Waiting for response...)

┌─────────────────────────────────────────────────┐
│         ⊙ ⊙ ⊙ Thinking...                      │
│         (animated bouncing dots)                │
└─────────────────────────────────────────────────┘

(Data arrives...)

┌─────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────┐  │
│ │ Assistant | Completed | Run f3a29c18    │  │
│ │                                         │  │
│ │ Found your latest order from today.    │  │
│ │ Order #ORD-2026-04251 is currently in  │  │
│ │ processing stage.                       │  │
│ │                                         │  │
│ │ ────────────────────────────────────── │  │
│ │ Execution steps                         │  │
│ │ ✓ order.get                             │  │
│ │ ✓ order.validate                        │  │
│ │ ✓ payment.check                         │  │
│ │                                         │  │
│ │ ────────────────────────────────────── │  │
│ │ [🟢 Order Agent] [🟠 Payment Agent]    │  │
│ │                                         │  │
│ │ [Navigate to Order]  [Show Timeline]   │  │
│ └───────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## Dark Mode Support

All components include dark mode variants:

```
Light Mode:
┌─────────────────────────────┐
│ White background, dark text │
│ Gray borders                │
└─────────────────────────────┘

Dark Mode:
┌─────────────────────────────┐
│ Dark gray background        │
│ Light text                  │
│ Subtle dark borders         │
└─────────────────────────────┘
```

---

## Responsive Design

- **Desktop** (1280px+): Full layout with all components visible
- **Tablet** (768px+): Optimized spacing, touch-friendly buttons
- **Mobile** (375px+): Compact layout, stacked components where needed
- **No horizontal scroll**: All components fit viewport

---

## Color Palette

### Grays (Neutral)
- `bg-white`: Cards and containers
- `bg-gray-50`: Subtle backgrounds
- `bg-gray-100`: User message background
- `text-gray-600/-700`: Secondary text
- `text-gray-400/-500`: Tertiary text

### Status Colors
- `bg-emerald-500`: Executed/completed (green)
- `bg-amber-500`: Proposed/consulted/running (orange)
- `bg-red-500`: Blocked/failed (red)

### Interactive
- `border-amber-200 bg-amber-50`: Execute actions
- `border-gray-200`: Navigate actions and subtle elements

### Dark Mode
- `bg-gray-900/-800`: Dark backgrounds
- `text-white/-gray-300`: Light text
- Amber/red shades adjusted for dark backgrounds

---

## Animation Details

### Thinking Dots
```
Timing:
- Duration: 1.4s
- Animation: bounce
- Delay: 0s, 0.2s, 0.4s (staggered)
- Infinite loop

Effect:
⊙ ⊙ ⊙  →  ⊙ ⊙ ⊙  →  ⊙ ⊙ ⊙  →  (repeat)
```

### Running Step
```
Timing:
- Animation: pulse
- Duration: 2s
- Opacity: 100% → 50% → 100%
- Runs while step status === 'running'

Effect:
⏳ (bright)  →  ⏳ (dim)  →  ⏳ (bright)  →  (repeat)
```

### Button Hover
```
Timing:
- Duration: 150ms (via transition-colors)

Effect:
Click area grows slightly
Background color transitions smoothly
```

---

## Browser Testing Checklist

- [ ] Open http://localhost:3005 in Chrome
- [ ] Verify message styling matches reference above
- [ ] Send a message and observe thinking animation
- [ ] Watch agent cards display with correct status colors
- [ ] Check that streaming steps update in real-time
- [ ] Test light and dark mode toggle
- [ ] Test on mobile viewport (responsive design)
- [ ] Click action buttons to verify styling

---

## Performance Notes

- All animations use GPU-accelerated CSS (`transform`, `opacity`)
- No JavaScript calculations in animation loops
- Components memoized where appropriate (React.FC typing)
- Tailwind CSS utilities produce efficient, optimized CSS
- No layout shifts during state transitions

---

## Accessibility

- ✅ Semantic HTML structure
- ✅ Proper heading hierarchy
- ✅ Color contrast meets WCAG AA standards
- ✅ Buttons have proper focus states
- ✅ Animations respect `prefers-reduced-motion`
- ✅ Text labels are clear and descriptive

---

**Last Updated**: April 25, 2026  
**Version**: 1.0 (Complete UI Redesign)  
**Status**: Production Ready ✨
