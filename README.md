# Project-LINK-Website
Official Repository for Project LINK. Project LINK (Lasallian Information and Knowledge System) is a web application designed for student council announcements, file management, and portal operations. It uses Cloudflare Pages for hosting static frontend assets and Cloudflare Workers with D1 Database for handling serverless backend operations.

Should you have any questions, feel free to reach out! Deets are located just below this to demonstrate to you on how to get things working :)) 

## File and Directory structure utilized in this project

To prevent build errors and keep frontend assets separate from backend logic, structure your local project into two distinct folders on your Desktop:

```text
Desktop/
├── link-cf-backend/            # Cloudflare Worker Backend (API & Database)
│   ├── worker.js               # API routing and business logic
│   ├── schema.sql              # D1 SQL database schema
│   └── wrangler.toml           # Worker deployment configuration
│
└── link-website/               # Cloudflare Pages Frontend (User Interface)
    ├── index.html              # Main HTML markup
    ├── styles.css              # Core styling
    ├── enhance.css             # Supplementary layout styles
    └── script.js               # Frontend interactions & API client

```

---

## The files utilized by the portal

### 1. Backend (`link-cf-backend`)

* **`worker.js`**: Receives incoming HTTPS requests from the frontend, executes D1 database queries, and handles API actions (such as fetching posts, creating announcements, or handling file records).
* **`schema.sql`**: Contains the SQL statements to define tables, primary keys, and indices for your D1 relational database.
* **`wrangler.toml`**: Configures your Worker name, entry point (`worker.js`), D1 database bindings, and deployment parameters.

### 2. Frontend (`link-website`)

* **`index.html`**: Contains the portal layout, modal structures, form inputs, and includes the script tags referencing `script.js` and CSS files.
* **`styles.css` & `enhance.css**`: Controls UI layout, modal popups, buttons, navigation bars, and responsive styling.
* **`script.js`**: Manages interactive elements (splash screens, buttons, dynamic forms) and sends `fetch()` HTTP requests to your live Worker API URL.

---

## How to setup? There are 4 phases

### Phase 1: Set Up and Deploy Backend API

Open PowerShell and run the following commands:

1. **Navigate to the backend directory:**
```powershell
cd C:\Users\test\Desktop\link-cf-backend

```

2. **Verify that `schema.sql` exists in the folder:**
```powershell
dir

```

*(Ensure the file is named exactly `schema.sql` and not `schema (1).sql`.)*
3. **Execute SQL Schema on Remote D1 Database:**
```powershell
wrangler d1 execute link-db --remote --file=schema.sql

```


4. **Deploy the Cloudflare Worker:**
```powershell
wrangler deploy

```


5. **Copy your generated Worker URL:**
After deployment, Wrangler outputs your live URL:
`https://link-cf-backend.<your-subdomain>.workers.dev`

---

### Phase 2: Link Frontend to Backend

1. Open `C:\Users\test\Desktop\link-website\script.js` in a text editor.
2. Update the `API` constant at the very top of the file:
```javascript
const API = 'https://link-cf-backend.<your-subdomain>.workers.dev';

```


3. Save the file.

---

### Phase 3: Deploy Frontend to Cloudflare Pages

1. **Navigate to the website directory in PowerShell:**
```powershell
cd C:\Users\test\Desktop\link-website

```


2. **Deploy assets via Wrangler Pages:**
```powershell
npx wrangler pages deploy . --project-name=project-link

```


3. **Select Prompts in Terminal:**
* **Framework:** Choose `Static` (No framework at all).
* **Output/Asset directory:** Enter `.` (a single period for root).



---

### Phase 4: Custom Domain Setup (Cloudflare Dashboard)

1. Log into the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** > **Pages** > **project-link**.
3. Go to the **Custom domains** tab and click **Set up a custom domain**.
4. Enter your custom domain (e.g., `portal.yourdomain.com`) and click **Activate domain**.

---

## How does it even work? 

```text
[ User Browser ]
       │
       ▼
[ Cloudflare Pages Frontend ] (index.html / script.js)
       │
       ├─► (Network Request / fetch)
       │
       ▼
[ Cloudflare Worker Backend ] (worker.js)
       │
       ├─► (SQL Query Execution)
       │
       ▼
[ Cloudflare D1 Database ] (schema.sql structure)

```

1. **Initialization:** When a user opens the website, `script.js` initializes interactive UI handlers and triggers an initial API call to fetch active announcements.
2. **API Communication:** Requests are sent as HTTPS requests to `https://link-cf-backend.<your-subdomain>.workers.dev/?action=<ACTION_NAME>`.
3. **Database Operations:** `worker.js` parses the `action` parameter, executes the corresponding SQL command against Cloudflare D1, and returns a JSON response (`{"ok": true, "data": ...}`).
4. **Offline Fallback:** If `script.js` cannot reach the Worker URL (e.g., due to an incorrect API URL or network failure), it temporarily stores entries locally in browser storage and displays `"Saved locally (offline mode)"`.

---

## How to troubleshoot? Here's a checklist 

| Issue / Error | Root Cause | Solution |
| --- | --- | --- |
| **`Unable to read SQL text file "schema.sql"`** | File is misnamed (e.g., `schema (1).sql`) or in another folder. | Rename to `schema.sql` using `Rename-Item "schema (1).sql" "schema.sql"` or move it to `link-cf-backend`. |
| **`Could not detect a directory containing static files`** | Running `wrangler deploy` in a folder configured with invalid asset paths in `wrangler.toml`. | Ensure `wrangler.toml` contains only backend settings and deploy frontend via `npx wrangler pages deploy .`. |
| **`Saved locally (offline mode)`** | `script.js` has an unupdated or incorrect `API` URL string. | Update `const API` in `script.js` to match your Worker `.workers.dev` URL and redeploy Pages. |
| **`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`** | Universal SSL certificate provisioning on new `.pages.dev` domain is still in progress. | Wait 5–15 minutes or test using an Incognito window. |
| **Buttons not clickable / Page frozen** | Missing or misnamed script reference in `index.html`. | Ensure `index.html` references `<script src="script.js"></script>` matching your exact filename. |
