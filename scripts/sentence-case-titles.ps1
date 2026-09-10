$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\src\pages'
$files = Get-ChildItem -Path $root -Filter *.tsx -Recurse

# Hand-curated title rewrites. Title case -> sentence case while
# preserving acronyms (HR, GPS, AI, SA, US, UK, EU, VAT) and brand
# tokens (CateringMS, Catering at sentence start).
$rewrites = @(
    @{ Old = '<title>Contact Us - CateringMS Catering Management Software</title>'; New = '<title>Contact us - CateringMS</title>' },
    @{ Old = '<title>Account Settings - CateringMS</title>'; New = '<title>Account settings - CateringMS</title>' },
    @{ Old = '<title>European Pricing - CateringMS Catering Management Software</title>'; New = '<title>European pricing - CateringMS</title>' },
    @{ Old = '<title>My Subscriptions & Invoices</title>'; New = '<title>My subscriptions and invoices - CateringMS</title>' },
    @{ Old = '<title>Catering Business Insights - CateringMS Blog</title>'; New = '<title>Catering business insights - CateringMS</title>' },
    @{ Old = '<title>My Orders - CateringMS</title>'; New = '<title>My orders - CateringMS</title>' },
    @{ Old = '<title>Client Search - CateringMS</title>'; New = '<title>Client search - CateringMS</title>' },
    @{ Old = '<title>Cashflow Dashboard - CateringMS</title>'; New = '<title>Cashflow dashboard - CateringMS</title>' },
    @{ Old = '<title>Admin Dashboard - CateringMS</title>'; New = '<title>Admin dashboard - CateringMS</title>' },
    @{ Old = '<title>Company Profile - CateringMS</title>'; New = '<title>Company profile - CateringMS</title>' },
    @{ Old = '<title>Driver Settlement - CateringMS</title>'; New = '<title>Driver settlement - CateringMS</title>' },
    @{ Old = '<title>Financial Dashboard - CateringMS</title>'; New = '<title>Financial dashboard - CateringMS</title>' },
    @{ Old = '<title>Lifecycle Emails - CateringMS</title>'; New = '<title>Lifecycle emails - CateringMS</title>' },
    @{ Old = '<title>Email Settings - CateringMS</title>'; New = '<title>Email settings - CateringMS</title>' },
    @{ Old = '<title>Lead Capture Forms - CateringMS</title>'; New = '<title>Lead capture forms - CateringMS</title>' },
    @{ Old = '<title>Privacy Policy - CateringMS Catering Management Platform</title>'; New = '<title>Privacy policy - CateringMS</title>' },
    @{ Old = '<title>HR Solutions - CateringMS</title>'; New = '<title>HR solutions - CateringMS</title>' },
    @{ Old = '<title>White Label Branding - CateringMS</title>'; New = '<title>White-label branding - CateringMS</title>' },
    @{ Old = '<title>US Pricing - CateringMS Catering Management Software</title>'; New = '<title>US pricing - CateringMS</title>' },
    @{ Old = '<title>Notification Settings - CateringMS</title>'; New = '<title>Notification settings - CateringMS</title>' },
    @{ Old = '<title>Messaging Templates - CateringMS</title>'; New = '<title>Messaging templates - CateringMS</title>' },
    @{ Old = '<title>User Management - CateringMS</title>'; New = '<title>User management - CateringMS</title>' },
    @{ Old = '<title>UK Pricing - CateringMS Catering Management Software</title>'; New = '<title>UK pricing - CateringMS</title>' },
    @{ Old = '<title>New Lead - CateringMS</title>'; New = '<title>New lead - CateringMS</title>' },
    @{ Old = '<title>AI Import - CateringMS</title>'; New = '<title>AI import - CateringMS</title>' },
    @{ Old = '<title>Payment Gateways - CateringMS</title>'; New = '<title>Payment gateways - CateringMS</title>' },
    @{ Old = '<title>System Settings - CateringMS</title>'; New = '<title>System settings - CateringMS</title>' },
    @{ Old = '<title>Lead Management & Quote Generation - CateringMS</title>'; New = '<title>Lead management and quote generation - CateringMS</title>' },
    @{ Old = '<title>Route Planning - CateringMS</title>'; New = '<title>Route planning - CateringMS</title>' },
    @{ Old = '<title>Kitchen Production Management - CateringMS</title>'; New = '<title>Kitchen production management - CateringMS</title>' },
    @{ Old = '<title>Booking Packages - CateringMS</title>'; New = '<title>Booking packages - CateringMS</title>' },
    @{ Old = '<title>GPS Tracking for Real-Time Delivery - CateringMS</title>'; New = '<title>GPS tracking for real-time delivery - CateringMS</title>' },
    @{ Old = '<title>Time Clock Log - CateringMS</title>'; New = '<title>Time clock log - CateringMS</title>' },
    @{ Old = '<title>Email Automation & Follow-Ups - CateringMS</title>'; New = '<title>Email automation and follow-ups - CateringMS</title>' },
    @{ Old = '<title>Smoke Test - CateringMS</title>'; New = '<title>Smoke test - CateringMS</title>' },
    @{ Old = '<title>Subscription Management - CateringMS</title>'; New = '<title>Subscription management - CateringMS</title>' },
    @{ Old = '<title>Job Progress - CateringMS</title>'; New = '<title>Job progress - CateringMS</title>' },
    @{ Old = '<title>Currency Monitoring - CateringMS</title>'; New = '<title>Currency monitoring - CateringMS</title>' },
    @{ Old = '<title>Platform Settings - CateringMS</title>'; New = '<title>Platform settings - CateringMS</title>' },
    @{ Old = '<title>Running Todo - CateringMS</title>'; New = '<title>Running todo - CateringMS</title>' },
    @{ Old = '<title>SA Tax Rules - CateringMS</title>'; New = '<title>SA tax rules - CateringMS</title>' }
)

$total = 0
foreach ($f in $files) {
    try {
        $orig = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    } catch { continue }
    if (-not $orig) { continue }
    $new = $orig
    foreach ($r in $rewrites) {
        $new = $new.Replace($r.Old, $r.New)
    }
    if ($new -ne $orig) {
        [System.IO.File]::WriteAllText($f.FullName, $new, (New-Object System.Text.UTF8Encoding($false)))
        $rel = $f.FullName.Substring($f.FullName.IndexOf('src\pages'))
        Write-Host "  changed: $rel"
        $total += 1
    }
}
Write-Host ""
Write-Host "Files touched: $total"
