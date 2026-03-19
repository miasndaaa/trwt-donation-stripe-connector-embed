const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const UNIT_PRICE = 2900; // $29.00 in cents
const RETURN_URL = process.env.RETURN_URL || 'https://tradeandtravelbook.com/thank-you';

module.exports = async (req, res) => {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { preorderQty = 0, donationQty = 0, needsShipping = false, couponCode } = req.body || {};

    const preorder = Math.max(0, Math.floor(Number(preorderQty)));
    const donation = Math.max(0, Math.floor(Number(donationQty)));

    if (preorder === 0 && donation === 0) {
      return res.status(400).json({ error: 'Please select at least one item.' });
    }

    const lineItems = [];

    if (preorder > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Trade & Travel Book — Your Copy',
          },
          unit_amount: UNIT_PRICE,
        },
        quantity: preorder,
      });
    }

    if (donation > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Trade & Travel Book — Donation',
          },
          unit_amount: UNIT_PRICE,
        },
        quantity: donation,
      });
    }

    const sessionParams = {
      ui_mode: 'embedded',
      mode: 'payment',
      line_items: lineItems,
      return_url: RETURN_URL + '?session_id={CHECKOUT_SESSION_ID}',
    };

    // Apply coupon if provided, otherwise let Stripe show its own promo code field
    if (couponCode && typeof couponCode === 'string') {
      const promoCodes = await stripe.promotionCodes.list({
        code: couponCode.trim(),
        active: true,
        limit: 1,
      });

      if (promoCodes.data.length > 0 && promoCodes.data[0].coupon.valid) {
        sessionParams.discounts = [{ promotion_code: promoCodes.data[0].id }];
      } else {
        // Coupon not found — fall back to letting user enter it in Stripe's checkout
        sessionParams.allow_promotion_codes = true;
      }
    } else {
      // No coupon from cart — show Stripe's built-in promo code field as fallback
      sessionParams.allow_promotion_codes = true;
    }

    // Collect shipping address if they're ordering copies for themselves
    if (needsShipping) {
      sessionParams.shipping_address_collection = {
        allowed_countries: ['US', 'CA', 'GB', 'AU'],
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
