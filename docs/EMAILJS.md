# E-mail for enquiries with EmailJS (step by step)

**What happens:** a visitor presses **Send** on the quote / contact form → the website saves the enquiry in **Admin → Enquiries** → the website's **server** sends it to **EmailJS** → EmailJS e-mails it to your Gmail.

Your EmailJS keys stay on the server and are never put in the web page. The enquiry is **always saved first**, so even if EmailJS is down or your free limit is used up, you never lose an enquiry.

---

## A. In EmailJS (https://www.emailjs.com)

(Menu names on their site can change a little. The idea stays the same.)

1. **Create a free account** and verify your e-mail address.
2. **Email Services → Add New Service → Gmail.** Connect the Gmail account that should send the mail. Copy the **Service ID** (looks like `service_abc123`).
3. **Email Templates → Create New Template.** Fill the fields exactly like this:

   | Field | Value |
   |---|---|
   | To Email | `{{to_email}}` |
   | Reply To | `{{reply_to}}` |
   | From Name | `{{site_name}}` |
   | Subject | `{{subject}}` |

   Content (paste this):
   ```
   New enquiry on {{site_name}}  ({{time}})

   Reference: {{ref}}
   Type:      {{type}}
   Name:      {{name}}
   Phone:     {{phone}}
   E-mail:    {{email}}
   Product:   {{product}}
   Size:      {{size}}
   Colour:    {{color}}
   Quantity:  {{qty}}
   Location:  {{location}}

   Message:
   {{message}}

   Items:
   {{items}}

   Open in admin: {{admin_url}}
   ```
   Save, then copy the **Template ID** (looks like `template_xyz789`).
4. **Account → General.** Copy the **Public Key** and the **Private Key**.
5. *(Possibly needed, not confirmed)* **Account → Security:** if there is a switch called **"Allow EmailJS API for non-browser applications"**, turn it on. This website calls EmailJS from the server, not from a browser. If **Send test e-mail** answers with an error such as `403`, this switch is the first thing to check.

## B. In the website admin

**Admin → Settings → Forms, Email & Spam**

| Field | What to enter |
|---|---|
| Send new enquiries to | the Gmail address that should receive the enquiries |
| EmailJS - Service ID | from step A2 |
| EmailJS - Template ID | from step A3 |
| EmailJS - Public Key | from step A4 |
| EmailJS - Private Key | from step A4 (optional but recommended; stored encrypted, never shown again) |

Press **Save**, then press **Send test e-mail** (at the bottom of the same page).

* ✓ "Test e-mail sent": open your Gmail (check **Spam** the first time).
* ✕ A red message says what went wrong, for example *EmailJS answered 422: The Public Key is invalid* or *did not answer in time*.

## C. How it behaves

* EmailJS accepts **1 request per second**. The site spaces e-mails by about a second. Simultaneous enquiries are sent one after another.
* On Vercel the e-mail is sent **before** the visitor sees "thank you" (a serverless function can be frozen right after it answers). It adds about a second at most. Failures never show an error to the visitor.
* EmailJS free plans have a monthly limit (check their pricing page, it changes). Enquiries over the limit are still saved in the admin.
* If you also fill the SMTP fields, they are used as a **fallback** when EmailJS fails.
* You can change the destination Gmail any time in the admin. No redeploy is needed.

## D. Safety

* Never paste the Private Key into the website's pages, a chat, or GitHub.
* The enquiry text is limited in length and line breaks are removed from the subject, so a visitor cannot inject extra mail headers.
* If you suspect the keys leaked: EmailJS → Account → regenerate the Private Key, and paste the new one in the admin.
