# Phase 3 Roadmap: Payment, Analytics & App Store Deployment

**Target Timeline:** 2-4 weeks  
**Status:** Planning  
**Priority:** Critical for app store submission

---

## 🏦 Payment Integration (Week 1-2)

### Razorpay Setup
- [ ] Create Razorpay account + get API keys
- [ ] Add `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` to `.env`
- [ ] Implement webhook for payment confirmation

### Payment Flow
```
[Cart Summary] → [Select Payment Method] → [Razorpay Modal] → [Payment Status]
  ↓
[Backend: Update order.payment_status = 'charged']
  ↓
[Realtime: order-tracking updates]
```

### Frontend Changes
- Create `frontend/src/screens/payments.tsx`
  - UPI, Card, Net Banking, COD options
  - Razorpay integration (react-native-razorpay)
  - Payment status handling (pending → charged → success)

- Create `frontend/src/hooks/use-payment.ts`
  - `initiatePayment(amount, orderId)`
  - `handlePaymentCallback(response)`
  - Error recovery + retry logic

### Backend Changes
- Add payment verification endpoint: `POST /api/payments/verify`
- Add webhook handler: `POST /api/webhooks/razorpay`
- Store payment logs in `payments` table

### Database
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  amount FLOAT,
  currency TEXT DEFAULT 'INR',
  method TEXT, -- upi | card | netbanking | cod
  status TEXT, -- pending | charged | failed | refunded
  razorpay_payment_id TEXT UNIQUE,
  razorpay_order_id TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## 📊 Analytics Integration (Week 1)

### Firebase Analytics
```bash
npm install --save firebase
```

### Events to Track

| Event | Trigger | Properties |
|-------|---------|-----------|
| `view_item` | User opens product | product_id, name, price |
| `view_item_list` | User browses category | category, department |
| `add_to_cart` | User taps ADD | product_id, qty, price |
| `view_cart` | User opens cart | items_count, subtotal |
| `begin_checkout` | User starts checkout | total, item_count |
| `add_payment_info` | User selects payment | method, total |
| `purchase` | Order placed | order_id, revenue, items |
| `refund` | Payment refunded | order_id, amount |

### Implementation
```typescript
// frontend/src/lib/analytics.ts
import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';

const analytics = getAnalytics();

export const trackEvent = (eventName: string, params?: Record<string, any>) => {
  logEvent(analytics, eventName, params);
};

// Usage in components
<ProductCard onAdd={() => trackEvent('add_to_cart', { product_id })} />
```

### Dashboard Goals
- Conversion funnel: browse → add to cart → checkout → purchase
- Retention: DAU, MAU, repeat order rate
- Revenue: ARPU (Average Revenue Per User)
- Top products: bestsellers by category

---

## 🔐 App Store Compliance (Week 2-3)

### Privacy Policy
- [ ] Create `docs/PRIVACY_POLICY.md`
- [ ] Cover: data collection, usage, retention, deletion
- [ ] GDPR: User right to access, delete, export data
- [ ] Host on `https://onelatur.in/privacy` (or in-app WebView)

### Terms of Service
- [ ] Create `docs/TERMS_OF_SERVICE.md`
- [ ] Liability, payment terms, refund policy, dispute resolution

### Data Privacy Features
```typescript
// frontend/src/lib/privacy.ts

// 1. Data Export (GDPR Article 20)
export const exportUserData = async (userId: string) => {
  const { data: user } = await supabase.from('users').select('*').eq('id', userId);
  const { data: orders } = await supabase.from('orders').select('*').eq('user_id', userId);
  const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', userId);
  
  return { user, orders, addresses };
};

// 2. Data Deletion (GDPR Article 17)
export const deleteUserAccount = async (userId: string) => {
  await supabase.from('users').delete().eq('id', userId);
  await supabase.auth.admin.deleteUser(userId);
};

// 3. Analytics Opt-out
export const setAnalyticsOptOut = (optOut: boolean) => {
  localStorage.setItem('analytics_opt_out', String(optOut));
};
```

### App Permissions
```json
// app.json
{
  "plugins": [
    ["expo-camera", { "cameraPermission": "Allow access to camera" }],
    ["expo-location", { "locationAlwaysAndWhenInUsePermission": "Allow access to your location" }],
    ["expo-contacts", { "contactsPermission": "Allow access to contacts" }]
  ]
}
```

### Certificates & Signing

**iOS:**
- [ ] Create Apple Developer account ($99/year)
- [ ] Generate signing certificate + provisioning profile
- [ ] Build .ipa with EAS Build

**Android:**
- [ ] Create Google Play Developer account ($25 one-time)
- [ ] Generate signing keystore
- [ ] Build .aab with EAS Build

```bash
# Generate keystore for Android
keytool -genkey -v -keystore ~/one-local-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias one-local

# Build with EAS
eas build --platform android --type app-signing
eas build --platform ios --type app-signing
```

---

## 📱 Build & Deploy (Week 3-4)

### EAS (Expo Application Services)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Build for production
eas build --platform android --type app-signing
eas build --platform ios --type app-signing

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

### App Store Review Checklist

**iOS (App Store):**
- [ ] App name, description, keywords
- [ ] Screenshots (6 per device size)
- [ ] App preview video (15-30 sec)
- [ ] Support URL + privacy policy URL
- [ ] Age rating (Content rating form)
- [ ] Rights & agreements
- [ ] Build for App Store (not TestFlight)

**Android (Google Play):**
- [ ] App title, description, short description
- [ ] Screenshots (2-8)
- [ ] Feature graphic (1024×500)
- [ ] Privacy policy URL
- [ ] Alcohol/tobacco policy (if applicable)
- [ ] Build bundle (.aab)

### Staging Deployment

**TestFlight (iOS):**
```bash
eas submit --platform ios --latest
# Invite testers via App Store Connect
```

**Internal Testing (Android):**
```bash
eas submit --platform android --latest
# Invite testers via Google Play Console
```

---

## 🐛 Crash & Error Monitoring

### Sentry Setup
```typescript
import * as Sentry from "sentry-expo";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableInExpoDevelopment: true,
  tracesSampleRate: 1.0,
});

export default Sentry.wrap(App);
```

### Events to Monitor
- Payment failures
- Network errors (API timeouts)
- RLS policy violations
- Missing permissions

---

## 📊 Success Criteria

### Functional
- ✅ Payment completes end-to-end
- ✅ Order status updates in < 500ms
- ✅ User can export data (GDPR)
- ✅ User can delete account
- ✅ All analytics events fire correctly

### Performance
- ✅ App Store: < 50MB
- ✅ Initial load: < 2 seconds
- ✅ Payment modal: < 1 second
- ✅ No crashes (0% crash rate in testing)

### Compliance
- ✅ Privacy policy reviewed
- ✅ Terms of Service approved
- ✅ GDPR compliance verified
- ✅ Permissions requested properly
- ✅ App Store review passed

---

## 🚀 Launch Timeline

```
Week 1  │ ████ Payment integration
Week 2  │ ████ Analytics + Privacy
Week 3  │ ████ Build + Certificates
Week 4  │ ████ Submit + Review
        └─── Go Live (estimated 1-2 weeks review time)
```

---

## 📋 Deployment Checklist

Before going live:

- [ ] All payment tests passed
- [ ] Analytics dashboard shows data
- [ ] Privacy policy in app
- [ ] Delete account feature works
- [ ] No console errors on iOS/Android
- [ ] Crash rate: 0%
- [ ] Performance: acceptable
- [ ] Screenshots ready for app stores
- [ ] Privacy & compliance approved
- [ ] App Store + Google Play builds signed
- [ ] Webhooks tested (payment confirmation)
- [ ] Email notifications working (order status)

---

## 📞 Support & Monitoring (Post-Launch)

### Ongoing Tasks
- Monitor crash reports (Sentry)
- Track analytics funnel (Firebase)
- Respond to app store reviews
- Push updates via EAS Updates
- Monitor payment success rate
- Track order fulfillment metrics

### SLA Targets
- 99.9% uptime (Supabase)
- < 100ms API response time
- < 500ms order status update
- 24/7 customer support (email + in-app chat)

---

**Status:** Ready for Phase 3 implementation 🚀
