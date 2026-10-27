# WorkloadFlow

WorkloadFlow is a project workload planner for scheduling tasks against daily
availability. Tasks and availability settings are saved in the browser's local
storage.

On first use, create a local username and password. The password is stored as a
salted PBKDF2 hash, and the signed-in state lasts for the current browser tab.
This is a convenience lock only: it is not server authentication and does not
protect planner data from someone with access to the browser or developer tools.
Clearing this site's browser data removes the local account and planner data.

Use **Availability → Backup & Restore** to export planner data to a JSON file or
import a backup. Importing replaces the current planner data in that browser.
Backups include tasks, projects, availability settings, and manual allocations;
they do not include local login credentials.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Getting started

```sh
npm install
npm run dev
```

Open the local URL printed by Vite to use the planner.

## Checks and production build

```sh
npm run typecheck
npm run build
npm run preview
```
