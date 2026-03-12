const Stripe = require("stripe");

// Product catalog — prices defined here, IDs set in Netlify env vars
// Set STRIPE_SECRET_KEY, STRIPE_TSHIRT_PRICE_ID, STRIPE_STICKER_PRICE_ID
// in your Netlify site settings → Environment variables.

const PRODUCTS = {
  "kong-tshirt": {
    priceEnvKey: "STRIPE_TSHIRT_PRICE_ID",
    name: "Kong T-Shirt",
  },
  "sticker-pack": {
    priceEnvKey: "STRIPE_STICKER_PRICE_ID",
    name: "Sticker Pack",
  },
};

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { productSlug, size } = body;

    const product = PRODUCTS[productSlug];
    if (!product) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Unknown product" }),
      };
    }

    const priceId = process.env[product.priceEnvKey];
    if (!priceId) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Price not configured for ${product.name}. Set ${product.priceEnvKey} in Netlify environment variables.` }),
      };
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const origin = event.headers.origin || event.headers.referer || "https://kongconcentrates.com";
    const baseUrl = origin.replace(/\/$/, "");

    const sessionParams = {
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/merch/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/merch/${productSlug}/`,
    };

    // Add size as custom field for t-shirt
    if (productSlug === "kong-tshirt" && size) {
      sessionParams.custom_fields = [
        {
          key: "size",
          label: { type: "custom", custom: "Size" },
          type: "text",
          text: { default_value: size },
        },
      ];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Stripe error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
