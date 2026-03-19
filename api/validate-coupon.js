const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    const { couponCode } = req.body || {};

    if (!couponCode || typeof couponCode !== 'string') {
      return res.status(400).json({ error: 'Please enter a coupon code.' });
    }

    const code = couponCode.trim();

    // Look up active promotion codes matching this code
    const promoCodes = await stripe.promotionCodes.list({
      code: code,
      active: true,
      limit: 1,
    });

    if (promoCodes.data.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired coupon code.' });
    }

    const promo = promoCodes.data[0];
    const coupon = promo.coupon;

    if (!coupon.valid) {
      return res.status(400).json({ error: 'This coupon is no longer valid.' });
    }

    return res.status(200).json({
      couponCode: promo.code,
      name: coupon.name || promo.code,
      percent_off: coupon.percent_off || null,
      amount_off: coupon.amount_off || null,
    });
  } catch (err) {
    console.error('Coupon validation error:', err.message);
    return res.status(500).json({ error: 'Could not validate coupon. Try again.' });
  }
};
