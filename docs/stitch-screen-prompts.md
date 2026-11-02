# Google Stitch — per-screen prompts (Quattro)

Every prompt below is the same template filled in for one existing screen. Paste the
**Shared block** first in each Stitch message, then the screen block. Prompts are in English
(Stitch input); the UI content they ask for is Polish.

Facts that apply to every screen:
- Roles: `RESIDENT`, `RECEPTIONIST`, `MANAGER`, `ADMIN` (one role per user per community).
  "Staff" = receptionist + manager + admin. "Management" = manager + admin.
- Hierarchy: Community (osiedle) → Building → Apartment. Parking spaces and storage units belong to a community.
- The app currently uses the first community the user belongs to. There is NO community switcher
  in the UI today. Do not design one.
- Shell: collapsible left sidebar on desktop (Home, Settings, Packages, Reports, Locations, Posts,
  plus Administration for manager/admin), a mobile navigation, a top bar with a notification bell
  (dropdown with unread count and list of notifications). Shell is already designed.
- Language: Polish and English, switchable in Settings. Light and dark theme.
- Dates `dd.mm.yyyy`, in the Polish locale.

---

## Shared block (paste before every screen)

```
# APPLICATION SCREEN — EXISTING PRODUCT REDESIGN

You are continuing the redesign of an existing premium residential hospitality platform
(private-reception residential estates in prestigious locations).
The complete design system and application shell have already been established.
Treat them as immutable design references.

Design constraints:
- Use the established design system. Reuse existing components, tokens, typography, spacing,
  surfaces, and interaction patterns. Reuse the established shell and navigation.
- Do not introduce new colors, component variants, or visual patterns without a clear functional reason.
- Do not redesign the product architecture. Do not invent functionality, business rules, or data.
- Preserve the route and its functional purpose. The screen must look like a natural continuation
  of the existing application.

UX requirements:
- Prioritize the primary user task. Clear hierarchy, appropriate information density.
- Avoid unnecessary cards, decorative metrics, excessive whitespace, redundant labels.
- Prefer tables, lists, forms and compact data layouts where they fit better than cards.
- Provide meaningful empty, loading, error and success states (success/error feedback is a toast).
- Use realistic Polish-language content and data. Layouts must survive Polish <-> English text length.

Responsive: create desktop, tablet and mobile variants. Desktop favors operational efficiency;
mobile favors clarity, touch targets and essential information. Do not just scale desktop down;
adapt tables, forms, dialogs and action placement.

Output: only the requested screen, visually consistent with all previous screens.
No unrelated screens, no future modules.
```

---

## 1. Dashboard — route `/` (resident variant)

```
Screen: Dashboard (home), route /
Primary user role: RESIDENT
Primary user goal: See at a glance what needs my attention — parcels waiting for me at
reception and the state of my open reports — and jump to the right place.

Existing functionality:
- Greeting using the user's first name (falls back to e-mail).
- "My apartment" summary, shown only if the user is linked to at least one apartment:
  one line per apartment ("Budynek A / 12"), then one line with parking and storage numbers
  ("Parking: P-14, P-15 · Komórka: K-07"), and a "View profile" button.
- "Packages to pick up (N)": the user's parcels waiting at reception. Each row: building / apartment,
  courier, received date. Empty state: "Nothing waiting". Button -> /packages.
- "My open reports (N)": each row title + status badge. Empty state: no open reports.
  Button -> /reports?view=mine.
- Primary button "New report" -> /reports.
Do not add: payments, bookings, visitor management, weather, charts.
```

## 2. Dashboard — route `/` (staff variant)

```
Screen: Dashboard (home), route /
Primary user role: RECEPTIONIST (same screen for MANAGER and ADMIN; only the Administration button differs)
Primary user goal: Start the shift knowing what is waiting for action: parcels not yet picked up,
new reports and urgent reports — and move straight into registering a parcel.

Existing functionality:
- Greeting with first name.
- Optional "My apartment" summary if the staff member also lives in the estate (same as resident variant).
- Exactly three counters, each a link: "Waiting for pickup" -> /packages,
  "New reports" -> /reports?status=NEW, "Urgent reports" -> /reports?urgent=1.
- Quick actions: "Add package" (primary) -> /packages, "Reports" -> /reports,
  and "Administration" -> /admin only for MANAGER/ADMIN.
Keep the counters compact and operational (they are navigation, not decoration).
Do not add charts, trends, activity feeds or new metrics.
```

## 3. Packages — route `/packages` (resident variant)

```
Screen: Packages, route /packages
Primary user role: RESIDENT
Primary user goal: Check which parcels reception holds for my apartment and how long they have waited.

Existing functionality:
- Residents see only parcels for their own apartment(s) (including parcels addressed to them as a
  recipient). Subtitle explains this.
- Each parcel shows: building / apartment, status badge (RECEIVED, READY_FOR_PICKUP, PICKED_UP),
  tracking number with a copy-to-clipboard button, courier, received date, and "waiting N days"
  while not picked up; for picked-up parcels the pickup date.
- Residents cannot change anything and there is no search.
- Empty state for residents ("No parcels for you right now").
Do not design pickup, mark-as-picked or register controls for this role.
```

## 4. Packages — route `/packages` (staff variant)

```
Screen: Packages, route /packages
Primary user role: RECEPTIONIST (also MANAGER, ADMIN)
Primary user goal: Register an arriving parcel in seconds, find a parcel by tracking number /
apartment, hand it over and mark it picked up, and nudge residents who have not collected.

Existing functionality:
- Search field (submitted with Enter) filtering the whole community's parcels; "no results" empty state
  distinct from the "no parcels yet" empty state.
- "Register package" dialog with fields: Building (select), Apartment (select, depends on building),
  Recipient (select: default = apartment's primary contact, or a specific owner/tenant of that apartment),
  Tracking number (optional), Courier (optional). Inline validation error, saving state, closes on success.
- Reminder settings panel: switch "Remind residents" + number of days (1–60, default 3) + save.
  Only MANAGER/ADMIN can edit; receptionists see it read-only (disabled controls).
- Parcel list for the whole community. Per parcel: building / apartment, status badge, tracking number
  (+ copy), courier, recipient name, received date, days waiting, and actions:
  "Mark picked up" and "Remind" (sends a reminder notification to the recipient). Actions show a
  per-row loading state and a toast result.
Use a dense list/table on desktop (this is a high-volume operational view); on mobile each row becomes a
compact card with the two actions reachable by thumb.
Do not add: photos, signatures, barcode scanning, locker/shelf locations.
```

## 5. Reports — route `/reports` (resident variant)

```
Screen: Reports (zgłoszenia), route /reports
Primary user role: RESIDENT
Primary user goal: Report a problem or request to management, see what neighbours have reported about
shared spaces, and track my own reports.

Existing functionality:
- Two views toggled by buttons: "Board" (all PUBLIC reports of the community) and "My reports"
  (everything I filed, public and private).
- "New report" dialog: Category (select; categories marked as private carry a "private" suffix),
  Type (select, limited to the types allowed for that category: DEFECT usterka, REQUEST wniosek,
  NOTICE zawiadomienie, QUESTION pytanie, IDEA pomysł, COMPLAINT skarga),
  a subject select that appears depending on the category (my apartment / my parking space / my storage unit),
  Title, Description, Urgent switch. Private categories are available only if the user is linked
  to an apartment.
  Public categories: technical, media, cleanliness, grounds, shared parking, playground, security,
  pests, ideas, other.
  Private categories: own apartment, own parking, own storage, access, billing, balcony, renovation,
  moving, neighbours, administration.
- Each report: title, status badge (NEW, IN_PROGRESS, RESOLVED, APPROVED, REJECTED, CLOSED),
  badges for type, category, "private", and "urgent"; description, place (building / apartment /
  parking / storage), date and time. Residents cannot change status.
- Empty states differ for Board and My reports.
Do not add comments, attachments, voting or chat — none exist.
```

## 6. Reports — route `/reports` (staff variant)

```
Screen: Reports (zgłoszenia), route /reports
Primary user role: RECEPTIONIST, MANAGER, ADMIN
Primary user goal: Triage incoming reports — filter to what matters (new, urgent, private) and move
each report through its workflow.

Existing functionality:
- Filter selects: Visibility (public/private), Status (6 values), Category (20 values), Urgent only.
  Filters live in the URL query, so the dashboard counters can deep-link here
  (/reports?status=NEW, /reports?urgent=1).
- Staff see all reports of the community including the author's name and private ones.
- Per report: same information as the resident card, plus "Reported by".
- Status actions are buttons derived from the report type's workflow:
  DEFECT and COMPLAINT: NEW -> IN_PROGRESS -> RESOLVED.
  REQUEST: NEW -> APPROVED or REJECTED (approve/reject only for MANAGER/ADMIN; receptionists do not see them).
  NOTICE, QUESTION, IDEA: NEW -> CLOSED.
  Terminal statuses have no further actions. A row shows a loading overlay while saving and a toast after.
- Staff can also file a report via "New report".
Present this as a dense, scannable list/table with an inline status action; keep urgent items visually
distinct using the existing destructive/urgent token. On mobile use cards with the filters in a sheet.
Do not add assignment to staff, SLA timers, comments or attachments.
```

## 7. Profile — route `/profile`

```
Screen: Profile, route /profile
Primary user role: RESIDENT (owner or tenant of an apartment); staff see the same page
Primary user goal: See my identity, my apartment(s), parking and storage; as an OWNER manage who else
lives in the apartment and who gets parcel notifications.

Existing functionality:
- Header: initials avatar, full name (falls back to e-mail), e-mail, role badge.
- One card per linked apartment (titled with building + number when there are several): community
  (name, address), building (name, address), apartment number, floor if known.
- "People in this apartment" list per apartment: name, "(you)", badge Owner/Tenant, badge Primary
  contact, e-mail. Owners additionally get: a radio per person to choose the primary contact for
  parcels (disabled for people who do not receive parcel notifications) plus a "no primary contact"
  radio, a remove button on tenants, and an "add tenant" form (tenant e-mail + button).
- My preferences for that apartment: switch "Notify me about parcels"; switch "I live here" with an
  "automatic" hint and a "reset to automatic" action when overridden.
- Parking card: space number, level, EV-charger badge; storage card: unit numbers; each with a
  "Report a problem" button linking to /reports. Empty text when none.
- No-apartment empty state with hint to contact management.
Tenants see the list but not the owner-only controls. Do not add profile editing, avatar upload or
password/security settings (account security is handled by the sign-in provider).
```

## 8. Administration — route `/admin`

```
Screen: Administration (memberships), route /admin
Primary user role: ADMIN (also MANAGER)
Primary user goal: Give people access to the community and keep roles and apartment links correct.

Existing functionality:
- Table of everyone with access, columns: E-mail, Building, Apartment(s), Role, Actions.
  Apartment cell lists the user's residencies (apartment + Owner/Tenant) each removable individually.
  Role is changed inline with a select (RESIDENT, RECEPTIONIST, MANAGER, ADMIN) with a per-row pending
  state; a remove-access action per row. Success/error via toast. Empty state with hint.
- "Add" dialog: E-mail (required), Role (select), Building (select; required for residents),
  Apartment (select, appears only for residents, depends on building), Kind Owner/Tenant (only for
  residents). Inline error, saving state, closes on success.
- A user who has signed up but has no access sees a "Waiting for an invitation" screen until an
  admin adds them here by e-mail. (Optional: show an unobtrusive list of recent sign-ups without
  access whose e-mail can be copied into "Add" — this exists as a temporary helper, max 25 users.)
Table on desktop; on mobile each membership becomes a stacked row with the role select and actions
reachable. Keep destructive actions clearly separated and confirm-able.
Do not add invitations by link, bulk import, permission matrices or an audit-log UI.
```

## 9. Locations — route `/locations`

```
Screen: Locations, route /locations
Primary user role: RESIDENT (any signed-in user)
Primary user goal: Learn what the estate offers on site and what is useful nearby.

Existing functionality:
- Static, read-only content. Two sections.
  "On the estate": kindergarten, sushi restaurant, medical clinic, gym — name, category, short description.
  "Nearby": shopping mall (0.5 km) and school (0.8 km) — name, category + distance, description.
- Each entry has an icon (education, food, health, fitness, shopping).
No map, no bookings, no opening hours, no links — do not invent them. Use realistic Polish names and copy.
An editorial, calm list/grid layout is appropriate here; this screen may be more atmospheric than the
operational ones, but still within the established design system.
```

## 10. Posts — route `/posts` (list)

```
Screen: Posts (announcements), route /posts
Primary user role: RESIDENT (any signed-in user)
Primary user goal: Read the latest announcements from the estate.

Existing functionality:
- Heading with post count, newest first.
- Each post: title, date, two-line excerpt of the content; the whole row links to /posts/{slug}.
- "New post" button opens a dialog with Title and Content. (Currently shown to every signed-in user;
  do not invent permission rules.)
- Empty state with hint.
Posts are plain text. No images, categories, comments, reactions or search (search is not implemented).
```

## 11. Post detail — route `/posts/[slug]`

```
Screen: Post detail, route /posts/{slug}
Primary user role: RESIDENT (any signed-in user)
Primary user goal: Read one announcement in full.

Existing functionality:
- "Back" button to /posts, title, date, full plain-text content.
- "Edit" (dialog with title + content) and "Delete" actions. Delete must be confirmable.
- Unknown slug shows the standard not-found screen.
Optimize for comfortable long-form reading (measure, line height). No comments, sharing or media.
```

## 12. Settings — route `/settings`

```
Screen: Settings, route /settings
Primary user role: any signed-in user
Primary user goal: Choose language and appearance.

Existing functionality:
- Appearance: theme select (Light / Dark / System) and a color palette picker (ThemePicker) that
  previews palettes.
- Language: choose Polish or English; the page refreshes in the new language; error toast on failure.
- Notifications: a switch "E-mail notifications" (currently local only) and a Save button giving a
  success toast.
Group in a single, compact settings layout (sections with label + control rows) rather than a stack of
large cards. Do not add profile, security, billing or integrations settings.
```

## 13. Sign in / Sign up — routes `/sign-in`, `/sign-up`

```
Screen: Sign in and Sign up, routes /sign-in and /sign-up
Primary user role: unauthenticated visitor
Primary user goal: Get into the estate's app quickly and without friction.

Existing functionality:
- Authentication is provided by Clerk's embedded component (e-mail based). The form is a third-party
  component: design the page around it (brand, welcome copy, background, container) and style it only
  through the design system tokens. Do not redraw the fields themselves.
- The public home (/ when signed out) shows a welcome title, a one-line tagline and two buttons:
  "Sign in" (primary) and "Sign up" (outline). Design this signed-out landing too.
- After sign-up, a person without access lands on the waiting screen (see "System states").
This must convey calm, discreet, high-standard service, not a generic SaaS login.
```

## 14. System states

```
Screen: System states (one set of five related screens)
Primary user role: any
Primary user goal: Understand what happened and what to do next, without anxiety.

Existing functionality — each has an illustration (StatusIllustration), a short code or label,
a title and a one-sentence description, and a way back:
- Waiting for an invitation: "Your account isn't assigned to a community yet. Ask an administrator for
  access." Shown to signed-in users with no membership. Primary action: none besides contacting an admin.
- Forbidden — "Key holders only": "Your account doesn't have access to this page."
- Not found — "This stairwell leads nowhere": "We couldn't find that page. Head back down to the home page."
  Button to home.
- Error — "Something went wrong" with code "Oops" and an error digest ("Error code: …"); retry action.
- Global error (full-page, outside the shell).
Keep the existing playful hospitality tone of the copy; provide Polish translations. Also design the
route-level loading skeletons for list pages (packages/reports/admin) consistent with the tables and lists.
```

## 15. Notification bell dropdown (shell component)

```
Component: Notification dropdown in the top bar (shell component, not a route)
Primary user role: any signed-in user
Primary user goal: See new events (e.g. a parcel arrived, a reminder to collect it) and open the related page.

Existing functionality:
- Bell icon with an unread count badge. Opens a dropdown with a heading, a list of recent notifications
  (type-specific text, relative or absolute timestamp, unread highlighted) and an empty state.
- Clicking an item marks it read and navigates to the related page. The list refreshes on every
  navigation and each time the menu opens.
Design the closed, open, empty and unread-heavy states, on desktop (dropdown) and mobile (full-width sheet).
Do not add notification categories, settings inside the dropdown or push-notification UI.
```

---

## Suggested order in Stitch

1. Design system + shell (done) → 2. Dashboard (resident, then staff) → 3. Packages (staff first,
the highest-traffic screen) → 4. Reports → 5. Profile → 6. Admin → 7. Posts, Locations, Settings →
8. Sign-in/landing + System states + Notification dropdown.
