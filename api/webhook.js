const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
const FB_CAPI_ACCESS_TOKEN = process.env.FB_CAPI_ACCESS_TOKEN;
const FB_API_VERSION = 'v19.0';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Disable Vercel's automatic body parsing so we get the raw stream
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Send Purchase event to Facebook Conversions API
    try {
      const eventData = {
        data: [
          {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_source_url: 'https://tradeandtravelbook.com',
            user_data: {
              client_ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
              client_user_agent: req.headers['user-agent'] || '',
              // Include email if available from Stripe session
              ...(session.customer_details?.email && {
                em: [await hashSHA256(session.customer_details.email.toLowerCase().trim())],
              }),
            },
            custom_data: {
              currency: session.currency?.toUpperCase() || 'USD',
              value: (session.amount_total || 0) / 100,
            },
          },
        ],
      };

      const fbResponse = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/${FB_PIXEL_ID}/events?access_token=${FB_CAPI_ACCESS_TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData),
        }
      );

      const fbResult = await fbResponse.json();

      if (!fbResponse.ok) {
        console.error('Facebook CAPI error:', JSON.stringify(fbResult));
      } else {
        console.log('Facebook CAPI Purchase event sent:', fbResult);
      }
    } catch (fbErr) {
      // Log but don't fail the webhook — Stripe needs a 200
      console.error('Facebook CAPI request failed:', fbErr.message);
    }
  }

  return res.status(200).json({ received: true });
};

async function hashSHA256(value) {
  const { createHash } = require('crypto');
  return createHash('sha256').update(value).digest('hex');
}
