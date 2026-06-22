# CCCTS Portal Upgrade — End-to-End Test Report

Tested against the local Node/Express + SQLite server (`http://localhost:3000`) through the browser UI.
All flows from the latest upgrade pass.

## Summary

| # | Test | Result |
|---|------|--------|
| 1 | New student registration (programme, study mode, new/returning) | PASS |
| 2 | Matriculation gated on required documents | PASS |
| 3 | Single registration fee, no per-course prices | PASS |
| 4 | Study-mode switch with fee | PASS |
| 5 | Signed-in name + Visitors Portal shown site-wide | PASS |

## Details

### 1. New student registration
Registered "Samuel Adeyemi" as a **New Student**, programme **Year 1 – Certificate in Theology**, **Campus** mode.
Dashboard opens with status **pending**, profile showing programme/tier/type, and the header greeting "Hi, Samuel".

### 2. Matriculation gated on documents
The Registration Documents section lists the 6 required documents. With documents missing, the
"Request Matriculation Number" button is disabled ("Upload all documents to continue").
After all 6 documents are uploaded, the button enables; clicking it auto-issues
**CCCTS/CERT/2026/0006** and the status becomes **matriculated**.

### 3. Single registration fee (no per-course prices)
The course table shows only Course and Units — no per-course prices. After registering a course,
the Course Registration Fee panel shows a single **₦20,000** fee (by programme). Paying it marks
**Paid ₦20,000 / Outstanding ₦0** with a "Course registration" payment receipt.

### 4. Study-mode switch with fee
"Switch to Online (₦5,000)" changes the mode Campus→Online and records a **₦5,000** "Study mode switch fee"
payment. The card then offers "Switch to Campus (₦5,000)".

### 5. Auth display + Visitors Portal
The signed-in name "Hi, Samuel" + "Log Out" appears in the header on the dashboard, portal and home pages.
The portal hub shows the renamed **Visitors Portal** card. Home is a single nav link (no Campus/Online dropdown).

## Notes
- Matriculation is auto-issued once all required documents are uploaded (no staff approval step). Admin
  document review is the natural next phase.
- Payments use the existing mock flow; the verify step is the seam for Paystack/Flutterwave.
