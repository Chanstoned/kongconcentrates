const Stripe = require("stripe");

// Product catalog — product IDs and prices defined here.
// Only STRIPE_SECRET_KEY needs to be set in Netlify environment variables.
const PRODUCTS = {
  "kong-tshirt": {
    productId: "prod_U8GMZnTnZCHiBz",
    name: "Kong T-Shirt",
    amount: 4000, // $40.00 in cents
    currency: "usd",
  },
  "sticker-pack": {
    productId: "prod_U8HAxaDHrSph2P",
    name: "Sticker Pack",
    amount: 1000, // $10.00 in cents
    currency: "usd",
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

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const origin = event.headers.origin || event.headers.referer || "https://kongconcentrates.com";
    const baseUrl = origin.replace(/\/$/, "");

    const sessionParams = {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: product.currency,
            product: product.productId,
            unit_amount: product.amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/merch/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/merch/${productSlug}/`,
    };

    // Add size as custom field for t-shirt
    if (productSlug === "kong-tshirt" && size) {
      sessionParams.custom_fields = [
        {
          key: "size",
          label: { type: "custom", custom: "Size" },
          type: "dropdown",
          dropdown: {
            options: [
              { label: "Small", value: "S" },
              { label: "Medium", value: "M" },
              { label: "Large", value: "L" },
              { label: "X-Large", value: "XL" },
              { label: "XX-Large", value: "XXL" },
            ],
            default_value: size,
          },
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
