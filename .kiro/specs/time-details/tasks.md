# Implementation Plan: Time Details

## Overview

Add a unified Time Details screen inside the Groups module. The feature is entirely additive: a new `"time_details"` tab is appended to the existing Groups sidebar nav, a `renderTimeDetails()` function is wired into the existing conditional-render block, pure computation helpers are extracted into `timeDetailsUtils.ts`, and eight sub-components are created in `src/components/groups/`. No existing tabs, routes, or modules are altered.

---

## Tasks

- [ ] 1. Install fast-check and set up test scaffolding
  - [ ] 1.1 Install fast-check as a dev dependency
    - Run `npm install --save-exact --save-dev fast-check` in the project root
    - Verify `fast-check` appears in `package.json` devDependencies with an exact pinned version
    - Confirm the existing Vitest configuration in `vite.config.ts` / `vitest.config.ts` supports the test file patterns `**/__tests__/**/*.test.ts` and `**/*.pbt.test.ts`
    - Create the `src/components/groups/__tests__/` directory (empty, ready for test files)
    - _Requirements: none (dev tooling prerequisite)_

- [ ] 2. Define TypeScript interfaces in `timeDetailsUtils.ts`
  - [ ] 2.1 Create `src/components/groups/timeDetailsUtils.ts` with all shared interfaces
    - Export interfaces: `GroupTask`, `GroupEvent`, `GroupPlan`, `ActivityRecord`, `MemberStats`, `TimelineEntry`, `TeamSummary`, `ForecastData` exactly as specified in the Design Document § "TypeScript Interfaces"
    - Include the `EXCLUDED_STATUSES` constant and the private `isIncluded()` helper at the top of the file (not exported)
    - Ensure all optional / nullable fields are typed with `| null` or `?` as shown in the design
    - _Requirements: Req 2, Req 3, Req 4, Req 5, Req 6, Req 7, Req 8, Req 9; Design §"Data Models"_

- [ ] 3. Implement pure computation helpers in `timeDetailsUtils.ts`
  - [ ] 3.1 Implement `computeTeamSummary()`
    - Accepts `(memberIds: string[], tasks: GroupTask[], events: GroupEvent[])` and returns `TeamSummary`
    - Filter out cancelled/archived items using `isIncluded()` before summing `estimatedHours`
    - `remainingHours = Math.max(0, plannedHours - workedHours)`
    - Team-level `completionPercentage`: return `0` when `plannedHours === 0`
    - _Requirements: Req 2.2, 2.3, 2.4, 2.5, 2.6; Design §"computeTeamSummary()"_

  - [ ] 3.2 Implement `computeMemberStats()`
    - Accepts `(members, tasks, events, timeCardHours)` and returns `MemberStats[]`
    - Per-member: `plannedHours`, `workedHours`, `completedHours`, `plannedTasks`, `completedTasks`, `hoursLogged` (API map → fallback), `latestDueDate`, `completionPercentage` (return `100` when `plannedHours === 0`), `performanceStatus`, `progressBoxColor`
    - Use `isIncluded()` when summing planned hours; use all statuses when summing `workedHours`
    - _Requirements: Req 3.6, 3.7, 4.2, 4.3, 4.4, 5.2, 5.3, 5.5, 8.2–8.4, 9.2–9.6; Design §"computeMemberStats()"_

  - [ ] 3.3 Implement `computeForecast()`
    - Accepts `(totalMembers: number, workedHours: number, plans: GroupPlan[])` and returns `ForecastData`
    - `futurePlannedHours`: sum of `plannedWork ?? 0` across all plans
    - `availableCapacity = Math.max(0, totalMembers * 40 - workedHours)`; return `0` when `totalMembers === 0`
    - `utilizationPercentage`: rounded to one decimal, return `0.0` when `totalMembers === 0`
    - _Requirements: Req 6.2, 6.3, 6.5, 6.6, 6.7; Design §"computeForecast()"_

  - [ ] 3.4 Implement `computeTimelineEntries()`
    - Accepts `(tasks: GroupTask[], events: GroupEvent[])` and returns `TimelineEntry[]`
    - Tasks: only include entries where `startDate` or `dueDate` is present; map to `TimelineEntry` with `type: "task"`
    - Events: all events; single-day fallback `endDate = startDate` when `endDate` is null
    - _Requirements: Req 7.1, 7.2, 7.5; Design §"computeTimelineEntries()"_

  - [ ] 3.5 Implement `computeActivityForDate()`
    - Accepts `(activityRecords: ActivityRecord[], memberId: string, date: string)` and returns `{ loginTime, logoutTime, workingHours, isActive }`
    - Sort records descending by `loginTime`, take `records[0]`
    - Compute `workingHours` as `HH:MM` string only when both login and logout are present; floor at zero
    - Return all-null result when no record matches
    - _Requirements: Req 3.2–3.5; Design §"computeActivityForDate()"_

- [ ] 4. Write property-based tests for all 15 correctness properties
  - [ ] 4.1 Create `src/components/groups/__tests__/timeDetailsUtils.pbt.test.ts` and write the test file scaffold
    - Import `fc` from `fast-check` and all exported helpers from `timeDetailsUtils.ts`
    - Define shared arbitraries: `arbGroupTask`, `arbGroupEvent`, `arbGroupPlan`, `arbActivityRecord`, `arbMemberStats`, `arbTimelineEntry`
    - _Requirements: all; Design §"Correctness Properties"_

  - [ ]* 4.2 Write property test for Property 1 — Hours summation with null-coalescing
    - Generate tasks and events with arbitrary `estimatedHours` / `actualHours` (including `null`, `undefined`, `0`, negative, large values)
    - Assert `computeTeamSummary` and `computeMemberStats` sums match expected `reduce((s,x) => s + (x ?? 0), 0)`
    - **Property 1: Hours summation with null-coalescing**
    - **Validates: Requirements 2.3, 2.4, 4.2, 5.2, 6.2**

  - [ ]* 4.3 Write property test for Property 2 — Remaining Hours floored at zero
    - Generate `(plannedHours, workedHours)` pairs including cases where `workedHours > plannedHours`
    - Assert `TeamSummary.remainingHours >= 0` and equals `Math.max(0, plannedHours - workedHours)`
    - **Property 2: Remaining Hours is floored at zero**
    - **Validates: Requirements 2.5**

  - [ ]* 4.4 Write property test for Property 3 — Completion percentage formula with zero-division guard
    - Generate `(completedHours, plannedHours)` pairs including `plannedHours === 0`
    - Assert team-level returns `0` and per-member returns `100` when `plannedHours === 0`; otherwise `Math.round((c / p) * 100)`
    - **Property 3: Completion percentage formula with zero-division guard and rounding**
    - **Validates: Requirements 2.6, 9.2**

  - [ ]* 4.5 Write property test for Property 4 — Row/box count mirrors member count
    - Generate member arrays of length N (0–20) with matching tasks/events/records
    - Assert `computeMemberStats(...).length === N` (mirrors all sections' row/box counts)
    - **Property 4: Section row/box count mirrors member count**
    - **Validates: Requirements 3.1, 4.1, 5.1, 7.1, 8.1, 9.1**

  - [ ]* 4.6 Write property test for Property 5 — Working hours duration formatting
    - Generate valid ISO datetime pairs where `logoutTime >= loginTime`
    - Assert `computeActivityForDate` returns `workingHours` matching `/^\d{2}:\d{2}$/` format
    - Assert total minutes equals `Math.floor((end - start) / 60000)`
    - **Property 5: Working hours duration formatting**
    - **Validates: Requirements 3.5**

  - [ ]* 4.7 Write property test for Property 6 — Ticket counting formula accuracy
    - Generate task arrays for a member; assert `assignedTickets + completedTickets === totalAssigned`
    - **Property 6: Ticket counting formula accuracy**
    - **Validates: Requirements 3.6, 3.7, 4.3, 5.5**

  - [ ]* 4.8 Write property test for Property 7 — Latest due date derivation
    - Generate tasks with at least one non-null `dueDate`; assert `latestDueDate` equals the lexicographic maximum
    - **Property 7: Latest due date derivation**
    - **Validates: Requirements 4.4**

  - [ ]* 4.9 Write property test for Property 8 — Available capacity floored at zero
    - Generate `(totalMembers, workedHours)` pairs; assert `availableCapacity >= 0` and equals `Math.max(0, totalMembers * 40 - workedHours)` or `0` when `totalMembers === 0`
    - **Property 8: Available capacity formula with floor at zero**
    - **Validates: Requirements 6.5, 6.6**

  - [ ]* 4.10 Write property test for Property 9 — Utilization percentage formula
    - Generate `(totalMembers, workedHours)` pairs; assert one-decimal rounding and `0.0` when `totalMembers === 0`
    - **Property 9: Utilization percentage formula**
    - **Validates: Requirements 6.7**

  - [ ]* 4.11 Write property test for Property 10 — Timeline bar clipping to 14-day window
    - Generate `TimelineEntry` objects with dates partially/fully outside the window
    - Assert entries that intersect the window produce `barWidth > 0` after clipping; entries fully outside are skipped
    - Implement and test a `clipBar(entry, windowStart, windowEnd, dayWidth)` helper exported from `timeDetailsUtils.ts`
    - **Property 10: Timeline bar clipping to 14-day window**
    - **Validates: Requirements 7.2**

  - [ ]* 4.12 Write property test for Property 11 — Timeline bar color coding by status
    - Generate `TimelineEntry` objects with arbitrary `status` values
    - Assert the resolved CSS class contains `bg-blue-500` for `"planned"` and `bg-emerald-500` for `"completed"` / `"in_progress"`, and test a `resolveBarColor(status)` helper exported from `timeDetailsUtils.ts`
    - **Property 11: Timeline bar color coding by status**
    - **Validates: Requirements 7.3**

  - [ ]* 4.13 Write property test for Property 12 — Timeline title display threshold
    - Generate bar widths from 0–200; assert title is present iff `barWidth >= 80`
    - Test a `shouldShowTitle(barWidth: number): boolean` helper exported from `timeDetailsUtils.ts`
    - **Property 12: Timeline title display threshold**
    - **Validates: Requirements 7.4**

  - [ ]* 4.14 Write property test for Property 13 — Performance status reflects completed vs planned
    - Generate `(completedHours, plannedHours)` pairs; assert `performanceStatus === "green"` iff `completedHours >= plannedHours`
    - **Property 13: Performance status color reflects completed vs planned comparison**
    - **Validates: Requirements 8.2, 8.3, 8.4**

  - [ ]* 4.15 Write property test for Property 14 — Progress box color tier thresholds
    - Generate `completionPercentage` values across 0–200; assert tier boundaries: `>= 100 → green`, `60–99 → yellow`, `< 60 → red`
    - **Property 14: Progress box color tier reflects completion percentage thresholds**
    - **Validates: Requirements 9.3, 9.4, 9.5**

  - [ ]* 4.16 Write property test for Property 15 — Empty data graceful degradation
    - Generate calls to all five helpers with empty arrays/maps/zero member counts
    - Assert all numeric results are `0` (or `0.0`) and no exception is thrown
    - **Property 15: Empty data graceful degradation**
    - **Validates: Requirements 10.3, 10.4**

- [ ] 5. Checkpoint — Verify pure helpers and property tests pass
  - Run `npx vitest run src/components/groups/__tests__/timeDetailsUtils.pbt.test.ts` (or the equivalent test command)
  - Ensure all property tests pass; fix any computation bugs discovered
  - Ask the user if any clarification is needed before proceeding to UI work.

- [ ] 6. Write unit tests for edge cases in `timeDetailsUtils.ts`
  - [ ] 6.1 Create `src/components/groups/__tests__/timeDetailsUtils.test.ts`
    - Test `computeTeamSummary` with: all-null hours, mix of cancelled/archived tasks, zero members
    - Test `computeMemberStats` with: member with no tasks, member with only cancelled tasks, `timeCardHours` map with and without the member's ID
    - Test `computeForecast` with: `totalMembers = 0`, `workedHours > totalMembers * 40`
    - Test `computeTimelineEntries` with: tasks lacking both `startDate` and `dueDate` (should be excluded), events lacking `endDate` (single-day fallback)
    - Test `computeActivityForDate` with: multiple records on same date (most recent wins), login-only record (`isActive = true`), no records (all-null return)
    - _Requirements: Req 2–6, Req 3.2–3.5, Req 10.3, 10.4; Design §"Error Handling"_

- [ ] 7. Add `groups_activity` Firestore listener and time-cards API fetch to `Groups.tsx`
  - [ ] 7.1 Add local state declarations at the top of the `Groups` function body in `Groups.tsx`
    - Add: `const [activityDate, setActivityDate] = useState<string>(new Date().toISOString().split("T")[0]);`
    - Add: `const [activityRecords, setActivityRecords] = useState<ActivityRecord[]>([]);`
    - Add: `const [timeCardHours, setTimeCardHours] = useState<Map<string, number>>(new Map());`
    - Add: `const [timeCardLoading, setTimeCardLoading] = useState<boolean>(false);`
    - Import `ActivityRecord` from `./timeDetailsUtils` (or the types barrel)
    - _Requirements: Req 3.2; Design §"renderTimeDetails() function"_

  - [ ] 7.2 Add `groups_activity` `onSnapshot` listener inside the existing `selectedGroupId` `useEffect` block
    - Subscribe with `where("groupId", "==", selectedGroupId)` and map docs to `ActivityRecord[]`
    - Store results in `setActivityRecords`; unsubscribe in the cleanup return via `unsubActivity()`
    - Apply `activityDate` filtering client-side (in the component), not in the query
    - _Requirements: Req 3.2, 10.1; Design §"New listener: groups_activity"_

  - [ ] 7.3 Add time-cards API `useEffect` with `AbortController` and 10-second timeout
    - Trigger on `[selectedGroupId, groupMembers.length]` dependency array
    - Abort after 10 000 ms via `setTimeout(() => controller.abort(), 10_000)`
    - On success: build `Map<string, number>` from `{ userId, hours_worked }` array and call `setTimeCardHours`
    - On error/abort: call `setTimeCardHours(new Map())` (silent fallback; component will use `workedHours`)
    - Call `setTimeCardLoading(true)` before fetch and `setTimeCardLoading(false)` in `.finally()`
    - Clean up both the timeout and the abort controller in the `useEffect` return
    - _Requirements: Req 5.3, 5.4; Design §"Time-cards API call"_

- [ ] 8. Create `TimeDetailsTeamSummary` sub-component
  - [ ] 8.1 Create `src/components/groups/TimeDetailsTeamSummary.tsx`
    - Props: `summary: TeamSummary`
    - Render a 5-column KPI card grid (`grid grid-cols-2 md:grid-cols-5 gap-4`) with cards for: Total Team Members, Planned Hours, Worked Hours, Remaining Hours, Completion Percentage
    - Use colour classes from the design: `text-blue-600`, `text-indigo-600`, `text-emerald-600`, `text-amber-500`, `text-violet-600`
    - Match existing project styling (container `bg-white dark:bg-slate-900 p-6 rounded-xl border border-border`, KPI label `text-[10px] uppercase font-bold text-muted-foreground`, value `text-3xl font-bold`)
    - _Requirements: Req 2.1–2.6; Design §"Section 1: Team Summary"_

- [ ] 9. Create `TimeDetailsActivityTracker` sub-component
  - [ ] 9.1 Create `src/components/groups/TimeDetailsActivityTracker.tsx`
    - Props: `members`, `activityRecords: ActivityRecord[]`, `tasks: GroupTask[]`, `activityDate: string`, `onDateChange: (date: string) => void`
    - Render a `<input type="date">` picker above the table; default to today
    - Table columns: Employee Name, Login Time, Logout Time, Working Hours, Assigned Tickets, Completed Tickets
    - Call `computeActivityForDate` per member; apply the active/dash rendering rules from the design
    - Compute Assigned Tickets (status ≠ Done) and Completed Tickets (status = Done) per member from `tasks`
    - Show `"No members in this group."` empty-state when `members.length === 0`
    - _Requirements: Req 3.1–3.7; Design §"Section 2: Activity Tracker"_

- [ ] 10. Create `TimeDetailsPlannedHours` sub-component
  - [ ] 10.1 Create `src/components/groups/TimeDetailsPlannedHours.tsx`
    - Props: `members`, `tasks: GroupTask[]`, `events: GroupEvent[]`
    - Internally call `computeMemberStats` (or receive `memberStats: MemberStats[]` as prop) to derive per-member data
    - Table columns: Employee Name, Planned Hours, Planned Tasks, Planned Completion Date
    - Format `latestDueDate` as `MMM D, YYYY`; display `"N/A"` when null
    - Show `"No members assigned to this group."` empty-state
    - _Requirements: Req 4.1–4.5; Design §"Section 3: Planned Hours"_

- [ ] 11. Create `TimeDetailsActualHours` sub-component
  - [ ] 11.1 Create `src/components/groups/TimeDetailsActualHours.tsx`
    - Props: `members`, `tasks: GroupTask[]`, `timeCardHours: Map<string, number>`, `loading: boolean`
    - Table columns: Employee Name, Hours Worked, Hours Logged, Completed Tasks
    - When `loading` is true, show a skeleton/spinner in the Hours Logged column
    - Silent fallback: when `timeCardHours` map does not contain a member's ID, display `workedHours` for Hours Logged
    - Show `"No members assigned to this group."` empty-state
    - _Requirements: Req 5.1–5.5; Design §"Section 4: Actual Hours"_

- [ ] 12. Create `TimeDetailsForecast` sub-component
  - [ ] 12.1 Create `src/components/groups/TimeDetailsForecast.tsx`
    - Props: `forecast: ForecastData`
    - Render a 3-column KPI card grid (`grid grid-cols-1 md:grid-cols-3 gap-4`)
    - Cards: Future Planned Hours (formatted `X.X hrs`), Available Capacity (`X hrs`), Utilization % (`X.X%`)
    - Use the same KPI card styling as `TimeDetailsTeamSummary`
    - _Requirements: Req 6.1–6.7; Design §"Section 5: Forecast Information"_

- [ ] 13. Create `TimeDetailsTimeline` sub-component
  - [ ] 13.1 Create `src/components/groups/TimeDetailsTimeline.tsx`
    - Props: `members`, `entries: TimelineEntry[]`, `windowStart: Date`
    - Render a horizontally scrollable grid: fixed 140px left column (member names), 14 day-columns to the right
    - Column headers: abbreviated weekday + date number (e.g., `Mon 16`)
    - Per member row: iterate `entries` filtered to that member; compute `barLeft` and `barWidth` using the pixel formula from the design (clip to window)
    - Color bars with `resolveBarColor(status)` helper; show title text when `shouldShowTitle(barWidth)` returns true
    - Empty rows (no entries in window) still render the day-column grid with dashed separators
    - _Requirements: Req 7.1–7.5; Design §"Section 6: Timeline View"_

- [ ] 14. Create `TimeDetailsPerformance` sub-component
  - [ ] 14.1 Create `src/components/groups/TimeDetailsPerformance.tsx`
    - Props: `members`, `memberStats: MemberStats[]`
    - Table columns: Employee Name, Planned Hours, Completed Hours, Status
    - Status badge: green (`bg-emerald-50 text-emerald-700 border-emerald-100`) when `performanceStatus === "green"` / text `"On Track"`; red (`bg-rose-50 text-rose-700 border-rose-100`) when `"red"` / text `"Behind"`
    - Zero Planned Hours → green/On Track per Req 8.4
    - Show `"No members assigned to this group."` empty-state
    - _Requirements: Req 8.1–8.5; Design §"Section 7: Performance Status"_

- [ ] 15. Create `TimeDetailsProgressBoxes` sub-component
  - [ ] 15.1 Create `src/components/groups/TimeDetailsProgressBoxes.tsx`
    - Props: `memberStats: MemberStats[]`
    - Render a responsive grid (`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`)
    - Each box shows: Member Name (bold), Planned hours, Completed hours, Completion % (large text)
    - Apply tier color classes from the design based on `progressBoxColor`: green / yellow / red
    - Zero Planned Hours → green tier, show `100%`
    - _Requirements: Req 9.1–9.6; Design §"Section 8: Visual Progress Boxes"_

- [ ] 16. Checkpoint — Verify all sub-components render without errors
  - Run `npx vitest run` (or `npm test -- --run`) to ensure no compile errors or broken tests
  - Ask the user if any sub-component design deviations are needed before wiring.

- [ ] 17. Add `renderTimeDetails()` function to `Groups.tsx`
  - [ ] 17.1 Write the `renderTimeDetails()` function body inside the `Groups` function in `Groups.tsx`
    - Derive `groupMembers` from `users` filtered by `activeGroup?.memberIds`
    - Call `computeTeamSummary(groupMembers.map(m => m.id), tasks, events)` to get `summary`
    - Call `computeMemberStats(groupMembers, tasks, events, timeCardHours)` to get `memberStats`
    - Call `computeForecast(summary.totalMembers, summary.workedHours, plans)` to get `forecast`
    - Call `computeTimelineEntries(tasks, events)` to get `timelineEntries`
    - Guard: if `!activeGroup` or member count is 0, render the `"No members assigned to this group."` placeholder
    - Return JSX that composes all eight sub-components in order: `TimeDetailsTeamSummary`, `TimeDetailsActivityTracker`, `TimeDetailsPlannedHours`, `TimeDetailsActualHours`, `TimeDetailsForecast`, `TimeDetailsTimeline`, `TimeDetailsPerformance`, `TimeDetailsProgressBoxes`
    - Import all sub-components and utility functions at the top of `Groups.tsx`
    - _Requirements: Req 1.4, 2–9, 10.3, 10.4; Design §"renderTimeDetails() function"_

- [ ] 18. Register the "Time Details" tab entry in `Groups.tsx`
  - [ ] 18.1 Append `{ id: "time_details", label: "Time Details", icon: Clock }` to the existing sidebar tab list array in `Groups.tsx`
    - Ensure `Clock` is imported from `lucide-react` (verify it is already imported; add it if absent)
    - Position the entry after the existing "Analytics & Health" tab entry, matching the visual style of all other tabs
    - _Requirements: Req 1.1, 1.3; Design §"Tab Registration"_

- [ ] 19. Wire `activeTab === "time_details"` render condition in `Groups.tsx`
  - [ ] 19.1 Add `{activeTab === "time_details" && renderTimeDetails()}` to the existing conditional-render block
    - Place the new line at the same indentation level as all other `activeTab` conditions
    - Do not remove or modify any existing `activeTab` condition
    - _Requirements: Req 1.2, 1.4; Design §"Tab Registration"_

- [ ] 20. Integration test — Verify existing tabs are unaffected
  - [ ] 20.1 Create `src/components/groups/__tests__/Groups.integration.test.tsx`
    - Mock Firestore listeners and render `<Groups />` with a seeded `activeGroup` that has multiple members
    - Click each existing tab button in sequence (Dashboard, Timesheets, Analytics & Health, etc.) and assert their content is visible and the Time Details content is not
    - Assert no console errors related to the new state variables or listeners
    - _Requirements: Req 1.5, 10.2; Design §"Architecture"_

- [ ] 21. Integration test — Full Time Details screen renders with seeded data
  - [ ] 21.1 Extend `Groups.integration.test.tsx` with the Time Details render scenario
    - Seed `tasks`, `events`, `plans`, and `activityRecords` collections with representative data including edge cases (null hours, cancelled tasks, active sessions)
    - Click the "Time Details" tab and assert: all 8 section headings are present, KPI values match expected computations, timeline rows equal member count, progress boxes equal member count
    - Mock a successful time-cards API response and assert Hours Logged reflects API data; mock a timeout and assert silent fallback to Hours Worked
    - _Requirements: Req 1.2, 1.4, 2–9, 10.3, 10.4; Design §"Error Handling"_

- [ ] 22. Final checkpoint — Ensure all tests pass
  - Run the full test suite: `npx vitest run`
  - Confirm zero test failures across `timeDetailsUtils.test.ts`, `timeDetailsUtils.pbt.test.ts`, and `Groups.integration.test.tsx`
  - Ask the user if any questions arise before marking the feature complete.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- Each task references specific requirement IDs for full traceability
- Pure helpers in `timeDetailsUtils.ts` are intentionally side-effect-free to enable property-based testing
- The `clipBar`, `resolveBarColor`, and `shouldShowTitle` helpers needed for property tests 10–12 should be exported from `timeDetailsUtils.ts` even though they are small utilities
- The time-cards API fallback is silent — no error UI is shown to the user when the API times out
- All new state variables (`activityDate`, `activityRecords`, `timeCardHours`, `timeCardLoading`) are declared at the `Groups` function body level, not inside `renderTimeDetails`, to survive re-renders consistently with the existing pattern
- Checkpoints ensure incremental validation at logical milestones; do not skip them

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["4.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "4.16"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3"] },
    { "id": 7, "tasks": ["8.1", "9.1", "10.1", "11.1", "12.1", "13.1", "14.1", "15.1"] },
    { "id": 8, "tasks": ["17.1"] },
    { "id": 9, "tasks": ["18.1"] },
    { "id": 10, "tasks": ["19.1"] },
    { "id": 11, "tasks": ["20.1"] },
    { "id": 12, "tasks": ["21.1"] }
  ]
}
```
