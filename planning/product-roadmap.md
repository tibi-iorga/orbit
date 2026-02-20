#  Orbit — Product Roadmap

## Feedback Intake

- **Webform submission page** — a hosted public or internal page that writes directly to the Supabase feedback table, eliminating the CSV export step.
- **Webhook intake** — an API endpoint that accepts POST requests from tools like Intercom, Jira, or Productboard and maps incoming payloads to the Orbit data model.
- **Multi-source tagging** — add a source field and a product or workstream field to the feedback data model so every item knows where it came from before it hits the feature list.

## Clustering and Scoring

- **AI-assisted scoring suggestions** — after clustering, the AI pre-scores each item against the configured dimensions based on the item description, which the user then confirms or overrides.
- **Scoring templates** — allow users to save and switch between dimension configurations in Settings, useful when the same team manages products with different regulatory profiles.

## User Management

- **SSO via Microsoft or Google** — replace email and password auth with OAuth using Supabase's built-in provider support, removing the need to manage credentials manually.
- **Teams and role permissions** — add a team layer in Supabase with role-based access so a branch manager can submit feedback but only a PM can score or publish a report.