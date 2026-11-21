# Vercel Deployment & Environment Variables Guide

This guide ensures your website runs with a permanent, synchronized cloud database on Vercel.

---

## Why Environment Variables are Needed on Vercel
Vercel runs on serverless instances that start and stop automatically. Their local storage (`/tmp`) is temporary and not shared between instances. To keep logins active, save settings permanently, store customer enquiries, and keep the site synchronized across all instances, Vercel must be connected to your **Supabase** cloud database.

Your local `.env` file is intentionally protected and not uploaded to GitHub. You must enter these variables in your Vercel Dashboard once.

---

## Step 1: Open Vercel Environment Variables
1. Go to [vercel.com](https://vercel.com/) and sign in.
2. Open your project: **`sri_suriya_pipe`**.
3. Go to **Settings** &rarr; **Environment Variables**.

---

## Step 2: Add These Variables

Enter each **Key** and **Value** below. Check all three environments: **Production**, **Preview**, and **Development**.

| Variable Key | Where to get it | Description |
| :--- | :--- | :--- |
| **`APP_SECRET`** | Check your local `.env` file | Used for session encryption & security tokens. |
| **`ADMIN_EMAIL`** | Check your local `.env` file (`pvcsudhakar@gmail.com`) | Primary administrator sign-in email. |
| **`ADMIN_PASSWORD`** | Check your local `.env` file | Administrator sign-in password. |
| **`SUPABASE_URL`** | Check your local `.env` file | Your Supabase project URL (`https://....supabase.co`). |
| **`SUPABASE_SERVICE_KEY`** | Check your local `.env` file | Your Supabase server secret key (`sb_secret_...`). |
| **`SITE_URL`** | `https://srisuriyapipe.vercel.app` | Canonical live domain. |
| **`DRIVE_SCRIPT_URL`** | Check your local `.env` file | Google Apps Script upload helper URL (`.../exec`). |
| **`DRIVE_ADMIN_KEY`** | Check your local `.env` file | Secret key for Google Drive uploads. |

---

## Step 3: Ensure Supabase Table Exists
1. Open your project on [supabase.com](https://supabase.com/).
2. In the left menu, open **SQL Editor**.
3. Open `docs/supabase/schema.sql` from this repository, copy its contents, paste them into the SQL Editor, and click **Run**.
4. This ensures the table `public.ssp_state` exists with appropriate permissions.

---

## Step 4: Trigger a Redeploy in Vercel
After saving the environment variables in Vercel:
1. In Vercel, go to the **Deployments** tab.
2. Click the three dots (`...`) next to the latest deployment &rarr; click **Redeploy**.
3. Leave "Use existing Build Cache" unchecked and click **Redeploy**.

---

## Step 5: Verification
1. Sign in to `https://srisuriyapipe.vercel.app/admin`.
2. Navigate to **Integrations**.
3. Under the **Supabase** card, click **Test connection**.
4. It should display **Connected (version X)** with a green indicator.
