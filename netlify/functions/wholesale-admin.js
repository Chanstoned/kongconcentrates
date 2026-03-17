const { createClient } = require("@supabase/supabase-js");

// Supabase admin client — uses service role key to bypass RLS
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Admin emails — set WHOLESALE_ADMIN_EMAIL in Netlify environment variables
// Supports comma-separated list for multiple admins
const ADMIN_EMAILS = (process.env.WHOLESALE_ADMIN_EMAIL || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

async function verifyAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) return null;
  return user;
}

function ok(body) {
  return { statusCode: 200, headers, body: JSON.stringify(body) };
}
function err(msg, code = 400) {
  return { statusCode: code, headers, body: JSON.stringify({ error: msg }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const admin = await verifyAdmin(event.headers.authorization);
  if (!admin) return err("Unauthorized", 401);

  try {
    // ── GET requests
    if (event.httpMethod === "GET") {
      const action = (event.queryStringParameters || {}).action;

      // Ping — used by admin page to verify access on load
      if (action === "ping") {
        return ok({ ok: true });
      }

      // All orders with dispensary info and items
      if (action === "orders") {
        const { data, error: e } = await supabaseAdmin
          .from("wholesale_orders")
          .select(
            `*,
             dispensaries(name, address, phone, email),
             wholesale_order_items(*)`
          )
          .order("created_at", { ascending: false });
        if (e) throw e;
        return ok(data);
      }

      // All dispensary accounts
      if (action === "dispensaries") {
        const { data, error: e } = await supabaseAdmin
          .from("dispensaries")
          .select("*")
          .order("created_at", { ascending: false });
        if (e) throw e;
        return ok(data);
      }

      // All products
      if (action === "products") {
        const { data, error: e } = await supabaseAdmin
          .from("wholesale_products")
          .select("*")
          .order("category")
          .order("name");
        if (e) throw e;
        return ok(data);
      }

      return err("Unknown action");
    }

    // ── POST requests
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { action } = body;

      // Approve or reject a dispensary account
      if (action === "approve" || action === "reject") {
        const { error: e } = await supabaseAdmin
          .from("dispensaries")
          .update({ approved: action === "approve" })
          .eq("id", body.id);
        if (e) throw e;
        return ok({ ok: true });
      }

      // Update order status
      if (action === "update-status") {
        const allowed = ["received", "processing", "out_for_delivery", "complete"];
        if (!allowed.includes(body.status)) return err("Invalid status");
        const { error: e } = await supabaseAdmin
          .from("wholesale_orders")
          .update({ status: body.status, updated_at: new Date().toISOString() })
          .eq("id", body.orderId);
        if (e) throw e;
        return ok({ ok: true });
      }

      // Create a new product
      if (action === "create-product") {
        const { error: e } = await supabaseAdmin
          .from("wholesale_products")
          .insert({
            name: body.name,
            description: body.description || null,
            category: body.category || null,
            price_wholesale: body.price,
            unit_label: body.unit_label || "per unit",
            min_qty: body.min_qty || 1,
            available: true,
          });
        if (e) throw e;
        return ok({ ok: true });
      }

      // Update an existing product
      if (action === "update-product") {
        const update = {};
        if (body.name !== undefined) update.name = body.name;
        if (body.description !== undefined) update.description = body.description;
        if (body.category !== undefined) update.category = body.category;
        if (body.price !== undefined) update.price_wholesale = body.price;
        if (body.unit_label !== undefined) update.unit_label = body.unit_label;
        if (body.min_qty !== undefined) update.min_qty = body.min_qty;
        if (body.available !== undefined) update.available = body.available;
        const { error: e } = await supabaseAdmin
          .from("wholesale_products")
          .update(update)
          .eq("id", body.id);
        if (e) throw e;
        return ok({ ok: true });
      }

      // Delete a product
      if (action === "delete-product") {
        const { error: e } = await supabaseAdmin
          .from("wholesale_products")
          .delete()
          .eq("id", body.id);
        if (e) throw e;
        return ok({ ok: true });
      }

      return err("Unknown action");
    }

    return err("Method not allowed", 405);
  } catch (e) {
    console.error("wholesale-admin error:", e);
    return err(e.message || "Internal error", 500);
  }
};
