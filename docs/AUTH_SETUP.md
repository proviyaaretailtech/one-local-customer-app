# Supabase Authentication Setup Guide

## 🔐 Quick Start — Supabase Auth

### 1. Enable Auth in Supabase Dashboard

1. Go to **Supabase Dashboard → Authentication**
2. Click **Get Started**
3. Enable providers:
   - ✅ **Email/Password** (required)
   - ✅ **Google OAuth** (recommended)
   - ✅ **Magic Links** (nice-to-have)

### 2. Configure Email Provider

**Settings → Email:**
- Email sender: noreply@onelatur.in (custom domain)
- SMTP settings (optional, uses Supabase default)

**Email templates (auto-generated):**
- Signup confirmation
- Password reset
- Email change verification

### 3. Configure OAuth (Google)

1. Go to **Google Cloud Console**
2. Create OAuth 2.0 credentials:
   - Redirect URI: `https://ywylhzcxuoeilygzdonx.supabase.co/auth/v1/callback`
3. Copy Client ID + Secret
4. Add to Supabase Auth → Google Provider
5. Save

### 4. Configure Redirect URLs

**Settings → Authentication → URL Configuration:**

```
Redirect URLs:
- http://localhost:19006/auth/callback      (local web)
- exp://localhost:19006/auth/callback       (Expo local)
- one-latur://auth/callback                 (deep link)
- https://app.onelatur.in/auth/callback     (production)
```

---

## 🎯 Frontend Implementation

### SignUp Flow

```typescript
// frontend/src/screens/auth/signup.tsx

import { supabase } from '../../lib/supabase'
import { useState } from 'react'

export function SignUpScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignUp = async () => {
    try {
      setLoading(true)
      setError('')

      // Sign up with email/password
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) throw signUpError

      // Create user profile (optional)
      await supabase.from('users').insert({
        id: data.user?.id,
        email: data.user?.email,
        role: 'customer',
        city: 'latur',
      })

      // Success! Redirect to email verification
      alert(`Verification email sent to ${email}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        title={loading ? 'Creating account...' : 'Sign Up'}
        onPress={handleSignUp}
        disabled={loading}
      />
      {error && <Text style={{ color: 'red' }}>{error}</Text>}
    </View>
  )
}
```

### SignIn Flow

```typescript
// frontend/src/screens/auth/signin.tsx

export function SignInScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // ✅ Authenticated! Session stored automatically
      // Supabase sets auth token in localStorage (web) or secure storage (mobile)
      navigation.replace('(tabs)')
    } catch (err: any) {
      Alert.alert('Sign In Failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  // ... UI similar to SignUp
}
```

### Google OAuth

```typescript
// frontend/src/screens/auth/signin.tsx

export function SignInScreen() {
  const handleGoogleSignIn = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'one-latur://auth/callback',
        },
      })

      if (error) throw error
      // ✅ Opens Google OAuth flow, returns to app
    } catch (err: any) {
      Alert.alert('Google Sign In Failed', err.message)
    }
  }

  return (
    <Button
      title="Sign In with Google"
      onPress={handleGoogleSignIn}
    />
  )
}
```

### Magic Links (Email-only)

```typescript
// Passwordless authentication

const { data, error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
})

// User receives email with login link
// Clicking link logs them in automatically
```

### Session Persistence

```typescript
// frontend/src/app/_layout.tsx

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    // Get current session on app load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session)
        // Handle auth events: SIGNED_IN, SIGNED_OUT, USER_UPDATED
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  return session ? <AppTabs /> : <AuthStack />
}
```

### Sign Out

```typescript
const handleSignOut = async () => {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    // ✅ Session cleared, redirect to login
  } catch (err: any) {
    console.error('Sign out failed:', err)
  }
}
```

---

## 🔑 Token Management

### JWT Tokens

Supabase Auth generates two JWT tokens:

**1. Access Token (short-lived)**
- Expires: 1 hour
- Used for: API requests
- Stored: localStorage (web) or SecureStore (mobile)

**2. Refresh Token (long-lived)**
- Expires: 7 days
- Used for: Getting new access tokens
- Stored: Secure storage only (never exposed)

### Auto-refresh

Supabase handles auto-refresh automatically:

```typescript
// No need to manually refresh! This happens behind the scenes:
const { data, error } = await supabase.from('orders').select('*')
// If access token expired, Supabase uses refresh token to get new one
// Then retries the request
```

### Custom Claims (Role-based Access)

```typescript
// Add role to JWT claims
const { data, error } = await supabase
  .rpc('set_user_role', { user_id: userId, role: 'merchant' })

// Now RLS policies can use auth.jwt() ->> 'role'
CREATE POLICY "merchant_orders" ON orders
  USING (
    auth.jwt() ->> 'role' = 'merchant'
    OR auth.uid() = user_id
  )
```

---

## 🛡️ Security Best Practices

### 1. Secure Storage (Mobile)

```typescript
// frontend/src/lib/secure-storage.ts

import * as SecureStore from 'expo-secure-store'

export async function saveAuthToken(token: string) {
  await SecureStore.setItemAsync('auth_token', token)
}

export async function getAuthToken() {
  return await SecureStore.getItemAsync('auth_token')
}

// Supabase mobile client uses this automatically
```

### 2. Prevent XSS Attacks

✅ **Do:**
```typescript
// Use Supabase Auth built-in protections
const { data } = await supabase.auth.getUser()
```

❌ **Don't:**
```typescript
// Don't store token in plain localStorage
localStorage.setItem('token', token)
```

### 3. Environment Variables

```bash
# .env
SUPABASE_ANON_KEY=sb_publishable_...  # Safe to expose (read-only)
SUPABASE_SERVICE_ROLE_KEY=...         # NEVER expose! (admin only)
```

### 4. Password Requirements

**Supabase defaults:**
- Minimum 6 characters
- Customize in Auth settings

**Recommended:**
```
- Minimum 8 characters
- At least 1 uppercase
- At least 1 number
- At least 1 special character (!@#$%^&*)
```

### 5. Rate Limiting

Supabase auth has built-in rate limits:
- Max 3 failed login attempts per minute
- Max 3 signup requests per minute per IP
- Configurable in dashboard

---

## 🧪 Testing Authentication

### Test Users

**Demo credentials:**
```
Email: customer@test.com
Password: Test@1234

Email: rider@test.com
Password: Test@1234

Email: merchant@test.com
Password: Test@1234
```

### Testing Flows

1. **Email/Password signup**
   - Enter email + password
   - Should receive confirmation email
   - Click link to verify
   - ✅ Can now sign in

2. **Email/Password signin**
   - Enter credentials
   - ✅ Gets JWT token
   - ✅ Session persists

3. **Google OAuth**
   - Click "Sign in with Google"
   - ✅ Opens OAuth dialog
   - ✅ Returns to app authenticated

4. **Password Reset**
   - Click "Forgot Password"
   - Enter email
   - ✅ Receives reset link
   - Set new password
   - ✅ Can sign in with new password

### API Testing (cURL)

```bash
# Sign up
curl -X POST https://ywylhzcxuoeilygzdonx.supabase.co/auth/v1/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234"
  }'

# Sign in
curl -X POST https://ywylhzcxuoeilygzdonx.supabase.co/auth/v1/token?grant_type=password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234"
  }'

# Get user (requires Authorization header)
curl -X GET https://ywylhzcxuoeilygzdonx.supabase.co/auth/v1/user \
  -H "Authorization: Bearer <access_token>"
```

---

## 🚨 Common Issues & Fixes

### Issue: "Email not verified"
**Cause:** User hasn't clicked verification link
**Fix:** Resend confirmation email or skip verification (dev mode)

### Issue: "Invalid refresh token"
**Cause:** Refresh token expired (7 days)
**Fix:** User must sign in again

### Issue: "Google OAuth redirect failed"
**Cause:** Redirect URI not in whitelist
**Fix:** Add to Supabase Auth → URL Configuration

### Issue: "Cannot read user (401 Unauthorized)"
**Cause:** Invalid or expired access token
**Fix:** Check token in request header or refresh token

### Issue: "User already exists"
**Cause:** Email already registered
**Fix:** Use sign in instead of sign up

---

## 📋 Auth Flow Diagram

```
┌─────────────────────────────────────────────────┐
│                  User Arrives                   │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │  Is signed in?│
         └───┬───────┬───┘
             │       │
            NO      YES
             │       │
             ▼       ▼
         ┌────┐   ┌─────────────┐
         │Auth│   │ Show App    │
         │Page│   │ (Tabs)      │
         └────┘   └─────────────┘
             │
         ┌───┴──────────────────┐
         │                      │
         ▼                      ▼
    ┌─────────┐           ┌──────────┐
    │ Sign Up │           │ Sign In  │
    └────┬────┘           └────┬─────┘
         │                     │
         ▼                     ▼
    ┌──────────────┐     ┌──────────────┐
    │Verify Email  │     │Enter Creds   │
    └────┬─────────┘     └────┬─────────┘
         │                    │
         └────────┬───────────┘
                  │
                  ▼
         ┌────────────────────┐
         │ Get JWT Token      │
         │ Store in SecStore  │
         │ Set Session        │
         └────────┬───────────┘
                  │
                  ▼
         ┌────────────────────┐
         │ Show App           │
         │ Make Authenticated │
         │ API Requests       │
         └────────────────────┘
```

---

## ✅ Verification Checklist

- [ ] Supabase Auth enabled (Email/Password)
- [ ] Google OAuth configured
- [ ] Redirect URLs added
- [ ] Email templates tested
- [ ] SignUp screen working
- [ ] SignIn screen working
- [ ] Session persists on app reload
- [ ] Sign out clears session
- [ ] Forgot password works
- [ ] Google OAuth works
- [ ] JWT tokens valid
- [ ] RLS policies work with auth.uid()
- [ ] Test users created

---

## 🚀 Production Checklist

- [ ] Custom domain email sender configured
- [ ] OAuth secrets stored in .env (not committed)
- [ ] HTTPS enforced
- [ ] Rate limiting verified
- [ ] Email templates branded
- [ ] Password requirements set
- [ ] Support email configured
- [ ] Privacy policy linked
- [ ] GDPR compliance checked

---

**Authentication is ready! 🎉**

Next: Test locally, then prepare for Phase 3 (payments + app store).
