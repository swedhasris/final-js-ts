# Requirements Document

## Introduction

This feature adds a single, unified **Time Details** screen inside the existing **Groups** module of the Connect IT application. Inspired by HaloITSM resource planning, the screen consolidates Activity Tracking, Timesheets, Forecasting, Planning, and Timeline functionality into one page — accessible via Groups → Select Group → Time Details.

The feature is additive only: it adds a new "Time Details" tab entry inside the existing Groups sidebar navigation and renders a new page component within the existing `{activeTab === "time_details" && renderTimeDetails()}` pattern already used in Groups. No existing tabs, routes, menus, sidebar items, modules, or UI elements are changed.

---

## Glossary

- **Time_Details_Screen**: The single unified page rendered when the user selects the "Time Details" tab inside the Groups module.
- **Group**: An existing organizational unit in the system, stored in the `settings_groups` Firestore collection.
- **Active_Group**: The group currently selected by the user in the Groups module sidebar.
- **Group_Member**: A user whose `uid` appears in the `Active_Group.memberIds` array.
- **Planned_Hours**: The number of hours scheduled for a Group_Member to work on assigned tasks and events, derived from `groups_tasks.estimatedHours` and `groups_events.estimatedHours` for the Active_Group.
- **Completed_Hours**: The number of hours a Group_Member has actually worked, derived from `groups_tasks.actualHours` for tasks with status "Done" in the Active_Group.
- **Hours_Worked**: Total actual hours logged by a Group_Member, derived from `groups_tasks.actualHours` across all task statuses.
- **Completion_Percentage**: The ratio of Completed_Hours to Planned_Hours, expressed as a percentage. Formula: `(Completed_Hours ÷ Planned_Hours) × 100`.
- **Activity_Record**: A login/logout session record stored in the `groups_activity` Firestore collection for a Group_Member within the Active_Group.
- **Forecast_Record**: A planning record stored in the `groups_plans` Firestore collection with type "Weekly" or "Daily" for the Active_Group.
- **Timeline_Entry**: A task or event from the Active_Group that has a start date, end date, and an assignee, used to render the horizontal timeline grid.
- **Performance_Status**: A color indicator (GREEN or RED) assigned per Group_Member based on whether Completed_Hours meets or exceeds Planned_Hours.
- **Progress_Box_Color**: A color indicator (Green, Yellow, or Red) assigned per Group_Member based on their Completion_Percentage thresholds.
- **renderTimeDetails**: The React render function that produces the Time_Details_Screen JSX, following the same pattern as other render functions (`renderDashboard`, `renderTimesheets`, etc.) in `Groups.tsx`.
- **Groups_Module**: The existing `Groups` React component located at `src/pages/Groups.tsx`.

---

## Requirements

### Requirement 1: Time Details Tab Entry

**User Story:** As a group member or manager, I want a "Time Details" tab in the Groups module sidebar, so that I can navigate to the unified time tracking screen without leaving the Groups module.

#### Acceptance Criteria

1. THE Groups_Module SHALL render a "Time Details" navigation button in the existing left-sidebar tab list, positioned after the existing "Analytics & Health" tab entry, using the same visual style (size, font, icon placement, hover state, active state) as all other tab buttons in that list.
2. WHEN the user clicks the "Time Details" tab button, THE Groups_Module SHALL activate the Time_Details_Screen in the main workspace content area without navigating to a new route or reloading the page.
3. THE Groups_Module SHALL NOT add any new top-level sidebar menu items, new routes in `App.tsx`, separate pages, or separate modules for this feature.
4. WHEN `activeTab` equals `"time_details"`, THE Groups_Module SHALL render the Time_Details_Screen inside the existing main workspace content area that is used for all other tab views.
5. WHEN the user navigates away from the "Time Details" tab by clicking any other tab button, THE Groups_Module SHALL deactivate the Time_Details_Screen and render the selected tab's content without any residual state from the Time_Details_Screen.

---

### Requirement 2: Section 1 — Team Summary

**User Story:** As a team manager, I want to see a high-level summary of team hours at the top of the Time Details screen, so that I can quickly assess overall team capacity and progress.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display a Team Summary section containing five KPI cards: Total Team Members, Planned Hours, Worked Hours, Remaining Hours, and Completion Percentage.
2. THE Time_Details_Screen SHALL compute Total Team Members as the count of `Active_Group.memberIds`.
3. THE Time_Details_Screen SHALL compute Planned Hours as the sum of `estimatedHours` across all non-cancelled, non-archived tasks and events in the Active_Group, treating null or absent `estimatedHours` values as 0.
4. THE Time_Details_Screen SHALL compute Worked Hours as the sum of `actualHours` across all tasks in the Active_Group, treating null or absent `actualHours` values as 0.
5. THE Time_Details_Screen SHALL compute Remaining Hours as `Planned_Hours − Worked_Hours`, floored at zero.
6. THE Time_Details_Screen SHALL compute team-level Completion Percentage using the formula `(Worked_Hours ÷ Planned_Hours) × 100`, applying standard half-up rounding to the nearest integer, and SHALL display `0%` when Planned_Hours equals zero.
7. THE Time_Details_Screen SHALL recompute all Team Summary values each time the screen is opened and each time an underlying data change is detected, so that displayed values always reflect the current state of the Active_Group data.

---

### Requirement 3: Section 2 — Activity Tracker

**User Story:** As a team manager, I want to see each member's login time, logout time, working hours, and ticket activity in the Time Details screen, so that I can monitor daily attendance and workload.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display an Activity Tracker section with one row per Group_Member showing: Employee Name, Login Time, Logout Time, Working Hours, Assigned Tickets count, and Completed Tickets count.
2. WHEN an Activity_Record exists for a Group_Member in `groups_activity` on the currently selected date, THE Time_Details_Screen SHALL display the most recent Login Time and Logout Time from that record for that date.
3. WHEN an Activity_Record exists for a Group_Member showing a Login Time but no Logout Time for the selected date, THE Time_Details_Screen SHALL display the Login Time and display `"Active"` for Logout Time and Working Hours.
4. IF no Activity_Record exists for a Group_Member on the selected date, THEN THE Time_Details_Screen SHALL display `"—"` for Login Time, Logout Time, and Working Hours.
5. THE Time_Details_Screen SHALL compute and display Working Hours per member as the duration between Login Time and Logout Time, formatted as `HH:MM`, where the value is only shown when both Login Time and Logout Time are present for the selected date.
6. THE Time_Details_Screen SHALL compute Assigned Tickets for each Group_Member as the count of tasks in the Active_Group where `assigneeId` matches the member, status is not `"Done"`, and the task was active on the selected date.
7. THE Time_Details_Screen SHALL compute Completed Tickets for each Group_Member as the count of tasks in the Active_Group where `assigneeId` matches the member, status equals `"Done"`, and the completion date falls on the selected date.

---

### Requirement 4: Section 3 — Planned Hours

**User Story:** As a team lead, I want to see each member's planned hours, planned tasks, and planned completion dates in one place, so that I can review workload distribution.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display a Planned Hours section with one row per Group_Member showing: Employee Name, Planned Hours, Planned Tasks count, and Planned Completion Date. IF the Active_Group has no members, THEN THE Time_Details_Screen SHALL display an empty-state message in place of the member rows.
2. THE Time_Details_Screen SHALL compute Planned Hours per member as the sum of `estimatedHours` across all non-cancelled, non-archived tasks and events in the Active_Group assigned to that member, treating null or absent `estimatedHours` as 0.
3. THE Time_Details_Screen SHALL compute Planned Tasks per member as the count of tasks in the Active_Group assigned to that member where status is neither `"Done"` nor null nor absent (null or absent status is treated as non-Done and is included in the count).
4. WHEN at least one task assigned to a Group_Member in the Active_Group has a non-null `dueDate`, THE Time_Details_Screen SHALL derive and display the Planned Completion Date for that member as the latest `dueDate` value among those tasks, formatted as a human-readable date (e.g., `MMM D, YYYY`).
5. IF no task assigned to a Group_Member in the Active_Group has a non-null `dueDate`, THEN THE Time_Details_Screen SHALL display `"N/A"` as the Planned Completion Date for that member.

---

### Requirement 5: Section 4 — Actual Hours

**User Story:** As a team lead, I want to see how many hours each member has actually worked versus hours logged, along with completed task counts, so that I can identify delivery gaps.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display an Actual Hours section with one row per Group_Member showing: Employee Name, Hours Worked, Hours Logged, and Completed Tasks count. Members with no qualifying tasks or records SHALL display `0` for all numeric columns.
2. THE Time_Details_Screen SHALL compute Hours Worked per member as the sum of `actualHours` across all tasks in the Active_Group assigned to that member, treating null or absent `actualHours` values as 0.
3. WHEN the `time-cards` API returns a successful response for a Group_Member, THE Time_Details_Screen SHALL display Hours Logged as the sum of `hours_worked` from those records scoped to the Active_Group's assigned members.
4. IF the `time-cards` API returns an error or does not respond within 10 seconds, THEN THE Time_Details_Screen SHALL display the same value as Hours Worked for that member's Hours Logged field.
5. THE Time_Details_Screen SHALL compute Completed Tasks per member as the count of tasks in the Active_Group assigned to that member with status equal to `"Done"`.

---

### Requirement 6: Section 5 — Forecast Information

**User Story:** As a project manager, I want to see team-level forecasting data including future planned hours, available capacity, and utilization percentage, so that I can plan upcoming sprints and resource allocation.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display a Forecast Information section containing three KPI values: Future Planned Hours, Available Capacity, and Utilization Percentage.
2. THE Time_Details_Screen SHALL compute Future Planned Hours as the sum of `plannedWork` from all Forecast_Records in `groups_plans` for the Active_Group, treating null or absent `plannedWork` values as 0, rounded to one decimal place, and capped at a display maximum of 999,999.9 hours.
3. IF no Forecast_Records exist in `groups_plans` for the Active_Group, THEN THE Time_Details_Screen SHALL display `0.0` for Future Planned Hours.
4. For the purpose of Forecast Information calculations, Worked_Hours is defined as the total logged actual hours for the Active_Group, computed as the sum of `actualHours` across all tasks in the Active_Group, treating null or absent values as 0.
5. IF `(Total_Team_Members × 40) − Worked_Hours` produces a negative result, OR IF Total_Team_Members equals zero, THEN THE Time_Details_Screen SHALL display `0` for Available Capacity.
6. THE Time_Details_Screen SHALL compute Available Capacity as `(Total_Team_Members × 40) − Worked_Hours` when Total_Team_Members is greater than zero and the result is non-negative, representing available hours in a standard 40-hour work week per member.
7. IF Total_Team_Members equals zero, THEN THE Time_Details_Screen SHALL display `0.0%` for Utilization Percentage. Otherwise, THE Time_Details_Screen SHALL compute Utilization Percentage as `(Worked_Hours ÷ (Total_Team_Members × 40)) × 100`, rounded to one decimal place.

---

### Requirement 7: Section 6 — Timeline View

**User Story:** As a project manager, I want a visual timeline showing each team member's planned and actual activities along a horizontal date axis, so that I can see schedule overlaps and task durations at a glance.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display a Timeline View section with Group_Members listed as rows on the vertical axis and dates displayed on the horizontal axis covering a 14-day window from today (inclusive) through today+13. Each Group_Member SHALL have a visible row even if they have no Timeline_Entry in the window.
2. IF a Timeline_Entry has a `startDate` and `endDate` and an `assigneeId` matching a Group_Member, THEN THE Time_Details_Screen SHALL render an activity bar for that entry in the corresponding member's row. IF a Timeline_Entry's dates extend beyond the 14-day window, THE Time_Details_Screen SHALL clip the bar to the window boundary rather than hide the entry.
3. THE Time_Details_Screen SHALL visually distinguish planned activity bars from actual/completed activity bars: entries with `status` of `"planned"` SHALL be rendered in blue; entries with `status` of `"completed"` or `"in_progress"` SHALL be rendered in green.
4. IF a Timeline_Entry's bar width is 80 pixels or wider, THEN THE Time_Details_Screen SHALL display the task or event title inside the bar. IF the bar width is less than 80 pixels, THEN THE Time_Details_Screen SHALL omit the title text from the bar.
5. IF a Timeline_Entry has no `endDate`, THEN THE Time_Details_Screen SHALL render the bar spanning a single day (the `startDate` column only).

---

### Requirement 8: Section 7 — Performance Status

**User Story:** As a manager, I want each team member's performance shown with a color-coded status (green or red) based on whether their completed hours meet their planned hours, so that I can instantly spot who is behind.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display a Performance Status section with one row per Group_Member showing: Employee Name, Planned Hours (whole or decimal hours for the currently selected time period), Completed Hours (whole or decimal hours for the currently selected time period), and a visible colored status indicator.
2. WHEN Completed_Hours for a Group_Member is greater than or equal to Planned_Hours, THE Time_Details_Screen SHALL display the status indicator using a green color that is visually distinguishable from non-green states.
3. WHEN Completed_Hours for a Group_Member is less than Planned_Hours, THE Time_Details_Screen SHALL display the status indicator using a red color that is visually distinguishable from non-red states.
4. IF Planned_Hours for a Group_Member equals zero, THEN THE Time_Details_Screen SHALL display the status indicator in green, treating zero-planned as fully met.
5. IF hours data for a Group_Member cannot be retrieved (e.g., data collection returns an error or empty snapshot), THEN THE Time_Details_Screen SHALL display `0` for both Planned Hours and Completed Hours for that member and SHALL apply the green status indicator per criterion 4.

---

### Requirement 9: Section 8 — Visual Progress Boxes

**User Story:** As a team member, I want to see a row of color-coded progress boxes for each team member showing their name, planned hours, completed hours, and completion percentage, so that I can assess individual progress at a glance.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL display a Visual Progress Boxes section with one box per Group_Member showing: Employee Name, Planned Hours, Completed Hours, and Completion Percentage.
2. THE Time_Details_Screen SHALL compute Completion_Percentage per member using the formula `(Completed_Hours ÷ Planned_Hours) × 100`, rounded to the nearest integer using standard half-up rounding, and SHALL display the result as a whole number followed by the `%` symbol (e.g., `75%`).
3. WHEN a member's Completion_Percentage is 100 or above, THE Time_Details_Screen SHALL render that member's box with a green background, green border, and green-tinted text.
4. WHEN a member's Completion_Percentage is between 60 (inclusive) and 99 (inclusive), THE Time_Details_Screen SHALL render that member's box with a yellow background, yellow border, and yellow-tinted text.
5. WHEN a member's Completion_Percentage is below 60, THE Time_Details_Screen SHALL render that member's box with a red background, red border, and red-tinted text.
6. IF Planned_Hours for a Group_Member equals zero, THEN THE Time_Details_Screen SHALL treat Completion_Percentage as 100 and apply the green box styling per criterion 3.

---

### Requirement 10: Data Integrity and Non-Interference

**User Story:** As a developer and system administrator, I want the Time Details feature to use only existing data collections without modifying any existing components, so that no current functionality is broken.

#### Acceptance Criteria

1. THE Time_Details_Screen SHALL read data exclusively from the existing Firestore collections (`settings_groups`, `groups_tasks`, `groups_events`, `groups_plans`) and the existing `groups_activity` collection (created if not yet present), without modifying any document schema in those collections.
2. THE Groups_Module SHALL NOT alter the observable behavior of any existing tab: all existing tabs SHALL continue to render their content, respond to user interaction, and navigate correctly after the Time Details tab is added.
3. IF the Active_Group has no members, THEN THE Time_Details_Screen SHALL render all display sections with an empty-state placeholder and SHALL NOT throw an unhandled runtime error.
4. IF any data collection returns an empty snapshot, THEN THE Time_Details_Screen SHALL display `0` for all numeric fields and empty placeholders for all list fields, SHALL render without an unhandled exception, SHALL allow the user to navigate away from the tab, and SHALL display no data loss indicators.
