# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop browsers. There is no mobile app; the help FAQ lists one as on the roadmap with no date.

## Users

Two primary audiences, weighted equally:

- **Individual contributors.** Knowledge workers whose calendars fill with meetings. They come to Paceday to protect focus time, keep habits, and stop doing calendar Tetris by hand.
- **Managers.** People who run a team. They come to coordinate 1:1 cadences, find time across the team, protect team hours, and see how much focus their team gets.

People pick one of these two profiles when they sign up.

There is also a secondary audience: **external bookers**. They have no account and use a public scheduling link (`/book/:slug`) to book time with a Paceday user.

## Product Purpose

Paceday is a hosted AI calendar. It protects focus time, trims and arranges meetings, and organises the user's day automatically. Users can also adjust their schedule in plain language.

Success means users get their time back without having to manage a scheduling tool.

## Positioning

**Simplicity.** "The simplest way to own your day." Paceday wins on fewer knobs and opinionated defaults. Its neighbours (Clockwise, Reclaim, Motion) win on feature breadth, and Paceday is not trying to match that. A capability that adds configuration surface has to justify itself against this position.

## Operating Context

- Delivered as hosted SaaS: users sign up on Paceday's service. The repository's Docker Compose and Nginx stack is how it is run, not a promise made to users.
- Calendars it connects to:
  - Google Calendar and Microsoft 365/Outlook
  - read-only webcal/ICS feeds
  - Apple/iCloud is **not** supported.
- Conferencing: Google Meet, Microsoft Teams, Zoom.
- Integrations: Slack (meeting-brief context and a daily recap) and Notion (documents to review in meeting briefs).
- An MCP server lets assistants such as Claude Desktop, Cursor and Zed act on the user's calendar.

## Capabilities and Constraints

What it does today (from the docs site and the app's routes):
- **Focus time.** Focus blocks, focus analytics and buffer time.
- **Habits.** Streaks and completion tracking.
- **Meeting prep briefs.**
- **Scheduling links.** Includes collective scheduling and participant availability, plus a public booking page.
- **Team.**
  - Find a time
  - 1:1 cadences
  - protected hours
  - focus analytics for team members
- **Natural-language bar.** Changes are confirmed before they are applied.
- **Demo mode.** "Try a demo", with no account needed.
- **Notifications.**
- **Org features.** SSO (OIDC) and an audit log.

Privacy behaviours, which are existing product facts that new work must not weaken:
- Managers see aggregate focus minutes only, never event titles. This is enforced at the data level.
- Analytics sharing can be turned off.
- Paceday never reads email.
- Data is deleted within 30 days of cancelling.

Terminology used in the product: "focus time", "focus blocks", "habits", "meeting prep briefs", "scheduling links", "Find a time", "protected hours", "1:1 cadences", "buffer time", "daily recap", "Individual contributor" / "Manager", "demo mode".

Constraints:
- The UI is English only (no i18n).
- The frontend consumes types generated from the backend's OpenAPI contract. A screen may not invent a field or endpoint the contract lacks.

Undecided:
- Pricing and plans are not recorded anywhere in the product.
- Whether an "admin" role exists beyond Individual contributor and Manager is unclear. PAC-50 implies SSO administration.

## Brand Commitments

- Name: **Paceday**. Tagline: "The simplest way to own your day."
- Logo: `public/paceday-logo-original.png`. Favicon: `public/favicon.png`.

## Evidence on Hand

There are no testimonials, customer logos, case studies, benchmarks or pricing anywhere in either repository. Future work must not fabricate any of them. Demo mode is the only built-in way to show the product.

## Product Principles

1. **Simplicity is the product.** Prefer a good default to a setting. Prefer one obvious path to several flexible ones.
2. **Both seats are first-class.** Every team feature has to work for the IC whose time it touches as well as for the manager who uses it.
3. **Automation proposes; the user stays in control.** Changes made by the natural-language bar or the engine are visible and confirmable, never silent.
4. **Privacy is not a setting to trade away.** Aggregate-only manager visibility and "never reads email" are fixed points.
