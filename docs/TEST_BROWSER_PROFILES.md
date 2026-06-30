# Test Browser Profiles

Use `.\go` from the repo root to open isolated Chrome or Edge profiles for different app/email accounts.

Examples:

```powershell
.\go admin
.\go admin -Login
.\go staff -Login
.\go customer
.\go staff-one https://cateringms.com/team-portal/general/job-progress
.\go gmail-one https://accounts.google.com
.\go -List
.\go -All
.\go -All -Login
.\go -Reset admin
.\close
```

Each name creates a separate folder inside `.browser-profiles`. Log into one CateringMS/email account per profile. After that, reopening the same profile name keeps that browser session separate from the others.

`.\go -All` is intentionally limited to the 10 approved Spit Braai test profiles:

```text
super-admin, company-admin, admin, kitchen-manager, kitchen, driver, shopping, cleaning-manager, cleaning, client
```

The default URL is `https://cateringms.com/auth/login`. Known role names open the right Spit Braai Delivery login page, for example `admin`, `kitchen`, `driver`, `shopping`, `cleaning`, and `client`.

Add `-Login` for the built-in test users. This creates a one-time local magic link from `.env.local` and opens it inside that role's browser profile, so no password is stored in the launcher.

```powershell
.\go admin -Login
.\go kitchen -Login
.\go driver -Login
.\go staff -Login
.\go -All -Login
```

Run this to see every covered user:

```powershell
node scripts\open-test-login.mjs --list
```

Useful login groups are `admins`, `staff`, `kitchen-team`, `drivers`, `cleaning-team`, `clients`, and `all`. Each group opens one clean account per role, not every duplicate/demo account.

To validate all direct-login sessions without opening browsers:

```powershell
node scripts\open-test-login.mjs --all --validate
```

Add a URL after the profile name when you want to open a specific page without the magic-link login.

To close only the test browser windows started from this repo's `.browser-profiles` folder:

```powershell
.\close
.\close -List
.\close -Force
```

If Chrome is not installed, the launcher falls back to Microsoft Edge. To prefer Edge:

```powershell
.\go admin -Browser edge
```
