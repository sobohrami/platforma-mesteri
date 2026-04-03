const Stripe = require('stripe');
const config = require('../config');

function getStripe() {
  if (!config.stripe.secretKey) return null;
  return new Stripe(config.stripe.secretKey);
}

async function createCheckoutSession({
  userId,
  paymentType,
  successUrl,
  cancelUrl,
  metadata = {},
  lineItemPriceData = null,
}) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe nu este configurat.');
  let line_items;
  if (paymentType === 'subscription' && config.stripe.priceVip) {
    line_items = [{ price: config.stripe.priceVip, quantity: 1 }];
  } else if (paymentType === 'verification' && config.stripe.priceVerification) {
    line_items = [{ price: config.stripe.priceVerification, quantity: 1 }];
  } else if (paymentType === 'promotion' && lineItemPriceData) {
    line_items = [{ price_data: lineItemPriceData, quantity: 1 }];
  } else if (paymentType === 'verification') {
    line_items = [
      {
        price_data: {
          currency: 'ron',
          unit_amount: 9900,
          product_data: { name: 'Verificare profil meșter' },
        },
        quantity: 1,
      },
    ];
  } else {
    line_items = [
      {
        price_data: {
          currency: 'ron',
          unit_amount: 10000,
          product_data: { name: 'Serviciu platformă' },
        },
        quantity: 1,
      },
    ];
  }
  const session = await stripe.checkout.sessions.create({
    mode: paymentType === 'subscription' ? 'subscription' : 'payment',
    line_items,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(userId),
    metadata: { ...metadata, payment_type: paymentType, user_id: String(userId) },
  });
  return session;
}

module.exports = { getStripe, createCheckoutSession };
