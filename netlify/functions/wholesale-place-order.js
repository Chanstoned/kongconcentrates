const { createClient } = require("@supabase/supabase-js");
const { sendOrderConfirmation } = require("./email-helper");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  // Verify the user's session
  const authHeader = event.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  const token = authHeader.slice(7);

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };

  // Verify the dispensary is approved
  const { data: dispensary } = await supabaseAdmin
    .from("dispensaries")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!dispensary || !dispensary.approved) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Account not approved" }) };
  }

  try {
    const { items, notes, creditApplied: rawCredit } = JSON.parse(event.body || "{}");

    if (!items || !items.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No items provided" }) };
    }

    const subtotal = items.reduce((sum, it) => sum + Number(it.subtotal), 0);

    // Validate requested credit
    const requestedCredit = Math.round((Number(rawCredit) || 0) * 100) / 100;
    const availableCredit = Math.floor((dispensary.reward_points || 0) / 100) * 5;
    const creditApplied = Math.min(requestedCredit, availableCredit, subtotal);

    if (creditApplied < 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid credit amount" }) };
    }

    const total = Math.round((subtotal - creditApplied) * 100) / 100;
    const pointsToDeduct = Math.round((creditApplied / 5) * 100);
    const pointsToEarn = Math.floor(total);
    const newPoints = (dispensary.reward_points || 0) - pointsToDeduct + pointsToEarn;

    // Insert the order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("wholesale_orders")
      .insert({
        dispensary_id: user.id,
        status: "received",
        total,
        credit_applied: creditApplied,
        points_earned: pointsToEarn,
        notes: notes || null,
      })
      .select()
      .single();
    if (orderErr) throw orderErr;

    // Insert order items
    const { error: itemsErr } = await supabaseAdmin
      .from("wholesale_order_items")
      .insert(
        items.map((it) => ({
          order_id: order.id,
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          subtotal: it.subtotal,
        }))
      );
    if (itemsErr) throw itemsErr;

    // Update dispensary reward points
    const { error: ptsErr } = await supabaseAdmin
      .from("dispensaries")
      .update({ reward_points: Math.max(0, newPoints) })
      .eq("id", user.id);
    if (ptsErr) throw ptsErr;

    await sendOrderConfirmation({ order, items, dispensary });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, orderId: order.id, reward_points: Math.max(0, newPoints) }),
    };
  } catch (e) {
    console.error("wholesale-place-order error:", e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
