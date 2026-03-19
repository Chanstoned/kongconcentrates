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

    const subtotal = Math.round(items.reduce((sum, it) => sum + Number(it.subtotal), 0) * 100) / 100;

    // Minimum order
    if (subtotal < 600) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Minimum order is $600." }) };
    }

    // Validate requested credit — capped at product subtotal only; delivery fee is always charged
    const requestedCredit = Math.round((Number(rawCredit) || 0) * 100) / 100;
    const availableCredit = Math.floor((dispensary.reward_points || 0) / 100) * 5;
    const creditApplied = Math.min(requestedCredit, availableCredit, subtotal);

    if (creditApplied < 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid credit amount" }) };
    }

    // Delivery fee — $50 when cash after credit is under $900
    const cashAfterCredit = Math.round((subtotal - creditApplied) * 100) / 100;
    const deliveryFee = cashAfterCredit < 900 ? 50 : 0;

    const total = Math.round((cashAfterCredit + deliveryFee) * 100) / 100;
    const pointsToDeduct = Math.round((creditApplied / 5) * 100);
    const pointsToEarn = Math.floor(total);
    const newPoints = (dispensary.reward_points || 0) - pointsToDeduct + pointsToEarn;

    // Insert the order (base columns only — always works)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("wholesale_orders")
      .insert({
        dispensary_id: user.id,
        status: "received",
        total,
        notes: notes || null,
      })
      .select()
      .single();
    if (orderErr) throw orderErr;

    // Insert order items (plus delivery fee line if applicable)
    const lineItems = items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.subtotal,
    }));
    if (deliveryFee > 0) {
      lineItems.push({ order_id: order.id, product_id: null, product_name: "Delivery Fee", quantity: 1, unit_price: deliveryFee, subtotal: deliveryFee });
    }
    const { error: itemsErr } = await supabaseAdmin.from("wholesale_order_items").insert(lineItems);
    if (itemsErr) throw itemsErr;

    // Update rewards columns and points balance (requires migration to have been run)
    await supabaseAdmin
      .from("wholesale_orders")
      .update({ credit_applied: creditApplied, points_earned: pointsToEarn })
      .eq("id", order.id)
      .then(({ error }) => { if (error) console.warn("rewards columns not yet migrated:", error.message); });

    await supabaseAdmin
      .from("dispensaries")
      .update({ reward_points: Math.max(0, newPoints) })
      .eq("id", user.id)
      .then(({ error }) => { if (error) console.warn("reward_points column not yet migrated:", error.message); });

    // Attach image_url from products so emails show the correct image per product
    const productIds = items.map((it) => it.product_id).filter(Boolean);
    let imgMap = {};
    if (productIds.length) {
      const { data: prods } = await supabaseAdmin.from("wholesale_products").select("id, image_url").in("id", productIds);
      if (prods) prods.forEach((p) => { imgMap[p.id] = p.image_url; });
    }
    const itemsWithImages = items.map((it) => ({ ...it, image_url: imgMap[it.product_id] || null }));

    await sendOrderConfirmation({ order, items: itemsWithImages, dispensary });

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
