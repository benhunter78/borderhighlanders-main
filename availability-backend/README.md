# Availability page backend

`availability.html` stores its data in a Google Sheet through a small Google Apps Script web app. No server or database is needed. One-time setup, about 10 minutes:

1. **Create the sheet.** In Google Drive, create a new Google Sheet (e.g. "Border Highlanders Availability"). Use the Google account that owns or can see the band calendar.
2. **Add the script.** In the sheet, choose **Extensions > Apps Script**. Delete the starter code, paste in the contents of `Code.gs`, and save.
3. **Set the admin key.** In the Apps Script editor, click **Project Settings** (gear icon) > **Script Properties** > **Add script property**. Name: `ADMIN_KEY`, value: any passphrase you choose. This is what unlocks adding/removing people and setting levels.
4. **Run setup once.** Back in the editor, pick the `setup` function from the dropdown and click **Run**. Approve the permission prompts (Sheets + Calendar). This creates the `People` and `Availability` tabs.
5. **Deploy.** Click **Deploy > New deployment**, type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy** and copy the web app URL (ends in `/exec`).
6. **Connect the page.** In `availability.html`, set `API_URL` near the bottom to that URL, then commit and push.

## Notes

- Events come from the band Google Calendar for the next 60 days (`DAYS_AHEAD` in `Code.gs`). Add or change an event in Google Calendar and it shows up on the page automatically.
- If you edit `Code.gs` later, use **Deploy > Manage deployments > Edit (pencil) > Version: New version** so the URL stays the same.
- Events titled exactly "Band Practice" appear twice: in the Practice table (band members) and the Lessons table (students and instructors, answered separately). Every other event goes in Performances (band members only).
- You can also edit the `People` tab directly in the sheet: `role` is `member` or `student`; `instrument` is `piper`, `snare`, `tenor`, `bass`, or `drum major`; put `yes` in `instructor` for band members who instruct. Leave the `id` column alone for existing rows; new rows added by hand need a unique id (any short text).
- Emails are never sent to the public page; only names, roles, and levels are.
