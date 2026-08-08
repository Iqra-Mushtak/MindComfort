const Stripe = require('stripe');

const isTestMode = process.env.NODE_ENV !== 'production';

let stripe = null;

const getStripeInstance = () => {
  if (!stripe) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripe = new Stripe(apiKey);
  }
  return stripe;
};

const createPaymentIntent = async (amount, metadata = {}) => {
  try {
    const stripeInstance = getStripeInstance();
    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: Math.round(amount * 100), 
      currency: 'pkr',
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
    return paymentIntent;
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

const verifyWebhookSignature = (body, signature) => {
  try {
    if (!body) {
      throw new Error('Webhook body is missing - cannot verify signature');
    }
    if (!signature) {
      throw new Error('Stripe signature header is missing');
    }
    
    const stripeInstance = getStripeInstance();
    const event = stripeInstance.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return event;
  } catch (error) {
    console.error('❌ Webhook signature verification error:', error.message);
    throw error;
  }
};

const getPaymentIntent = async (paymentIntentId) => {
  try {
    const stripeInstance = getStripeInstance();
    const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    throw error;
  }
};

const refundPayment = async (chargeId, amount = null) => {
  try {
    const stripeInstance = getStripeInstance();
    const refundParams = {
      charge: chargeId,
    };
    if (amount) {
      refundParams.amount = Math.round(amount * 100); // Convert to cents
    }
    const refund = await stripeInstance.refunds.create(refundParams);
    return refund;
  } catch (error) {
    console.error('Error creating refund:', error);
    throw error;
  }
};

const createCheckoutSession = async (planData, metadata = {}) => {
  try {
    const stripeInstance = getStripeInstance();
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'pkr',
            product_data: {
              name: planData.name,
              description: planData.description || '',
            },
            unit_amount: Math.round(planData.price * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/client/plans`,
      metadata,
    });
    return session;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

module.exports = {
  getStripeInstance,
  createPaymentIntent,
  createCheckoutSession,
  verifyWebhookSignature,
  getPaymentIntent,
  refundPayment,
  isTestMode,
};
