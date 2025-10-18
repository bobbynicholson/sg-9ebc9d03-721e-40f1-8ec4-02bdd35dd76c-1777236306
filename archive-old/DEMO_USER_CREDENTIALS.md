
# Demo User Credentials for Test Company

## Important: Demo Users Setup

The demo users should be created by having users register through the normal signup flow at:
`https://cateringms.com/test-company/auth/register`

## Demo Credentials

All demo users belong to the **Test Company** (slug: `test-company`)

### Admin Portal
- **Email:** `admin@test-company.com`
- **Password:** `testadmin123`
- **Login URL:** `https://cateringms.com/test-company/auth/login`
- **Dashboard:** `https://cateringms.com/test-company/admin/dashboard`

### Driver Portal
- **Email:** `driver@test-company.com`
- **Password:** `testdriver123`
- **Login URL:** `https://cateringms.com/test-company/auth/login`
- **Dashboard:** `https://cateringms.com/test-company/driver/dashboard`

### Kitchen Portal
- **Email:** `kitchen@test-company.com`
- **Password:** `testkitchen123`
- **Login URL:** `https://cateringms.com/test-company/auth/login`
- **Dashboard:** `https://cateringms.com/test-company/kitchen/dashboard`

### Shopping Portal
- **Email:** `shopping@test-company.com`
- **Password:** `testshopping123`
- **Login URL:** `https://cateringms.com/test-company/auth/login`
- **Dashboard:** `https://cateringms.com/test-company/shopping/dashboard`

### Cleaning Portal
- **Email:** `cleaning@test-company.com`
- **Password:** `testcleaning123`
- **Login URL:** `https://cateringms.com/test-company/auth/login`
- **Dashboard:** `https://cateringms.com/test-company/cleaning/dashboard`

### Client Portal
- **Email:** `client@test-company.com`
- **Password:** `testclient123`
- **Login URL:** `https://cateringms.com/test-company/auth/login`
- **Dashboard:** `https://cateringms.com/test-company/client/my-orders`

## Setup Instructions

### Step 1: Create Test Company
1. First user must sign up as the company owner at: `/company-signup`
2. Use company name: "Test Company"
3. This will create the company with slug: `test-company`

### Step 2: Create Demo Users
For each demo user:
1. Navigate to: `https://cateringms.com/test-company/auth/register`
2. Register with the credentials listed above
3. The admin will then need to assign appropriate roles to each user

### Step 3: Assign Roles
As the admin of Test Company:
1. Go to: `https://cateringms.com/test-company/admin/users`
2. For each registered demo user, assign their appropriate department role
3. Set the role as "primary" for each user

## Testing the Demo Page

Users visiting `/demo` will see:
1. All 6 portal cards (Admin, Driver, Kitchen, Shopping, Cleaning, Client)
2. Demo credentials displayed for each portal
3. "Login as Demo User" button that:
   - Pre-fills the login form with credentials
   - Redirects to `/test-company/auth/login`
   - Auto-submits when credentials are filled

## Security Note

These demo credentials are publicly visible and should ONLY be used for the test-company demo environment. Never use these credentials for production data.
