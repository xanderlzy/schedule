# Schedule

A simple, monotone school timetable app with three views:

- **Timetable** (the landing page): your week as a time grid, with that week's agenda inside each class
- **Calendar**: a month grid; click any day to see its classes, agendas, deadlines and events
- **List**: the whole semester in date order, with filters

**Live app:** <https://xanderlzy.github.io/schedule/>

You can tick off deadlines, keep notes on each week's class, cancel or move a class, and add your own events. Everything syncs between your phone and laptop. It's plain HTML/CSS/JavaScript with no build step, hosted free on **GitHub Pages** and synced through **Firebase**.

---

## Contents

1. [Try it locally (2 minutes)](#1-try-it-locally)
2. [Set it up for yourself (about 20 minutes, once)](#2-set-it-up-for-yourself)
3. [Load your first semester](#3-load-your-first-semester)
4. [Every new semester](#4-every-new-semester)
5. [Making a semester file](#5-making-a-semester-file)
6. [Using the app](#6-using-the-app)
7. [Backups](#7-backups)
8. [Troubleshooting](#8-troubleshooting)
9. [For developers](#9-for-developers)

---

## 1. Try it locally

You need Python 3, which is already installed on macOS.

```sh
cd path/to/this/folder
python3 -m http.server 5173
```

Open <http://127.0.0.1:5173>. With no Firebase set up, the app runs in **local preview**: data is saved in that browser only, and nothing syncs.

- If `data/seed.json` exists, it loads automatically.
- Otherwise click **Import semester…** and pick `example/semester.example.json` to see how it works.

## 2. Set it up for yourself

You'll need free accounts on **GitHub** and **Google** (for Firebase).

### 2a. Put the code on GitHub

1. Create a new repository on GitHub, e.g. `schedule`. Public is fine, because your timetable is never stored in the repo (see the note below).
2. From this folder:
   ```sh
   git init
   git add .
   git commit -m "Schedule app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/schedule.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. After a minute your app is live at `https://<your-username>.github.io/schedule/`.

> **Your data stays private.** `data/`, `References/` and backup files are listed in `.gitignore`, so they never reach GitHub. Your timetable lives only in your Firebase account, readable only by you.

### 2b. Create a Firebase project for sync

1. Go to <https://console.firebase.google.com> → **Create a project**. Any name works, and Google Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method**: enable **Google** and save.
3. **Build → Firestore Database → Create database**: choose a location near you and start in **production mode**.
4. Still in Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**. This makes sure each person can only read and write their own data.
5. **Project settings** (gear icon) **→ General → Your apps**: click the **web** icon `</>` and register an app (no hosting needed). Copy the `firebaseConfig` values it shows.
6. Paste them into [`js/firebase-config.js`](js/firebase-config.js):
   ```js
   export const firebaseConfig = {
     apiKey: 'AIza…',
     authDomain: 'your-project.firebaseapp.com',
     projectId: 'your-project',
     storageBucket: 'your-project.appspot.com',
     messagingSenderId: '…',
     appId: '…',
   };
   ```
   These values are safe to publish. They only identify your project, and the rules from step 4 protect the data.
7. **Authentication → Settings → Authorized domains → Add domain**: add `<your-username>.github.io`.
8. Commit and push:
   ```sh
   git add js/firebase-config.js
   git commit -m "Add Firebase config"
   git push
   ```

## 3. Load your first semester

1. Open your GitHub Pages URL on your laptop and click **Continue with Google**.
2. You'll see **No schedule yet**. Click **Import semester…** and choose your semester file (see [section 5](#5-making-a-semester-file)).
3. Sign in on your phone with the same Google account. Everything is already there.

Tip: on your phone, use **Share → Add to Home Screen** so the app opens like a normal app.

## 4. Every new semester

You don't start from scratch, and old semesters aren't lost.

1. **Make the new semester file** ([section 5](#5-making-a-semester-file)).
2. In the app, go to **⋯ → Semesters… → Import new semester…** and pick the file.
3. The new semester is added and becomes the current one. Your previous semesters stay in the list with all their notes and ticked deadlines. **Switch** to look back at them anytime.

Good to know:

- **Personal events** (things you add with **+ → Event**) belong to you, not to a semester, so they show in every semester.
- **Re-importing a semester you already have** (same name) asks before replacing it. Replacing resets that semester's notes and ticked deadlines, so only do it when the schedule itself changed.
- **Deleting** a semester (**⋯ → Semesters… → Delete**) is permanent, so export a backup first if unsure.
- The app opens on whichever semester you last picked. If you haven't picked one, it opens on the semester running today.

## 5. Making a semester file

A semester file is one JSON file describing the semester's dates, modules, weekly classes, each week's agenda, and deadlines. There are two ways to make it.

### Option A: let an AI do it (recommended)

Collect your official timetable and each module's syllabus or weekly schedule (PDFs, Word docs or screenshots). Then either:

- **With Claude Code in this folder:** put the files in `References/` and say *"Build a new semester file in data/ from the files in References, following example/semester.example.json. Ask me about anything unclear."*
- **With any AI chat:** attach the files plus [`example/semester.example.json`](example/semester.example.json) and paste this prompt:

  > Convert my timetable and module syllabi into one JSON file that follows the attached example exactly (same keys and formats). Rules: dates are YYYY-MM-DD and times are 24-hour HH:MM; `day` is 1 = Monday … 5 = Friday; `weeks` lists the semester week numbers the class runs (leave out break weeks); agenda ids are `<MODULE>_w<week>`; deadline `due` is `YYYY-MM-DDTHH:MM` (use 23:59 if no time is given, and `"dueKind": "week"` if the syllabus only gives a week). Before writing the file, list anything ambiguous or missing (unclear dates, holidays, TBA rooms) and ask me.

Save the result as a `.json` file, e.g. `data/april-2027.json`, and import it. **Always spot-check a few classes and deadlines** against the originals after importing.

### Option B: write it by hand

Copy [`example/semester.example.json`](example/semester.example.json) and edit it. Reference:

| Section | What goes in it |
|---|---|
| `semester` | `name` (shown in the app and used to recognise re-imports), `start` (Monday of week 1), `weeks` (total, including breaks and exams), `breakWeeks`, `examWeeks`, optional `labels` (a note shown for a given week number) |
| `modules` | One per module, keyed by module code: `name`, `shade` (1–7, the grey used for it), `lecturer`, `contact`, `assessments` (list of `{ name, weight }`) |
| `classes` | One per weekly class: `moduleCode`, `section`, `type`, `day` (1–5), `start`/`end` (`HH:MM`), `venue`, `staff`, `weeks` (week numbers it runs) |
| `exceptions` | Optional one-off changes, keyed `"<classId>@<YYYY-MM-DD>"`: `{ "cancelled": true, "reason": "…" }` or new `start`/`end`/`venue` |
| `agendas` | One per module per week, keyed `"<MODULE>_w<week>"`: `topic`, `details` (list), optional `screening`, `venue` (overrides the room that week), `online: true` |
| `tasks` | Deadlines: `moduleCode`, `title`, `due` (`YYYY-MM-DDTHH:MM`), `dueKind` (`exact` or `week`), `weight` (number or `null`), `done: false` |

Smaller changes during the semester (a cancelled class, a room change, a new deadline) are quicker to do in the app than in the file. See below.

## 6. Using the app

| To… | Do this |
|---|---|
| Change week / month | ‹ › arrows, or **Today**. On a phone, swipe the timetable left or right to change day |
| See a class's agenda | Tap the class (Timetable), tap a day (Calendar), or tap the row to expand it (List) |
| Add a note for a week's class | Open the class → **Notes**. It saves as you type |
| Tick off a deadline | Tap its circle checkbox, anywhere it appears |
| Cancel or move one class | Open the class → **Cancel this class** or **Change time or room**. **Restore original** undoes it |
| Add an event or deadline | The round **+** button, **Add event** in a day panel, or double-click an empty time slot in the timetable |
| Edit or delete an event / deadline | Tap it |
| Switch semester, import, back up | **⋯** menu (top right) |
| Light / dark mode | Sun or moon button. It follows your device until you choose |

## 7. Backups

**⋯ → Export backup** downloads one file with **every semester and all your events**. Keep it somewhere safe; it's personal data, so don't commit it.

To restore, use **⋯ → Import semester…** and pick the backup file. Semesters in the backup replace ones with the same name; others are left alone.

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Sign-in popup closes with an error | Add your `github.io` domain under **Firebase → Authentication → Settings → Authorized domains** |
| "Missing or insufficient permissions" in the browser console | Publish the rules from `firestore.rules` (step 2b.4) |
| App says "Local preview" after deploying | `js/firebase-config.js` still has an empty `apiKey`, or the change wasn't pushed |
| Phone doesn't show the latest change | Pull down to refresh. Changes sync live while the app is open |
| Imported the wrong file | **⋯ → Semesters… → Delete** it, then import the right one |

## 9. For developers

```sh
npm test     # node --test: date maths, exceptions, multi-semester store, seed sanity checks
npm start    # local server on :5173
```

```
index.html · calendar.html · list.html   one page per view (cross-document View Transitions)
css/styles.css     grey-only design tokens (light + dark), layout, motion
js/model.js        pure date/schedule logic (week numbers, class occurrences, exceptions)
js/store.js        data layer: Firestore or localStorage; semesters, import/export
js/ui.js           shell: theme, ⋯ menu, Semesters sheet, sign-in gate, sheets, toasts
js/views.js        shared rows and day content
js/editor.js       class / event / deadline sheets
js/timetable.js · js/calendar.js · js/list.js   page controllers
firestore.rules    per-user access rules
example/           sample semester file (fake data)
```

Firestore layout, per signed-in user:

```
users/{uid}/meta/settings                 { activeSemester }
users/{uid}/semesters/{semesterId}        semester info
users/{uid}/semesters/{semesterId}/modules|classes|exceptions|agendas|tasks/{id}
users/{uid}/events/{id}                   personal events (shared by all semesters)
```
