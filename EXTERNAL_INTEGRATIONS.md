# External Service Integration Guide

This document outlines the integration points for external services in the Indian webstore application, specifically focusing on OTP services and payment gateways.

## 🔐 OTP (SMS) Service Integration

### Current Implementation
- **File**: `server/otp-service.ts`
- **Status**: Currently mocked for development
- **Mock Behavior**: Accepts any 6-digit OTP for phone verification

### Production Integration Options

#### 1. Twilio (Recommended)
```javascript
// Install: npm install twilio
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

await client.messages.create({
  body: `Your OTP is: ${otp}. Valid for 5 minutes.`,
  from: process.env.TWILIO_PHONE_NUMBER,
  to: `+91${phone}`
});
```

**Required Environment Variables:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN` 
- `TWILIO_PHONE_NUMBER`

#### 2. TextLocal (India-focused)
```javascript
// Install: npm install textlocal
const textlocal = require('textlocal');

const tl = new textlocal({
  apiKey: process.env.TEXTLOCAL_API_KEY,
  sender: process.env.TEXTLOCAL_SENDER_ID
});

await tl.sendSMS({
  numbers: [phone],
  message: `Your OTP is: ${otp}. Valid for 5 minutes.`
});
```

**Required Environment Variables:**
- `TEXTLOCAL_API_KEY`
- `TEXTLOCAL_SENDER_ID`

#### 3. AWS SNS
```javascript
// Install: npm install aws-sdk
const AWS = require('aws-sdk');
const sns = new AWS.SNS({ region: 'ap-south-1' });

await sns.publish({
  PhoneNumber: `+91${phone}`,
  Message: `Your OTP is: ${otp}. Valid for 5 minutes.`
}).promise();
```

**Required Environment Variables:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

#### 4. Fast2SMS (India-focused)
```javascript
// Install: npm install fast-two-sms
const fast2sms = require('fast-two-sms');

await fast2sms.sendMessage({
  authorization: process.env.FAST2SMS_API_KEY,
  message: `Your OTP is: ${otp}. Valid for 5 minutes.`,
  numbers: [phone]
});
```

**Required Environment Variables:**
- `FAST2SMS_API_KEY`

### Integration Steps
1. Choose an SMS provider from above
2. Sign up and get API credentials
3. Set environment variables in your deployment
4. Replace the mock implementation in `server/otp-service.ts`
5. Test with real phone numbers

## 💳 Payment Gateway Integration

### Current Implementation
- **File**: `server/routes.ts` (checkout endpoint)
- **Status**: Currently mocked - automatically marks payments as "completed"
- **Mock Behavior**: Accepts UPI payment method and simulates success

### Production Integration Options

#### 1. Razorpay (Recommended for India)
```javascript
// Install: npm install razorpay
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create order
const order = await razorpay.orders.create({
  amount: total * 100, // Amount in paise
  currency: 'INR',
  receipt: orderId
});

// Verify payment
const isValid = razorpay.utils.validatePaymentSignature({
  order_id: order.id,
  payment_id: paymentId,
  signature: signature
});
```

**Required Environment Variables:**
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

**Frontend Integration:**
```javascript
// Add Razorpay checkout script
const options = {
  key: process.env.VITE_RAZORPAY_KEY_ID,
  amount: total * 100,
  currency: 'INR',
  order_id: orderId,
  handler: function(response) {
    // Send payment details to backend for verification
  }
};

const rzp = new window.Razorpay(options);
rzp.open();
```

#### 2. PayU (India-focused)
```javascript
// Install: npm install payu-websdk
const PayU = require('payu-websdk');

const payu = new PayU({
  merchantId: process.env.PAYU_MERCHANT_ID,
  secretKey: process.env.PAYU_SECRET_KEY,
  mode: 'production' // or 'test'
});

const paymentData = {
  amount: total,
  productInfo: 'Order Payment',
  firstName: customerName,
  email: customerEmail,
  phone: customerPhone,
  txnid: orderId
};

const paymentUrl = payu.createPaymentForm(paymentData);
```

**Required Environment Variables:**
- `PAYU_MERCHANT_ID`
- `PAYU_SECRET_KEY`

#### 3. CCAvenue
```javascript
// Install: npm install ccavenue-crypto
const ccav = require('ccavenue-crypto');

const encryptedData = ccav.encrypt(paymentData, process.env.CCAVENUE_WORKING_KEY);
const accessCode = process.env.CCAVENUE_ACCESS_CODE;
const merchantId = process.env.CCAVENUE_MERCHANT_ID;
```

**Required Environment Variables:**
- `CCAVENUE_MERCHANT_ID`
- `CCAVENUE_ACCESS_CODE`
- `CCAVENUE_WORKING_KEY`

#### 4. Stripe (International)
```javascript
// Install: npm install stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const paymentIntent = await stripe.paymentIntents.create({
  amount: total * 100, // Amount in paise
  currency: 'inr',
  metadata: { orderId }
});
```

**Required Environment Variables:**
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`

### Integration Steps
1. Choose a payment gateway from above
2. Sign up for merchant account and get API credentials
3. Set environment variables in your deployment
4. Update the checkout endpoint in `server/routes.ts`:
   - Replace mock payment completion with real payment processing
   - Add payment verification logic
   - Handle payment success/failure scenarios
5. Update frontend checkout form to use payment gateway UI
6. Test with test credentials first, then switch to production

### Integration Points in Code

#### Backend (server/routes.ts)
```javascript
// Current mock implementation (line ~226):
paymentStatus: 'completed', // Mock successful payment

// Replace with:
paymentStatus: 'pending', // Set to pending initially
// Add payment processing logic here
// Update status after payment verification
```

#### Frontend Payment Flow
1. **Checkout Form** (`client/src/pages/checkout.tsx`): Already collects payment method
2. **Payment Processing**: Add payment gateway integration after form submission
3. **Order Confirmation**: Update to handle payment success/failure responses

## 🔧 Development vs Production

### Development Mode
- OTP: Any 6-digit code accepted
- Payment: Automatically marked as successful
- Perfect for testing application flow

### Production Mode
- OTP: Real SMS delivery required
- Payment: Real payment processing required
- Proper error handling and edge cases needed

## 📋 Deployment Checklist

Before going live:
- [ ] Choose and integrate OTP service provider
- [ ] Choose and integrate payment gateway
- [ ] Set all required environment variables
- [ ] Test with real phone numbers and payment methods
- [ ] Implement proper error handling
- [ ] Set up webhooks for payment status updates
- [ ] Test refund/cancellation flows
- [ ] Ensure PCI compliance for payment data
- [ ] Set up monitoring and logging

## 🛡️ Security Considerations

1. **Never store sensitive payment data** in your database
2. **Use HTTPS** for all payment-related communications
3. **Validate all payment signatures** on the server side
4. **Implement rate limiting** for OTP requests
5. **Log payment transactions** for audit purposes
6. **Use environment variables** for all API keys and secrets

## 📞 Support Contacts

When integrating, keep these support resources handy:
- **Razorpay**: https://razorpay.com/support/
- **Twilio**: https://support.twilio.com/
- **TextLocal**: https://www.textlocal.in/support/
- **PayU**: https://www.payu.in/support/

This documentation should help you seamlessly integrate real external services when you're ready to go live with your Indian webstore application.