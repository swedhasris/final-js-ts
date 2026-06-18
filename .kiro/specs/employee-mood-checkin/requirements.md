# Requirements Document

## Introduction

The Employee Mood Check-In feature adds a lightweight, non-intrusive mood capture layer to the existing AI Activity Tracker module. Before a user starts monitoring, a popup asks how they are feeling. Before they stop monitoring, it asks again. Mood data and optional reasons are persisted to the backend and are visible to administrators in a filtered log section embedded within the AI Activity Tracker page. No existing monitoring behavior, UI, database schema for other features, permissions, timesheets, screenshots, or APIs are altered. All changes are additive and fully backward compatible.

## Glossary

- **Mood_Popup**: The modal dialog presented to the employee before the start or stop monitoring action is executed.
- **Mood_Option**: One of the six selectable mood states: Happy (😀), Good (😊), Neutral (😐), Sad (😔), Stressed (😟), Sick (🤒).
- **Negative_Mood**: Any Mood_Option in the set {Sad, Stressed, Sick}.
- **Reason_Field**: A mandatory free-text input that appears when the selected Mood_Option is a Negative_Mood.
- **Check_In_Mood**: The Mood_Option submitted immediately before the Start Monitoring action executes.
- **Check_Out_Mood**: The Mood_Option submitted immediately before the Stop Monitoring action executes.
- **Mood_Log**: A persisted Firestore document containing userId, userName, date, Check_In_Mood, Check_Out_Mood, and optional reason fields.
- **Mood_Logs_Section**: The read-only admin view embedded in the AI Activity Tracker page that displays Mood_Log records.
- **Activity_Tracker**: The existing AI Activity Tracker module at `/activity-tracker` (`src/pages/ActivityTracker.tsx`).
- **Monitoring_Session**: An active tracking period bounded by a start and a stop action.
- **Admin_User**: Any authenticated user whose role is `admin`, `super_admin`, or `ultra_super_admin` (role hierarchy ≥ 4).
- **Regular_User**: Any authenticated user whose role is `user`, `agent`, or `sub_admin` (role hierarchy ≤ 3).
- **Firestore_Service**: The Firebase/Firestore backend used for storing Mood_Log documents.
- **Mood_Checkin_Collection**: The Firestore collection `moodCheckins` that stores all Mood_Log documents.

---

## Requirements

### Requirement 1: Check-In Mood Popup Before Start Monitoring

**User Story:** As an employee, I want to record how I am feeling before I start my work monitoring session, so that my wellbeing is tracked alongside my activity.

#### Acceptance Criteria

1. WHEN the employee clicks "Start Monitoring" on the Activity_Tracker page, THE Mood_Popup SHALL appear before the existing `startWatcher` function is invoked.
2. THE Mood_Popup SHALL display the prompt "How are you feeling today?" and present all six Mood_Options (Happy 😀, Good 😊, Neutral 😐, Sad 😔, Stressed 😟, Sick 🤒) as selectable buttons.
3. WHEN the employee selects a Mood_Option that is not a Negative_Mood (Happy, Good, or Neutral), THE Mood_Popup SHALL enable the submit button without requiring any additional input.
4. WHEN the employee selects a Negative_Mood (Sad, Stressed, or Sick), THE Mood_Popup SHALL display the Reason_Field with the placeholder "Please tell us why".
5. WHILE the Reason_Field is visible and the employee has not entered at least one non-whitespace character, THE Mood_Popup SHALL keep the submit button disabled.
6. WHEN the employee submits the Mood_Popup with a selected Mood_Option and, when that option is a Negative_Mood, a non-empty reason, THE Mood_Checkin_Service SHALL first save a Mood_Log document to the Mood_Checkin_Collection and THEN invoke the existing `startWatcher` function unchanged.
7. IF the employee closes or dismisses the Mood_Popup without submitting, THEN THE Mood_Popup SHALL close and the Start Monitoring action SHALL be cancelled, leaving the tracker in its current idle state.
8. WHEN the employee clicks "Start Monitoring", THE Mood_Popup SHALL be displayed and interactive within 300ms of the button click event.
9. IF the Mood_Log document save fails, THEN THE Mood_Checkin_Service SHALL log the error to the browser console and SHALL still invoke `startWatcher` so that monitoring is not blocked by a persistence failure.

---

### Requirement 2: Check-Out Mood Popup Before Stop Monitoring

**User Story:** As an employee, I want to record how I am feeling after my work session ends, so that end-of-day wellbeing can be compared with the start-of-day mood.

#### Acceptance Criteria

1. WHILE a Monitoring_Session is active, WHEN the employee clicks "Stop Monitoring" on the Activity_Tracker page, THE Mood_Popup SHALL appear before the existing `stopWatcher` function is invoked.
2. THE Mood_Popup SHALL display the prompt "How are you feeling after today's work?" and present all six Mood_Options (Happy 😀, Good 😊, Neutral 😐, Sad 😔, Stressed 😟, Sick 🤒) as selectable buttons.
3. WHEN the employee selects a Mood_Option that is not a Negative_Mood (Happy, Good, or Neutral), THE Mood_Popup SHALL enable the submit button without requiring any additional input.
4. WHEN the employee selects a Negative_Mood (Sad, Stressed, or Sick), THE Mood_Popup SHALL display the Reason_Field with the placeholder "Please tell us why".
5. WHILE the Reason_Field is visible and the employee has not entered at least one non-whitespace character, THE Mood_Popup SHALL keep the submit button disabled.
6. WHEN the employee submits the Mood_Popup with a selected Mood_Option and, when that option is a Negative_Mood, a non-empty reason, THE Mood_Checkin_Service SHALL update only the `checkOutMood`, `checkOutReason`, and `updatedAt` fields of the existing Mood_Log document for the current session without overwriting Check_In_Mood data, and THEN invoke the existing `stopWatcher` function unchanged.
7. IF the employee closes or dismisses the Check-Out Mood_Popup without submitting, THEN THE Mood_Popup SHALL close and the Stop Monitoring action SHALL be cancelled, leaving the Monitoring_Session active.
8. IF no Check_In_Mood document exists for the current session, THEN THE Mood_Checkin_Service SHALL create a new Mood_Log document with `userId`, `userName`, `date`, `checkOutMood`, and `checkOutReason` populated, and SHALL invoke `stopWatcher` afterward.
9. WHEN the employee clicks "Stop Monitoring", THE Mood_Popup SHALL be displayed and interactive within 300ms of the button click event.

---

### Requirement 3: Mood Data Persistence

**User Story:** As a system, I want mood data to be reliably stored in Firestore, so that it is available for admin review and future analytics.

#### Acceptance Criteria

1. THE Mood_Checkin_Service SHALL persist each Mood_Log to the `moodCheckins` Firestore collection as a document with the following fields: `userId` (string), `userName` (string), `date` (ISO 8601 date string, e.g. `"2025-01-15"`), `checkInMood` (string or null), `checkInReason` (string or null, maximum 500 characters), `checkOutMood` (string or null), `checkOutReason` (string or null, maximum 500 characters), `createdAt` (Firestore server timestamp), `updatedAt` (Firestore server timestamp).
2. WHEN a Check-In Mood is submitted, THE Mood_Checkin_Service SHALL create a new Mood_Log document such that the subsequent Check-Out submission for the same session updates that same document.
3. WHEN a Check-Out Mood is submitted for an existing session document, THE Mood_Checkin_Service SHALL update only the `checkOutMood`, `checkOutReason`, and `updatedAt` fields without overwriting `checkInMood`, `checkInReason`, or `createdAt`. IF no prior session document exists, THE Mood_Checkin_Service SHALL create a new document with only the Check-Out fields populated.
4. IF a Firestore write operation fails, THEN THE Mood_Checkin_Service SHALL log the error to the browser console, display a non-blocking toast notification to the user indicating the mood could not be saved, and SHALL proceed to invoke the corresponding `startWatcher` or `stopWatcher` function so that monitoring is not blocked.
5. THE Mood_Checkin_Service SHALL NOT modify any existing Firestore collection, REST API endpoint, database table, or data schema outside of the `moodCheckins` collection.
6. IF the same user submits a Check-In Mood more than once on the same calendar date, THEN THE Mood_Checkin_Service SHALL reject the duplicate submission, notify the user that a check-in already exists for today, and SHALL NOT create a second Mood_Log document for that user and date.

---

### Requirement 4: Mood Logs Admin View

**User Story:** As an administrator, I want to view a filtered log of employee mood check-ins and check-outs within the AI Activity Tracker page, so that I can monitor team wellbeing without navigating to a separate page.

#### Acceptance Criteria

1. WHILE the authenticated user is an Admin_User, THE Activity_Tracker page SHALL display a "Employee Mood Logs" section below the existing monitoring controls on the same page.
2. WHILE the authenticated user is a Regular_User, THE Activity_Tracker page SHALL NOT display the Mood_Logs_Section.
3. THE Mood_Logs_Section SHALL display a table with the following columns: User Name, Date, Check-In Mood, Check-Out Mood, Reason.
4. WHEN a Mood_Log has both a `checkInReason` and a `checkOutReason`, THE Mood_Logs_Section SHALL display them concatenated in the Reason column separated by a " / " delimiter (e.g., "Feeling unwell / Still tired").
5. WHEN a Mood_Log has only one reason field populated, THE Mood_Logs_Section SHALL display only that reason in the Reason column.
6. WHEN a Mood_Log has no reason fields populated, THE Mood_Logs_Section SHALL display an em dash (—) in the Reason column.
7. THE Mood_Logs_Section SHALL provide a Date filter that allows the Admin_User to select a specific date and display only Mood_Logs where the `date` field matches the selected date.
8. THE Mood_Logs_Section SHALL provide a User filter that allows the Admin_User to filter logs by case-insensitive substring match against the employee's name or userId.
9. THE Mood_Logs_Section SHALL provide a Group filter that allows the Admin_User to filter logs by the employee's group membership as defined in the existing Groups data source.
10. THE Mood_Logs_Section SHALL display records in descending order of `createdAt` regardless of whether filters are applied, and SHALL default to showing Mood_Logs for the current calendar date when no filters have been set.
11. WHEN filters are applied, THE Mood_Logs_Section SHALL update the displayed records within 500ms of the last input change.
12. THE Mood_Logs_Section SHALL display a "No records found" message when no Mood_Logs match the active filters.
13. WHEN the Admin_User clears a filter input, THE Mood_Logs_Section SHALL revert to the unfiltered default state for that filter dimension within 500ms.

---

### Requirement 5: Backward Compatibility and Non-Regression

**User Story:** As a product owner, I want the mood check-in feature to be entirely additive, so that no existing functionality, UI, or data is altered.

#### Acceptance Criteria

1. THE Mood_Checkin_Feature SHALL NOT modify the `startWatcher` or `stopWatcher` function bodies, signatures, or invocation contracts in `ActivityTrackerContext.tsx`; both functions SHALL continue to be called with no arguments and in their original execution context.
2. THE Mood_Checkin_Feature SHALL NOT alter existing REST API endpoints, Spring Boot controllers, database tables, or SQL schemas.
3. THE Mood_Checkin_Feature SHALL NOT change any existing UI component outside of inserting the Mood_Popup gate into the `handleStart` and `handleStop` click handlers in `ActivityTracker.tsx`; no other logic SHALL be added to those handlers beyond the gate and the unchanged downstream calls.
4. THE Mood_Checkin_Feature SHALL NOT affect screenshot capture, timesheet creation, time card creation, activity entry persistence, or AI summary generation behaviors.
5. THE Mood_Checkin_Feature SHALL NOT introduce any new application routes or pages.
6. WHEN the `moodCheckins` Firestore collection does not exist, THE Mood_Checkin_Service SHALL create the collection and the document in a single write operation without requiring any manual setup or pre-configuration.
7. THE Mood_Checkin_Feature SHALL use only libraries already present in the project (`react`, `typescript`, `tailwindcss`, `shadcn/ui` Dialog/Button/Input components, `firebase/firestore`) and SHALL NOT add new package dependencies.

---

### Requirement 6: Mood Popup UX and Accessibility

**User Story:** As an employee, I want the mood popup to be quick, clear, and accessible, so that it does not interrupt my workflow.

#### Acceptance Criteria

1. THE Mood_Popup SHALL be implemented as a modal dialog using the existing `shadcn/ui` Dialog component and SHALL have an accessible name exposed via `aria-labelledby` pointing to the dialog title element.
2. THE Mood_Popup SHALL trap keyboard focus within the dialog while it is open and SHALL restore focus to the triggering button when the dialog closes.
3. THE Mood_Popup SHALL be dismissible by pressing the Escape key, which SHALL cancel the pending monitoring action (same behavior as clicking the dismiss button).
4. WHEN a Mood_Option button is focused via keyboard, THE Mood_Popup SHALL show a visible focus ring styled using the project's existing `focus-visible:ring-2 focus-visible:ring-ring` Tailwind utilities.
5. WHEN the employee selects a Mood_Option, THE Mood_Popup SHALL apply a `ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950` styling to that button to confirm the active selection, and SHALL remove that styling from any previously selected option.
6. THE Mood_Popup SHALL NOT block or obscure the underlying page in a way that prevents understanding of context; the dialog overlay SHALL use the project's existing `bg-black/80` backdrop class.
7. WHEN the Mood_Popup is open in light mode, all text SHALL be rendered with sufficient contrast; WHEN the Mood_Popup is open in dark mode, THE Mood_Popup SHALL use the `dark:bg-slate-900` background and `dark:text-slate-100` text color classes.
8. WHEN the Mood_Popup is open, THE Mood_Popup submit button label SHALL read "Start Monitoring" for check-in and "Stop Monitoring" for check-out, so the employee understands what action will follow submission.
