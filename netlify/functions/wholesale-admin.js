const { createClient } = require("@supabase/supabase-js");
const { sendAccountCreated, sendAccountApproved, sendAccountRejected, sendOrderStatusUpdate, sendOrderConfirmation, sendOrderUpdated } = require("./email-helper");

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
             dispensaries(name, address, phone, email, omma_license),
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

      // Commission payments list
      if (action === "commission-payments") {
        const { data, error: e } = await supabaseAdmin
          .from("wholesale_commission_payments")
          .select("*")
          .order("paid_at", { ascending: false });
        if (e) throw e;
        return ok(data || []);
      }

      return err("Unknown action");
    }

    // ── POST requests
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { action } = body;

      // Approve or reject a dispensary account
      if (action === "approve" || action === "reject") {
        const { data: disp, error: fe } = await supabaseAdmin
          .from("dispensaries")
          .select("name, contact_name, email")
          .eq("id", body.id)
          .single();
        const { error: e } = await supabaseAdmin
          .from("dispensaries")
          .update({ approved: action === "approve" })
          .eq("id", body.id);
        if (e) throw e;
        if (disp) {
          const notifyFn = action === "approve" ? sendAccountApproved : sendAccountRejected;
          await notifyFn(disp).catch(console.error);
        }
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
        const { data: orderData } = await supabaseAdmin
          .from("wholesale_orders")
          .select("dispensary_id, total, dispensaries(name, contact_name, email)")
          .eq("id", body.orderId)
          .single();
        if (orderData?.dispensaries) {
          await sendOrderStatusUpdate({ dispensary: orderData.dispensaries, status: body.status, orderId: body.orderId, total: orderData.total }).catch(console.error);
        }
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
            image_url: body.image_url || null,
            batch_number: body.batch_number || null,
            metrc_id: body.metrc_id || null,
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
        if (body.image_url !== undefined) update.image_url = body.image_url || null;
        if (body.batch_number !== undefined) update.batch_number = body.batch_number || null;
        if (body.metrc_id !== undefined) update.metrc_id = body.metrc_id || null;
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

      // Update a dispensary account
      if (action === "update-account") {
        const update = {};
        if (body.name !== undefined) update.name = body.name;
        if (body.contact_name !== undefined) update.contact_name = body.contact_name;
        if (body.phone !== undefined) update.phone = body.phone;
        if (body.address !== undefined) update.address = body.address;
        if (body.omma_license !== undefined) update.omma_license = body.omma_license || null;
        if (body.obndd_license !== undefined) update.obndd_license = body.obndd_license || null;
        const { error: e } = await supabaseAdmin
          .from("dispensaries")
          .update(update)
          .eq("id", body.id);
        if (e) throw e;
        return ok({ ok: true });
      }

      // Delete a dispensary account (profile only — auth user remains)
      if (action === "delete-account") {
        const { error: e } = await supabaseAdmin
          .from("dispensaries")
          .delete()
          .eq("id", body.id);
        if (e) throw e;
        return ok({ ok: true });
      }

      // Edit an existing order's items, notes, and total — then resend invoice
      if (action === "update-order") {
        const { orderId, items, notes } = body;
        if (!orderId || !items || !items.length) return err("orderId and items are required.");
        const total = Math.round(items.reduce((sum, it) => sum + Number(it.subtotal), 0) * 100) / 100;

        // Replace all order items
        const { error: delErr } = await supabaseAdmin
          .from("wholesale_order_items")
          .delete()
          .eq("order_id", orderId);
        if (delErr) throw delErr;

        const { error: insertErr } = await supabaseAdmin
          .from("wholesale_order_items")
          .insert(items.map((it) => ({
            order_id: orderId,
            product_id: it.product_id || null,
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            subtotal: it.subtotal,
          })));
        if (insertErr) throw insertErr;

        // Update order total and notes
        const { error: updateErr } = await supabaseAdmin
          .from("wholesale_orders")
          .update({ total, notes: notes || null, updated_at: new Date().toISOString() })
          .eq("id", orderId);
        if (updateErr) throw updateErr;

        // Fetch updated order + dispensary for email
        const { data: orderData } = await supabaseAdmin
          .from("wholesale_orders")
          .select("*, dispensaries(*)")
          .eq("id", orderId)
          .single();

        if (orderData?.dispensaries) {
          const productIds = items.map((it) => it.product_id).filter(Boolean);
          let prodMap = {};
          if (productIds.length) {
            const { data: prods } = await supabaseAdmin.from("wholesale_products").select("id, image_url, batch_number, metrc_id").in("id", productIds);
            if (prods) prods.forEach((p) => { prodMap[p.id] = p; });
          }
          const itemsWithImages = items.map((it) => ({
            ...it,
            image_url:    prodMap[it.product_id]?.image_url    || null,
            batch_number: prodMap[it.product_id]?.batch_number || null,
            metrc_id:     prodMap[it.product_id]?.metrc_id     || null,
          }));
          await sendOrderUpdated({ order: orderData, items: itemsWithImages, dispensary: orderData.dispensaries }).catch(console.error);
        }
        return ok({ ok: true });
      }

      // Delete an order and its items
      if (action === "delete-order") {
        const { error: ie } = await supabaseAdmin
          .from("wholesale_order_items")
          .delete()
          .eq("order_id", body.id);
        if (ie) throw ie;
        const { error: oe } = await supabaseAdmin
          .from("wholesale_orders")
          .delete()
          .eq("id", body.id);
        if (oe) throw oe;
        return ok({ ok: true });
      }

      // Manually create a new dispensary account (admin-initiated, auto-approved)
      if (action === "create-account") {
        const { email, password, name, contact_name, phone, address, omma_license, obndd_license } = body;
        if (!email || !password || !name) return err("Email, password, and name are required.");
        const { data: { user }, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (authErr) return err(authErr.message);
        const { error: dbErr } = await supabaseAdmin.from("dispensaries").insert({
          id: user.id,
          email,
          name,
          contact_name: contact_name || null,
          phone: phone || null,
          address: address || null,
          omma_license: omma_license || null,
          obndd_license: obndd_license || null,
          approved: true,
        });
        if (dbErr) {
          await supabaseAdmin.auth.admin.deleteUser(user.id);
          throw dbErr;
        }
        // Generate a password-reset link and email it to the new dispensary
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: "https://kongconcentrates.com/wholesale/" },
        });
        const resetLink = linkData?.properties?.action_link;
        if (resetLink) {
          await sendAccountCreated({ name, contact_name, email, resetLink }).catch(console.error);
        }
        return ok({ ok: true });
      }

      // Send a password-reset link to an existing dispensary account
      if (action === "send-password-reset") {
        const { id } = body;
        if (!id) return err("Missing account id.");
        const { data: disp } = await supabaseAdmin.from("dispensaries").select("email,name,contact_name").eq("id", id).single();
        if (!disp) return err("Account not found.");
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: disp.email,
          options: { redirectTo: "https://kongconcentrates.com/wholesale/" },
        });
        const resetLink = linkData?.properties?.action_link;
        if (!resetLink) return err("Failed to generate reset link.");
        await sendAccountCreated({ name: disp.name, contact_name: disp.contact_name, email: disp.email, resetLink });
        return ok({ ok: true });
      }

      // Manually create an order for a dispensary
      if (action === "create-order") {
        const { dispensary_id, items, notes } = body;
        if (!dispensary_id || !items || !items.length) return err("dispensary_id and items are required.");
        const subtotal = Math.round(items.reduce((sum, it) => sum + Number(it.subtotal), 0) * 100) / 100;
        const deliveryFee = subtotal < 900 ? 50 : 0;
        const total = Math.round((subtotal + deliveryFee) * 100) / 100;
        const pointsToEarn = Math.floor(total);
        const { data: order, error: orderErr } = await supabaseAdmin
          .from("wholesale_orders")
          .insert({ dispensary_id, status: "received", total, notes: notes || null })
          .select()
          .single();
        if (orderErr) throw orderErr;
        const lineItems = items.map((it) => ({
          order_id: order.id,
          product_id: it.product_id || null,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          subtotal: it.subtotal,
        }));
        if (deliveryFee > 0) {
          lineItems.push({ order_id: order.id, product_id: null, product_name: "Delivery Fee", quantity: 1, unit_price: 50, subtotal: 50 });
        }
        const { error: itemsErr } = await supabaseAdmin
          .from("wholesale_order_items")
          .insert(lineItems);
        if (itemsErr) throw itemsErr;
        const { data: dispensary } = await supabaseAdmin
          .from("dispensaries")
          .select("*")
          .eq("id", dispensary_id)
          .single();
        // Award points (requires migration; fails silently if columns not yet added)
        await supabaseAdmin
          .from("wholesale_orders")
          .update({ points_earned: pointsToEarn, credit_applied: 0 })
          .eq("id", order.id)
          .then(({ error }) => { if (error) console.warn("rewards columns not yet migrated:", error.message); });
        await supabaseAdmin
          .from("dispensaries")
          .update({ reward_points: Math.max(0, (dispensary?.reward_points || 0) + pointsToEarn) })
          .eq("id", dispensary_id)
          .then(({ error }) => { if (error) console.warn("reward_points column not yet migrated:", error.message); });
        if (dispensary) {
          const productIds = items.map((it) => it.product_id).filter(Boolean);
          let prodMap = {};
          if (productIds.length) {
            const { data: prods } = await supabaseAdmin.from("wholesale_products").select("id, image_url, batch_number, metrc_id").in("id", productIds);
            if (prods) prods.forEach((p) => { prodMap[p.id] = p; });
          }
          const itemsWithImages = items.map((it) => ({
            ...it,
            image_url:    prodMap[it.product_id]?.image_url    || null,
            batch_number: prodMap[it.product_id]?.batch_number || null,
            metrc_id:     prodMap[it.product_id]?.metrc_id     || null,
          }));
          await sendOrderConfirmation({ order, items: itemsWithImages, dispensary }).catch(console.error);
        }
        return ok({ ok: true, orderId: order.id });
      }

      // Manually adjust reward points for a dispensary
      if (action === "adjust-points") {
        const { id, delta } = body;
        if (!id) return err("id is required.");
        const { data: d } = await supabaseAdmin.from("dispensaries").select("reward_points").eq("id", id).single();
        const newPts = Math.max(0, (d?.reward_points || 0) + Number(delta));
        const { error: e } = await supabaseAdmin.from("dispensaries").update({ reward_points: newPts }).eq("id", id);
        if (e) throw e;
        return ok({ ok: true, reward_points: newPts });
      }

      // Add a commission payment record
      if (action === "add-commission-payment") {
        const { amount, note, paid_at } = body;
        if (!amount || Number(amount) <= 0) return err("Amount must be positive.");
        const { error: e } = await supabaseAdmin
          .from("wholesale_commission_payments")
          .insert({ amount: Number(amount), note: note || null, paid_at: paid_at || new Date().toISOString() });
        if (e) throw e;
        return ok({ ok: true });
      }

      // Delete a commission payment record
      if (action === "delete-commission-payment") {
        const { id } = body;
        if (!id) return err("id is required.");
        const { error: e } = await supabaseAdmin
          .from("wholesale_commission_payments")
          .delete()
          .eq("id", id);
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
