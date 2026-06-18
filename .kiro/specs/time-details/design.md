# Design Document: Time Details

## Overview

The Time Details feature adds a unified resource-planning screen to the existing Groups module of Connect IT. It is inspired by HaloITSM-style resource dashboards and consolidates Activity Tracking, Planned Hours, Actual Hours, Forecasting, Timeline, Performance Status, and Visual Progress into one screen.

The implementation is entirely additive. A single new tab entry (`id: "time_details"`) is appended to the existing left-sidebar nav array in `Groups.tsx`, and a new `renderTimeDetails()` function is wired into the existing conditional-render block:

```tsx
{activeTab === "time_details" && renderTimeDetails()}
```

No existing routes, top-level sidebar items, pages, or modules are altered.

### Key Design Decisions

1. **Inline render function, not a separate routed page.** All other tabs in Groups use the same pattern (`renderDashboard`, `renderTimesheets`, etc.). Staying consistent avoids introducing a new route, a separate component mount cycle, and scroll-state conflicts.
2. **Real-time Firestore listeners for core data, separate activity listener for groups_activity.** The core collections (`groups_tasks`, `groups_events`, `groups_plans`) are already subscribed via `onSnapshot` in Groups.tsx. The `groups_activity` collection needs its own listener scoped to the selected date.
3. **Extracted sub-components in `src/components/groups/`.** The render function orchestrates layout and passes computed data downward; computation-heavy sub-sections are extracted to keep the function readable.
4. **Time-cards API with a 10-second timeout and local fallback.** The API is called inside a `useEffect` with `AbortController`; on timeout or error, the component falls back to `actualHours` from Firestore.

---

## Architecture

The Time Details screen lives entirely inside the Groups module. The high-level data flow is:

```
Firestore (onSnapshot)
  settings_groups   →  activeGroup (memberIds, group metadata)
  groups_tasks      →  tasks[]
  groups_events     →  events[]
  groups_plans      →  plans[]
  groups_activity   →  activityRecords[] (new listener, date-scoped)

External API
  /api/time-cards   →  timeCardData[] (with 10s timeout fallback)

Groups.tsx (state)
  ↓
  renderTimeDetails()
  ↓
  ┌────────────────────────────────────────────────┐
  │  Computation layer (pure helper functions)     │
  │  computeTeamSummary()                          │
  │  computeMemberStats()                          │
  │  computeForecast()                             │
  │  computeTimelineEntries()                      │
  └────────────────────────────────────────────────┘
  ↓
  Sub-components (src/components/groups/)
    TimeDetailsTeamSummary
    TimeDetailsActivityTracker
    TimeDetailsPlannedHours
    TimeDetailsActualHours
    TimeDetailsForecast
    TimeDetailsTimeline
    TimeDetailsPerformance
    TimeDetailsProgressBoxes
```

The `renderTimeDetails()` function in `Groups.tsx`:
- Holds its own local state: `activityDate` (selected date string), `activityRecords[]`, `timeCardHours` (Map from memberId → hours), `timeCardLoading` boolean.
- Derives all KPI values from the shared `tasks`, `events`, `plans`, and `activeGroup` state already held in Groups.tsx.
- Passes derived data as props to each sub-component.

---

## Components and Interfaces

### Tab Registration (Groups.tsx)

The existing tab list array gains one entry at the end:

```tsx
{ id: "time_details", label: "Time Details", icon: Clock }
```

`Clock` is already imported from `lucide-react`. The conditional render block gets one new line:

```tsx
{activeTab === "time_details" && renderTimeDetails()}
```

### renderTimeDetails() function (Groups.tsx)

Located inside the `Groups` function body, consistent with all other render functions. Manages only the state needed for the Time Details view:

```tsx
const [activityDate, setActivityDate] = useState<string>(
  new Date().toISOString().split("T")[0]
);
const [activityRecords, setActivityRecords] = useState<ActivityRecord[]>([]);
const [timeCardHours, setTimeCardHours] = useState<Map<string, number>>(new Map());
const [timeCardLoading, setTimeCardLoading] = useState<boolean>(false);
```

These are declared at the top of the `Groups` function body (not inside `renderTimeDetails`) so they survive re-renders, consistent with how `tasks`, `events`, etc. are managed.

The function body:
1. Derives `groupMembers` from `users` filtered by `activeGroup?.memberIds`.
2. Calls pure computation helpers to produce props.
3. Returns the full JSX layout.

### Sub-components

All sub-components live in `src/components/groups/`:

| Component | File | Props |
|---|---|---|
| `TimeDetailsTeamSummary` | `TimeDetailsTeamSummary.tsx` | `summary: TeamSummary` |
| `TimeDetailsActivityTracker` | `TimeDetailsActivityTracker.tsx` | `members`, `activityRecords`, `tasks`, `activityDate`, `onDateChange` |
| `TimeDetailsPlannedHours` | `TimeDetailsPlannedHours.tsx` | `members`, `tasks`, `events` |
| `TimeDetailsActualHours` | `TimeDetailsActualHours.tsx` | `members`, `tasks`, `timeCardHours`, `loading` |
| `TimeDetailsForecast` | `TimeDetailsForecast.tsx` | `forecast: ForecastData` |
| `TimeDetailsTimeline` | `TimeDetailsTimeline.tsx` | `members`, `entries: TimelineEntry[]`, `windowStart: Date` |
| `TimeDetailsPerformance` | `TimeDetailsPerformance.tsx` | `members`, `memberStats: MemberStats[]` |
| `TimeDetailsProgressBoxes` | `TimeDetailsProgressBoxes.tsx` | `memberStats: MemberStats[]` |

---

## Data Models

### TypeScript Interfaces

```typescript
// Represents a task document from groups_tasks
export interface GroupTask {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  assigneeId: string;
  assigneeName?: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: string;             // "To Do" | "In Progress" | "Review" | "Done" | null
  storyPoints?: number;
  estimatedHours: number | null;
  actualHours: number | null;
  dueDate?: string | null;    // ISO date string "YYYY-MM-DD"
  createdAt?: string;
}

// Represents an event document from groups_events
export interface GroupEvent {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  type: string;
  startDate: string;          // "YYYY-MM-DD"
  endDate?: string | null;    // "YYYY-MM-DD"
  estimatedHours: number | null;
  priority: string;
  assigneeId: string;
  status: string;             // "Planned" | "Completed" | "In Progress" | "Cancelled" | "Archived"
  dependencies?: string;
}

// Represents a forecast/plan document from groups_plans
export interface GroupPlan {
  id: string;
  groupId: string;
  type: "Weekly" | "Daily";
  objective: string;
  plannedWork: number | null;
  actualWork?: number;
  completionRate?: number;
  delayRate?: number;
  createdAt?: string;
}

// Represents a login/logout session from groups_activity
export interface ActivityRecord {
  id: string;
  groupId: string;
  userId: string;
  userName?: string;
  date: string;               // "YYYY-MM-DD"
  loginTime?: string | null;  // ISO datetime or "HH:MM"
  logoutTime?: string | null; // ISO datetime or "HH:MM"
}

// Per-member computed statistics used across multiple sections
export interface MemberStats {
  memberId: string;
  memberName: string;
  plannedHours: number;
  workedHours: number;        // sum of actualHours (all tasks)
  completedHours: number;     // sum of actualHours (Done tasks only)
  plannedTasks: number;
  completedTasks: number;
  hoursLogged: number;        // from time-cards API or fallback to workedHours
  latestDueDate: string | null;
  completionPercentage: number;
  performanceStatus: "green" | "red";
  progressBoxColor: "green" | "yellow" | "red";
}

// An entry that can be placed on the timeline (task or event)
export interface TimelineEntry {
  id: string;
  title: string;
  assigneeId: string;
  startDate: string;    // "YYYY-MM-DD"
  endDate: string;      // "YYYY-MM-DD" — single day if no endDate provided
  status: string;
  type: "task" | "event";
}

// Team-level summary KPIs
export interface TeamSummary {
  totalMembers: number;
  plannedHours: number;
  workedHours: number;
  remainingHours: number;
  completionPercentage: number;
}

// Forecast section KPIs
export interface ForecastData {
  futurePlannedHours: number;
  availableCapacity: number;
  utilizationPercentage: number;
}
```

### Firestore Data Layer

All core collections are already subscribed via real-time `onSnapshot` listeners in the `useEffect` block scoped to `selectedGroupId` in `Groups.tsx`. No new top-level listeners are needed for tasks, events, or plans.

**New listener: `groups_activity`**

A new `onSnapshot` listener is added to the existing `selectedGroupId` effect block:

```typescript
const unsubActivity = onSnapshot(
  query(
    collection(db, "groups_activity"),
    where("groupId", "==", selectedGroupId)
  ),
  (snap) => {
    setActivityRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityRecord)));
  }
);
```

The `activityDate` filter is applied in-component (client-side) rather than in the query, so that changing the date picker does not require a new Firestore round-trip.

**Time-cards API call**

Triggered from a `useEffect` inside `renderTimeDetails` (or co-located in Groups.tsx) whenever `selectedGroupId` or group members change:

```typescript
useEffect(() => {
  if (!selectedGroupId || groupMembers.length === 0) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  setTimeCardLoading(true);

  fetch(`/api/time-cards?groupId=${selectedGroupId}`, { signal: controller.signal })
    .then(res => res.json())
    .then((data: Array<{ userId: string; hours_worked: number }>) => {
      const map = new Map<string, number>();
      data.forEach(r => {
        map.set(r.userId, (map.get(r.userId) ?? 0) + r.hours_worked);
      });
      setTimeCardHours(map);
    })
    .catch(() => {
      // Fallback: use Firestore actualHours (timeCardHours stays empty,
      // ActualHours component checks map and falls back to workedHours)
      setTimeCardHours(new Map());
    })
    .finally(() => {
      clearTimeout(timeout);
      setTimeCardLoading(false);
    });

  return () => { controller.abort(); clearTimeout(timeout); };
}, [selectedGroupId, groupMembers.length]);
```

---

## Computation Logic

All computation functions are pure helpers (no side effects, no Firestore calls). They live in `src/components/groups/timeDetailsUtils.ts`.

### Status filtering helpers

```typescript
const EXCLUDED_STATUSES = ["Cancelled", "Archived", "cancelled", "archived"];

function isIncluded(status: string | null | undefined): boolean {
  return !EXCLUDED_STATUSES.includes(status ?? "");
}
```

### computeTeamSummary()

```typescript
export function computeTeamSummary(
  memberIds: string[],
  tasks: GroupTask[],
  events: GroupEvent[]
): TeamSummary {
  const totalMembers = memberIds.length;

  const plannedHours = [
    ...tasks.filter(t => isIncluded(t.status)),
    ...events.filter(e => isIncluded(e.status))
  ].reduce((sum, item) => sum + (item.estimatedHours ?? 0), 0);

  const workedHours = tasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);

  const remainingHours = Math.max(0, plannedHours - workedHours);

  const completionPercentage = plannedHours === 0
    ? 0
    : Math.round((workedHours / plannedHours) * 100);

  return { totalMembers, plannedHours, workedHours, remainingHours, completionPercentage };
}
```

### computeMemberStats()

```typescript
export function computeMemberStats(
  members: Array<{ id: string; name?: string; email?: string }>,
  tasks: GroupTask[],
  events: GroupEvent[],
  timeCardHours: Map<string, number>
): MemberStats[] {
  return members.map(member => {
    const memberId = member.id;
    const memberName = member.name || member.email || memberId;

    const assignedTasks = tasks.filter(t => t.assigneeId === memberId);
    const assignedEvents = events.filter(e => e.assigneeId === memberId);

    // Planned hours: sum estimatedHours for non-cancelled/archived tasks+events
    const plannedHours = [
      ...assignedTasks.filter(t => isIncluded(t.status)),
      ...assignedEvents.filter(e => isIncluded(e.status))
    ].reduce((sum, item) => sum + (item.estimatedHours ?? 0), 0);

    // Worked hours: sum actualHours across ALL tasks (all statuses)
    const workedHours = assignedTasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);

    // Completed hours: actualHours only for Done tasks
    const completedHours = assignedTasks
      .filter(t => t.status === "Done")
      .reduce((sum, t) => sum + (t.actualHours ?? 0), 0);

    // Planned tasks: tasks that are NOT Done (null status counts as non-Done)
    const plannedTasks = assignedTasks.filter(t => t.status !== "Done").length;

    // Completed tasks: tasks with status "Done"
    const completedTasks = assignedTasks.filter(t => t.status === "Done").length;

    // Hours logged: from time-cards API or fallback to workedHours
    const hoursLogged = timeCardHours.has(memberId)
      ? timeCardHours.get(memberId)!
      : workedHours;

    // Latest due date among assigned tasks
    const dueDates = assignedTasks
      .map(t => t.dueDate)
      .filter((d): d is string => !!d)
      .sort();
    const latestDueDate = dueDates.length > 0 ? dueDates[dueDates.length - 1] : null;

    // Completion percentage (per-member): zero planned = 100%
    const completionPercentage = plannedHours === 0
      ? 100
      : Math.round((completedHours / plannedHours) * 100);

    // Performance status
    const performanceStatus: "green" | "red" =
      completedHours >= plannedHours ? "green" : "red";

    // Progress box color
    const progressBoxColor: "green" | "yellow" | "red" =
      completionPercentage >= 100 ? "green"
      : completionPercentage >= 60 ? "yellow"
      : "red";

    return {
      memberId, memberName, plannedHours, workedHours, completedHours,
      plannedTasks, completedTasks, hoursLogged, latestDueDate,
      completionPercentage, performanceStatus, progressBoxColor
    };
  });
}
```

### computeForecast()

```typescript
export function computeForecast(
  totalMembers: number,
  workedHours: number,
  plans: GroupPlan[]
): ForecastData {
  const futurePlannedHours = plans.reduce(
    (sum, p) => sum + (p.plannedWork ?? 0), 0
  );

  const availableCapacity = totalMembers === 0
    ? 0
    : Math.max(0, totalMembers * 40 - workedHours);

  const utilizationPercentage = totalMembers === 0
    ? 0
    : Math.round(((workedHours / (totalMembers * 40)) * 100) * 10) / 10;

  return { futurePlannedHours, availableCapacity, utilizationPercentage };
}
```

### computeTimelineEntries()

```typescript
export function computeTimelineEntries(
  tasks: GroupTask[],
  events: GroupEvent[]
): TimelineEntry[] {
  const taskEntries: TimelineEntry[] = tasks
    .filter(t => t.startDate || t.dueDate)  // tasks with any date anchor
    .map(t => ({
      id: t.id,
      title: t.title,
      assigneeId: t.assigneeId,
      startDate: (t as any).startDate || t.dueDate || "",
      endDate: t.dueDate || (t as any).startDate || "",
      status: t.status?.toLowerCase() || "planned",
      type: "task" as const
    }));

  const eventEntries: TimelineEntry[] = events.map(e => ({
    id: e.id,
    title: e.title,
    assigneeId: e.assigneeId,
    startDate: e.startDate,
    endDate: e.endDate || e.startDate,   // single-day if no endDate
    status: e.status?.toLowerCase() || "planned",
    type: "event" as const
  }));

  return [...taskEntries, ...eventEntries];
}
```

### computeActivityForDate()

```typescript
export function computeActivityForDate(
  activityRecords: ActivityRecord[],
  memberId: string,
  date: string             // "YYYY-MM-DD"
): { loginTime: string | null; logoutTime: string | null; workingHours: string | null; isActive: boolean } {
  const records = activityRecords
    .filter(r => r.userId === memberId && r.date === date)
    .sort((a, b) => (b.loginTime ?? "").localeCompare(a.loginTime ?? ""));

  if (records.length === 0) {
    return { loginTime: null, logoutTime: null, workingHours: null, isActive: false };
  }

  const latest = records[0];
  const hasLogin = !!latest.loginTime;
  const hasLogout = !!latest.logoutTime;
  const isActive = hasLogin && !hasLogout;

  let workingHours: string | null = null;
  if (hasLogin && hasLogout) {
    const start = new Date(latest.loginTime!);
    const end = new Date(latest.logoutTime!);
    const diffMs = end.getTime() - start.getTime();
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60_000));
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    workingHours = `${hh}:${mm}`;
  }

  return {
    loginTime: latest.loginTime ?? null,
    logoutTime: latest.logoutTime ?? null,
    workingHours,
    isActive
  };
}
```

---

## Section-by-Section UI Layout

All sections share the existing project styling conventions:
- Container: `bg-white dark:bg-slate-900 p-6 rounded-xl border border-border`
- Section header: `text-xs font-bold uppercase tracking-wider text-muted-foreground`
- KPI label: `text-[10px] uppercase font-bold text-muted-foreground block`
- KPI value: `text-3xl font-bold block my-1.5`
- Table header: `border-b border-border uppercase font-black tracking-wider text-muted-foreground text-xs`
- Table row: `hover:bg-muted/10 divide-y divide-border/60`

### Section 1: Team Summary

**Layout:** A 5-column KPI card grid (`grid grid-cols-2 md:grid-cols-5 gap-4`), identical in structure to the Group Dashboard KPIs row.

| Card | Value source | Color |
|---|---|---|
| Total Team Members | `summary.totalMembers` | `text-blue-600` |
| Planned Hours | `summary.plannedHours` | `text-indigo-600` |
| Worked Hours | `summary.workedHours` | `text-emerald-600` |
| Remaining Hours | `summary.remainingHours` | `text-amber-500` |
| Completion % | `summary.completionPercentage%` | `text-violet-600` |

Each card renders: label (10px uppercase), large numeric value (3xl bold), and a short descriptor line (10px muted).

### Section 2: Activity Tracker

**Layout:** Date picker above a full-width table.

Date picker: `<input type="date" value={activityDate} onChange={...} />` styled with the project's border/rounded-lg convention. Default = today.

Table columns: Employee Name, Login Time, Logout Time, Working Hours, Assigned Tickets, Completed Tickets.

Rendering rules per row:
- If `isActive` → Login Time shown, Logout Time = badge `"Active"` (emerald), Working Hours = `"Active"`.
- If both times present → format and display `HH:MM` for Working Hours.
- If no record → `"—"` for Login, Logout, and Working Hours.
- Assigned Tickets: count tasks where `assigneeId = member.id`, `status !== "Done"`, and `createdAt` date ≤ selected date.
- Completed Tickets: count tasks where `assigneeId = member.id`, `status === "Done"`, and a `completedAt` or `dueDate` on the selected date.

Empty state (no members): centered italic text `"No members in this group."` inside the table body.

### Section 3: Planned Hours

**Layout:** Full-width table.

Columns: Employee Name, Planned Hours, Planned Tasks, Planned Completion Date.

Data sourced from `MemberStats` per member. Planned Completion Date formatted as `MMM D, YYYY` using `new Date(latestDueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })`. Displays `"N/A"` if `latestDueDate` is null.

Empty state: `"No members assigned to this group."` in place of table rows.

### Section 4: Actual Hours

**Layout:** Full-width table with optional loading overlay.

Columns: Employee Name, Hours Worked, Hours Logged, Completed Tasks.

Hours Worked: `memberStats.workedHours`.
Hours Logged: `memberStats.hoursLogged` (from time-cards API or fallback).
Completed Tasks: `memberStats.completedTasks`.

When `timeCardLoading` is `true`, a subtle spinner or skeleton row is shown in the Hours Logged column. When the API fails, Hours Logged shows the same value as Hours Worked with no error message visible to the user (silent fallback).

### Section 5: Forecast Information

**Layout:** 3-column KPI card grid (`grid grid-cols-1 md:grid-cols-3 gap-4`).

| Card | Value | Format |
|---|---|---|
| Future Planned Hours | `forecast.futurePlannedHours` | `X.X hrs` |
| Available Capacity | `forecast.availableCapacity` | `X hrs` |
| Utilization % | `forecast.utilizationPercentage%` | `X.X%` |

Cards use the same styling as Section 1 KPI cards.

### Section 6: Timeline View

**Layout:** Horizontal scrollable grid.

Structure:
- Left column (fixed, 140px): member names, one row per member.
- Right area (scrollable): 14 columns, one per day (today through today+13).
- Column headers: abbreviated day + date number (`Mon 16`).
- Each row height: 40px.

**Bar Pixel Calculation:**

The timeline area width is derived from the container: each day column = `containerWidth / 14` pixels.

For a `TimelineEntry` assigned to a given member:
1. Clip `startDate` to `max(windowStart, entry.startDate)`.
2. Clip `endDate` to `min(windowEnd, entry.endDate)`.
3. If clipped start > clipped end: skip (entry fully outside window).
4. `barLeft = daysDiff(windowStart, clippedStart) × dayWidth`
5. `barWidth = max(2, (daysDiff(clippedStart, clippedEnd) + 1) × dayWidth)`

**Title Display Threshold:**

If `barWidth >= 80`: render `<span className="truncate text-[10px] px-1">{entry.title}</span>` inside the bar.
If `barWidth < 80`: omit title text entirely.

**Color Coding:**
- `status === "planned"` → `bg-blue-500`
- `status === "completed"` or `status === "in_progress"` → `bg-emerald-500`
- All other statuses → `bg-slate-400` (fallback)

**Single-day fallback:** Events/tasks with no `endDate` receive `endDate = startDate`, rendering a single column-wide bar.

**Empty row:** Members with no entries in the window still render an empty row with the day-column grid visible (dashed separator lines).

### Section 7: Performance Status

**Layout:** Full-width table.

Columns: Employee Name, Planned Hours, Completed Hours, Status.

Status column: colored badge/dot.
- Green: `bg-emerald-50 text-emerald-700 border-emerald-100` + text `"On Track"`
- Red: `bg-rose-50 text-rose-700 border-rose-100` + text `"Behind"`

Zero Planned Hours → green status, "On Track".

### Section 8: Visual Progress Boxes

**Layout:** Responsive grid (`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`).

Each box:
```
┌─────────────────────────────┐
│  Member Name (bold)          │
│  Planned: X hrs              │
│  Completed: X hrs            │
│  Completion: XX%  (large)    │
└─────────────────────────────┘
```

Color classes by tier:

| Tier | Background | Border | Text accent |
|---|---|---|---|
| Green (≥100%) | `bg-emerald-50 dark:bg-emerald-950/30` | `border-emerald-300` | `text-emerald-700` |
| Yellow (60–99%) | `bg-amber-50 dark:bg-amber-950/30` | `border-amber-300` | `text-amber-700` |
| Red (<60%) | `bg-rose-50 dark:bg-rose-950/30` | `border-rose-300` | `text-rose-700` |

Zero Planned Hours renders the green tier and shows `100%`.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Hours summation with null-coalescing

*For any* array of tasks and/or events with arbitrary `estimatedHours` or `actualHours` values (including `null`, `undefined`, and zero), the computed sum must equal the sum of all numeric values treating null/undefined as 0. This holds at both the team level and the per-member level.

**Validates: Requirements 2.3, 2.4, 4.2, 5.2, 6.2**

### Property 2: Remaining Hours is floored at zero

*For any* combination of `plannedHours` and `workedHours` values (including cases where `workedHours > plannedHours`), the computed Remaining Hours must be `max(0, plannedHours - workedHours)` and must never be negative.

**Validates: Requirements 2.5**

### Property 3: Completion percentage formula with zero-division guard and rounding

*For any* `(completedHours, plannedHours)` pair, the computed Completion Percentage must equal `Math.round((completedHours / plannedHours) * 100)` when `plannedHours > 0`, and must equal 0 (team level) or 100 (per-member level) when `plannedHours === 0`.

**Validates: Requirements 2.6, 9.2**

### Property 4: Section row/box count mirrors member count

*For any* group with N members (including N = 0), every tabular section (Activity Tracker, Planned Hours, Actual Hours, Performance Status) must render exactly N data rows, and the Visual Progress Boxes section must render exactly N boxes. The Timeline View must render exactly N member rows even if members have no timeline entries.

**Validates: Requirements 3.1, 4.1, 5.1, 7.1, 8.1, 9.1**

### Property 5: Working hours duration formatting

*For any* pair of valid ISO datetime strings `(loginTime, logoutTime)` where `logoutTime >= loginTime`, the computed working hours string must be formatted as `HH:MM`, where the total minutes equals `floor((logoutTime - loginTime) / 60000)`.

**Validates: Requirements 3.5**

### Property 6: Ticket counting formula accuracy

*For any* array of tasks, the count of "Assigned Tickets" (status ≠ Done) and "Completed Tickets" (status = Done) for a given member must partition the full set of tasks assigned to that member, such that `assignedCount + completedCount === totalAssigned`.

**Validates: Requirements 3.6, 3.7, 4.3, 5.5**

### Property 7: Latest due date derivation

*For any* non-empty array of tasks where at least one has a non-null `dueDate`, the derived Planned Completion Date must equal the lexicographically maximum `dueDate` value in the array (ISO date strings sort correctly lexicographically).

**Validates: Requirements 4.4**

### Property 8: Available capacity formula with floor at zero

*For any* `(totalMembers, workedHours)` pair, the computed Available Capacity must equal `max(0, totalMembers * 40 - workedHours)` when `totalMembers > 0`, and must equal `0` when `totalMembers === 0`.

**Validates: Requirements 6.5, 6.6**

### Property 9: Utilization percentage formula

*For any* `(totalMembers, workedHours)` pair where `totalMembers > 0`, the computed Utilization Percentage must equal `round10((workedHours / (totalMembers * 40)) * 100)` (rounded to one decimal place), and must equal `0.0` when `totalMembers === 0`.

**Validates: Requirements 6.7**

### Property 10: Timeline bar clipping to 14-day window

*For any* `TimelineEntry` whose `startDate` falls before `windowStart` or whose `endDate` falls after `windowEnd`, the rendered bar must be clipped to the window boundaries rather than hidden. The bar must always have a non-zero width whenever the entry intersects the window.

**Validates: Requirements 7.2**

### Property 11: Timeline bar color coding by status

*For any* `TimelineEntry`, the rendered bar's CSS class must include `bg-blue-500` when `status === "planned"`, and must include `bg-emerald-500` when `status === "completed"` or `status === "in_progress"`.

**Validates: Requirements 7.3**

### Property 12: Timeline title display threshold

*For any* `TimelineEntry` whose computed bar width is ≥ 80 pixels, the title text must be present in the rendered bar. For any entry whose bar width is < 80 pixels, no title text must be present.

**Validates: Requirements 7.4**

### Property 13: Performance status color reflects completed vs planned comparison

*For any* `MemberStats`, the `performanceStatus` must equal `"green"` when `completedHours >= plannedHours` (including when `plannedHours === 0`), and must equal `"red"` when `completedHours < plannedHours`.

**Validates: Requirements 8.2, 8.3, 8.4**

### Property 14: Progress box color tier reflects completion percentage thresholds

*For any* `MemberStats`, the `progressBoxColor` must equal `"green"` when `completionPercentage >= 100`, `"yellow"` when `60 <= completionPercentage <= 99`, and `"red"` when `completionPercentage < 60`.

**Validates: Requirements 9.3, 9.4, 9.5**

### Property 15: Empty data graceful degradation

*For any* combination of empty collections (`tasks = []`, `events = []`, `plans = []`) and/or an empty `memberIds` array, all computed numeric KPIs must equal 0 (or 0.0 where decimals apply), all list-based sections must render empty states, and no JavaScript exception must be thrown.

**Validates: Requirements 10.3, 10.4**

---

## Error Handling

### Empty / missing data patterns

Every section follows the same guard:

```tsx
if (!activeGroup || (activeGroup.memberIds || []).length === 0) {
  return (
    <div className="py-10 text-center text-xs text-muted-foreground italic">
      No members assigned to this group.
    </div>
  );
}
```

All numeric computations use the null-coalescing pattern `(value ?? 0)` throughout the utility functions. This ensures that missing Firestore fields never propagate `NaN` or `undefined` into the UI.

### API timeout and failure (time-cards)

The `timeCardHours` map defaults to `new Map()` (empty). `computeMemberStats` checks `timeCardHours.has(memberId)` before using the API value; if the key is absent, it falls back to `workedHours` from Firestore. This means:
- Network failure → silent fallback, no error banner shown.
- Timeout (10s) → `AbortController` fires, catch block leaves `timeCardHours` empty, fallback applies.
- Partial API data → only members present in the map use API values; the rest fall back.

### Firestore listener errors

The `onSnapshot` call for `groups_activity` should include an error callback:

```typescript
const unsubActivity = onSnapshot(
  query(collection(db, "groups_activity"), where("groupId", "==", selectedGroupId)),
  (snap) => { setActivityRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityRecord))); },
  (err) => {
    console.error("groups_activity listener error:", err);
    setActivityRecords([]); // degrade gracefully
  }
);
```

### Component-level error boundary

Each sub-component is a candidate for wrapping with the existing `ErrorBoundary` component (`src/components/ErrorBoundary.tsx`) to prevent a single section's crash from collapsing the whole screen.

```tsx
<ErrorBoundary>
  <TimeDetailsTeamSummary summary={teamSummary} />
</ErrorBoundary>
```

### Date formatting guards

Dates from Firestore may be strings, Timestamps, or null. A helper normalizes them:

```typescript
function toDateString(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.split("T")[0];
  if (value?.toDate) return value.toDate().toISOString().split("T")[0];
  return null;
}
```

This is applied to all `startDate`, `endDate`, `dueDate`, `loginTime`, and `logoutTime` values before computation.

---

## Testing Strategy

### Dual Testing Approach

Unit tests handle specific examples, edge cases, and component rendering checks. Property-based tests verify that all computation formulas hold across a broad range of randomly generated inputs. Both are complementary: unit tests catch specific bugs quickly, property tests verify general correctness.

### Property-Based Testing Library

Use **fast-check** for TypeScript/React:

```bash
npm install --save-dev fast-check
```

Each property test runs a **minimum of 100 iterations** (fast-check default is 100; configure with `{ numRuns: 200 }` for critical formulas).

Tag format in test file comments:
```
// Feature: time-details, Property N: <property_text>
```

### Property Tests (`src/components/groups/__tests__/timeDetailsUtils.pbt.test.ts`)

```typescript
import fc from "fast-check";
import {
  computeTeamSummary, computeMemberStats, computeForecast,
  computeActivityForDate
} from "../timeDetailsUtils";

// Feature: time-details, Property 1: Hours summation with null-coalescing
test("Property 1: planned hours sum treats null as zero", () => {
  fc.assert(fc.property(
    fc.array(fc.record({
      estimatedHours: fc.oneof(fc.float({ min: 0, max: 100 }), fc.constant(null)),
      actualHours: fc.oneof(fc.float({ min: 0, max: 100 }), fc.constant(null)),
      status: fc.constantFrom("To Do", "In Progress", "Done", "Cancelled")
    })),
    (tasks) => {
      const summary = computeTeamSummary(["uid1"], tasks as any[], []);
      const expected = tasks
        .filter(t => !["Cancelled", "Archived"].includes(t.status ?? ""))
        .reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
      return summary.plannedHours === expected;
    }
  ), { numRuns: 200 });
});

// Feature: time-details, Property 2: Remaining Hours is floored at zero
test("Property 2: remaining hours is never negative", () => {
  fc.assert(fc.property(
    fc.float({ min: 0, max: 500 }),
    fc.float({ min: 0, max: 500 }),
    (planned, worked) => {
      const result = Math.max(0, planned - worked);
      return result >= 0;
    }
  ), { numRuns: 200 });
});

// Feature: time-details, Property 3: Completion % with zero-division guard
test("Property 3: team completion % is 0 when planned = 0", () => {
  fc.assert(fc.property(
    fc.float({ min: 0, max: 500 }),
    (worked) => {
      const summary = computeTeamSummary(["uid1"], [], []);
      return summary.completionPercentage === 0;
    }
  ));
});

test("Property 3: per-member completion % is 100 when planned = 0", () => {
  fc.assert(fc.property(
    fc.array(fc.constant({ id: "u1", name: "Test User" }), { minLength: 1, maxLength: 1 }),
    () => {
      const stats = computeMemberStats([{ id: "u1", name: "Test User" }], [], [], new Map());
      return stats[0].completionPercentage === 100;
    }
  ));
});

// Feature: time-details, Property 5: Working hours duration formatting HH:MM
test("Property 5: working hours formatted as HH:MM", () => {
  fc.assert(fc.property(
    fc.date({ min: new Date("2024-01-01"), max: new Date("2024-12-31") }),
    fc.integer({ min: 1, max: 480 }),  // 1 to 480 minutes
    (start, durationMinutes) => {
      const loginTime = start.toISOString();
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      const logoutTime = end.toISOString();
      const result = computeActivityForDate(
        [{ id: "a1", groupId: "g1", userId: "u1", date: start.toISOString().split("T")[0],
           loginTime, logoutTime }],
        "u1",
        start.toISOString().split("T")[0]
      );
      // Must match HH:MM format
      return /^\d{2}:\d{2}$/.test(result.workingHours ?? "");
    }
  ), { numRuns: 200 });
});

// Feature: time-details, Property 8: Available capacity floor at zero
test("Property 8: available capacity is never negative", () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 100 }),
    fc.float({ min: 0, max: 10000 }),
    (members, worked) => {
      const forecast = computeForecast(members, worked, []);
      return forecast.availableCapacity >= 0;
    }
  ), { numRuns: 200 });
});

// Feature: time-details, Property 13: Performance status color
test("Property 13: performance status is green when completed >= planned", () => {
  fc.assert(fc.property(
    fc.float({ min: 0, max: 200 }),
    fc.float({ min: 0, max: 200 }),
    (planned, completed) => {
      fc.pre(completed >= planned);
      const stats = computeMemberStats(
        [{ id: "u1", name: "Alice" }],
        [{ id: "t1", groupId: "g1", assigneeId: "u1", title: "T", priority: "Low",
           status: "Done", estimatedHours: planned, actualHours: completed }] as any,
        [],
        new Map()
      );
      return stats[0].performanceStatus === "green";
    }
  ), { numRuns: 200 });
});

// Feature: time-details, Property 14: Progress box color thresholds
test("Property 14: progress box color tiers are correct", () => {
  fc.assert(fc.property(
    fc.float({ min: 0, max: 200 }),
    fc.float({ min: 0, max: 200 }),
    (planned, completed) => {
      fc.pre(planned > 0);
      const pct = Math.round((completed / planned) * 100);
      const stats = computeMemberStats(
        [{ id: "u1", name: "Bob" }],
        [{ id: "t1", groupId: "g1", assigneeId: "u1", title: "T", priority: "Low",
           status: "Done", estimatedHours: planned, actualHours: completed }] as any,
        [],
        new Map()
      );
      const color = stats[0].progressBoxColor;
      if (pct >= 100) return color === "green";
      if (pct >= 60) return color === "yellow";
      return color === "red";
    }
  ), { numRuns: 200 });
});

// Feature: time-details, Property 15: Empty data graceful degradation
test("Property 15: empty collections produce zero KPIs and no exceptions", () => {
  fc.assert(fc.property(
    fc.array(fc.string(), { maxLength: 0 }),  // empty memberIds
    () => {
      let threw = false;
      let summary: any;
      try {
        summary = computeTeamSummary([], [], []);
      } catch {
        threw = true;
      }
      return !threw && summary.totalMembers === 0 && summary.plannedHours === 0
        && summary.workedHours === 0 && summary.remainingHours === 0
        && summary.completionPercentage === 0;
    }
  ));
});
```

### Unit Tests (`src/components/groups/__tests__/timeDetailsUtils.test.ts`)

Unit tests cover specific scenarios not well-suited to property generation:

- Rendering the "Time Details" tab button in the sidebar (component test with React Testing Library)
- `activeTab === "time_details"` renders `renderTimeDetails` output
- Activity Tracker showing `"—"` when no activity record exists for the date
- Activity Tracker showing `"Active"` when login exists but no logout
- `"N/A"` displayed for Planned Completion Date when all dueDates are null
- Timeline entries fully outside the 14-day window are not rendered
- Time-cards API timeout (AbortController mock) falls back to Firestore actualHours
- Existing tabs (dashboard, timesheets, tasks, etc.) still render after Time Details tab is added

### Integration Tests

- `groups_activity` Firestore listener correctly receives and displays live updates
- time-cards API successful response correctly populates Hours Logged column
- Full Time Details screen renders without unhandled exceptions with seeded group data
