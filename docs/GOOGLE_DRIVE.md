# Google Drive for pictures and videos

There are **two ways** to use Google Drive with the website. Use either, or both.

| | Way A – paste a link | Way B – upload from the admin |
|---|---|---|
| Setup | none | 5 minutes, once |
| How | Upload the file to Drive yourself → **Share → Anyone with the link → Viewer** → copy the link → paste it in **Admin → Media → “Add a link”** (or in any picture/video field) | **Admin → Media → Upload** → choose **Google Drive** as the place to save |
| Needs | nothing | the small script below |

The website converts any Drive share link by itself: pictures become direct image links, videos open in Google's player, PDFs open or download.

> **Important:** a link to a *folder* (`drive.google.com/drive/folders/...`) cannot be shown on a web page. Open the file itself and copy *its* share link.

---

## Way B – set up uploads to Drive (once)

1. In Google Drive create a folder, e.g. **Sri Suriya Website Files**. Open it and copy the **folder id** – the long text at the end of the address bar after `/folders/`.
2. Go to **script.google.com → New project**. Delete the sample code and paste everything from **`docs/drive/Code.gs`**. Name the project *Sri Suriya Drive*.
3. **Project settings (gear icon) → Script properties → Add script property**
   * `FOLDER_ID` = the folder id from step 1
   * `ADMIN_KEY` = a long secret you invent (30+ random letters and numbers). Keep it private.
4. **Authorize the script (Crucial Step - prevents "Access denied: DriveApp")**:
   * In the top toolbar of the editor, find the function dropdown (next to "Debug") and select **`authorizeScript`**.
   * Click **Run** (▶).
   * A popup titled **"Authorization Required"** will appear. Click **Review permissions**.
   * Choose your Google account.
   * Click **Advanced** (at the bottom) → Click **Go to Sri Suriya Drive (unsafe)** → Click **Allow**.
   * The execution log at the bottom will print: `SUCCESS! DriveApp is authorized`.
5. **Deploy → New deployment → select type: Web app (gear icon)**:
   * Description: `Initial`
   * Execute as: **Me (your-email@gmail.com)**
   * Who has access: **Anyone**
   * Click **Deploy** and copy the **Web app URL** (it ends with `/exec`).
6. In the website: **Admin → Settings → Media & Storage** → paste the **Web app URL** and the **ADMIN_KEY** → Save.
   (On Vercel you can instead set the environment variables `DRIVE_SCRIPT_URL` and `DRIVE_ADMIN_KEY`.)
7. **Admin → Media → Upload**, choose *Google Drive* – done! The picture is saved in your Drive folder and the website uses its public link.

---

## Troubleshooting: "Upload failed: Access denied: DriveApp."

If you see this red notification in Admin:
1. Open your project on **script.google.com**.
2. Select **`authorizeScript`** in the function dropdown at the top and click **Run** (▶).
3. Follow the Google permission prompts (**Review permissions → Advanced → Go to Sri Suriya Drive (unsafe) → Allow**).
4. After authorization succeeds, click **Deploy → Manage deployments**.
5. Click the **Pencil (Edit)** icon next to the active deployment.
6. Under **Version**, change to **New version**.
7. Click **Deploy**. Drive upload will now work without error.

### Good to know
* Files are visible to **anyone who has the link** (that is how a public website can show them). Do not upload private documents.
* The script can only **create** files in that one folder. It cannot read, list or delete anything.
* Limit: 30 MB per file through this route. Bigger videos: upload to Drive by hand (Way A).
* If you change the script later: **Deploy → Manage deployments → Edit → New version**.
* To switch uploads off: delete the two values in Settings, or delete the deployment in Apps Script.
* Never share the ADMIN_KEY. If it leaks, change it in Script properties **and** in the website settings.
