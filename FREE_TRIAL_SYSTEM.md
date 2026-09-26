# Free Trial Implementation (7-Day System)

## Overview
Users now get a 7-day free trial when they sign up. After 7 days, they must upgrade to a paid plan (Pro or Enterprise) to continue using the app.

## How It Works

### 1. **User Signup**
- When a user creates an account via the Auth page, the system automatically:
  - Creates a Supabase auth account
  - Creates a `user_subscriptions` record with:
    - `status`: 'active'
    - `expires_at`: Current date + 7 days
    - `payment_reference`: 'free_trial_7days'
    - `amount_paid`: 0

### 2. **Trial Period (Days 1-7)**
- Users have full access to the app
- TrialCountdown component displays remaining days in the UI
- After 3 days remaining, a warning appears prompting them to upgrade

### 3. **Trial Expiration (Day 8+)**
- The app automatically redirects users to `/plans` if their subscription has expired
- They can no longer access the dashboard without choosing a paid plan
- An "Expired" message is shown in the TrialCountdown component

### 4. **Upgrade Path**
- Users can upgrade anytime during the trial by clicking "Upgrade" in the TrialCountdown component
- Or they can select Pro (UGX 100,000/month) or Enterprise (UGX 350,000/month) on the Plans page
- After payment verification by admin, their subscription is renewed

## Files Modified

### 1. **Auth.tsx** (`src/pages/Auth.tsx`)
- Enhanced `handleSignup()` to create a 7-day trial subscription immediately after signup
- Uses Supabase to insert a new record in `user_subscriptions`

### 2. **Plans.tsx** (`src/pages/Plans.tsx`)
- Updated `handleSelectPlan()` to create a 7-day trial for the Basic plan
- Changed expiration from 10 years to 7 days

### 3. **SubscriptionProvider.tsx** (`src/providers/SubscriptionProvider.tsx`)
- Added helper functions:
  - `calculateDaysRemaining()`: Calculates remaining trial days
  - `isTrialSubscription()`: Checks if subscription is a trial
- Added new context values:
  - `isTrialActive`: Boolean, true if active trial subscription
  - `daysRemaining`: Number of days left in trial
  - `isTrialExpiring`: Boolean, true if 3 days or less remaining
- Added auto-warning toast when trial is expiring (3 days or less)
- Real-time subscription monitoring with Supabase

### 4. **TrialCountdown.tsx** (NEW component) (`src/components/TrialCountdown.tsx`)
- Displays trial status in the UI with three states:
  - **Active Trial (4+ days)**: Blue box showing days remaining with upgrade button
  - **Expiring Soon (1-3 days)**: Amber warning alert with prominent upgrade button
  - **Expired (0 days)**: Red alert prompting immediate upgrade

### 5. **Layout.tsx** (`src/components/Layout.tsx`)
- Added import for TrialCountdown component
- Integrated TrialCountdown at the top of main content area
- Shows to all authenticated users (not just during trial)

## Database Changes

No migration required! The `user_subscriptions` table already has:
- `expires_at` column (timestamp)
- `payment_reference` column (string)
- Support for `is_trial` field (if needed in future)

## User Experience Flow

```
User Signs Up
    ↓
7-Day Free Trial Created (active subscription)
    ↓
Days 1-3: Can access app normally, TrialCountdown shows days left
    ↓
Days 4-7: Warning alerts appear when 3 days remain
    ↓
Day 8: Redirected to Plans page, cannot access app
    ↓
Upgrade to Paid Plan
    ↓
Full Access Restored
```

## Configuration

### Trial Duration
To change the trial period from 7 days:

1. **Auth.tsx** (line ~150):
```typescript
trialExpiresAt.setDate(trialExpiresAt.getDate() + 7); // Change 7 to desired days
```

2. **Plans.tsx** (line ~47):
```typescript
expiresAt.setDate(expiresAt.getDate() + 7); // Change 7 to desired days
```

### Warning Threshold
To change when the warning shows (currently 3 days):

**SubscriptionProvider.tsx** (line ~55):
```typescript
const isTrialExpiring = isTrialActive && daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0;
// Change 3 to desired days
```

## Testing

### Manual Testing

1. **New Account with Trial**:
   - Sign up with new email
   - Verify TrialCountdown shows "Free Trial: 7 days remaining"
   - Confirm user can access app

2. **Trial Expiration**:
   - In database, manually update expiration to past date
   - Refresh app
   - User should be redirected to Plans page

3. **Warning Alert**:
   - Set expiration to 2 days from now
   - Navigate to app
   - Should see amber warning alert

### Database Queries

Check active trials:
```sql
SELECT user_id, expires_at, status 
FROM user_subscriptions 
WHERE payment_reference = 'free_trial_7days' 
AND status = 'active'
ORDER BY created_at DESC;
```

Check expired trials:
```sql
SELECT user_id, expires_at, status 
FROM user_subscriptions 
WHERE payment_reference = 'free_trial_7days' 
AND expires_at < NOW();
```

## Admin Considerations

### Extending Trials
Admins can extend a user's trial by updating the expiration date:
```sql
UPDATE user_subscriptions 
SET expires_at = NOW() + INTERVAL '7 days'
WHERE user_id = 'USER_ID' 
AND payment_reference = 'free_trial_7days';
```

### Converting to Paid
When a user pays during trial, create a new paid subscription record instead of modifying the trial.

### Monitoring
Can track trial conversions through:
- Trial users who never upgraded (expired with no paid record)
- Trial users who upgraded to Pro/Enterprise
- Average time from trial to upgrade

## Future Enhancements

1. **Analytics Dashboard**: Track trial-to-paid conversion rate
2. **Trial Extension**: Allow one-time extension if needed
3. **Custom Trial Period**: Different trial lengths for different user types
4. **Abandoned Trial Email**: Send reminder before expiration
5. **Free Plan Option**: Keep free forever for limited features
