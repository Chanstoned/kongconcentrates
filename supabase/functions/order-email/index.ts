import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "process@kongconcentrates.com";
const FROM_NAME = "Kong Concentrates";
const FROM_EMAIL = "process@kongconcentrates.com";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // Only handle INSERT events on wholesale_orders
    if (payload.type !== "INSERT" || payload.table !== "wholesale_orders") {
      return new Response("ignored", { status: 200 });
    }

    const order = payload.record;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch items and dispensary in parallel
    const [{ data: items }, { data: dispensary }] = await Promise.all([
      supabase
        .from("wholesale_order_items")
        .select("*")
        .eq("order_id", order.id),
      supabase
        .from("wholesale_dispensaries")
        .select("*")
        .eq("id", order.dispensary_id)
        .single(),
    ]);

    if (!items || !dispensary) {
      console.error("Missing items or dispensary for order", order.id);
      return new Response("missing data", { status: 500 });
    }

    const shortId = order.id.slice(-8).toUpperCase();
    const date = new Date(order.created_at).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const itemsTableRows = items
      .map(
        (it: Record<string, unknown>) => `
      <tr>
        <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;">${it.product_name}</td>
        <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:center;">${it.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:right;">$${Number(it.unit_price).toFixed(2)}</td>
        <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:right;">$${Number(it.subtotal).toFixed(2)}</td>
      </tr>`
      )
      .join("");

    const itemsText = items
      .map(
        (it: Record<string, unknown>) =>
          `  ${it.product_name} × ${it.quantity}  —  $${Number(it.subtotal).toFixed(2)}`
      )
      .join("\n");

    const dispensaryHtml = `
      <h2 style="font-family:sans-serif;">Order Received</h2>
      <p style="font-family:sans-serif;">Hi ${dispensary.contact_name || dispensary.name},</p>
      <p style="font-family:sans-serif;">We've received your order <strong>#${shortId}</strong> on ${date}.</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px;">
        <thead>
          <tr>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:left;padding:0 12px 8px 0;border-bottom:2px solid #222;">Product</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:center;padding:0 12px 8px 0;border-bottom:2px solid #222;">Qty</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:right;padding:0 0 8px;border-bottom:2px solid #222;">Price</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:right;padding:0 0 8px 12px;border-bottom:2px solid #222;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsTableRows}</tbody>
      </table>
      <p style="font-family:sans-serif;font-size:18px;font-weight:bold;margin-top:16px;">Total: $${Number(order.total).toFixed(2)}</p>
      ${order.notes ? `<p style="font-family:sans-serif;font-size:13px;color:#666;">Notes: ${order.notes}</p>` : ""}
      <p style="font-family:sans-serif;">We'll be in touch once your order is being processed.</p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344 · process@kongconcentrates.com</p>`;

    const adminHtml = `
      <h2 style="font-family:sans-serif;">New Wholesale Order</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Order</td><td><strong>#${shortId}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Dispensary</td><td>${dispensary.name}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Contact</td><td>${dispensary.contact_name || "—"}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Phone</td><td>${dispensary.phone || "—"}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Total</td><td><strong>$${Number(order.total).toFixed(2)}</strong></td></tr>
      </table>
      <table style="border-collapse:collapse;width:100%;max-width:480px;">
        <thead>
          <tr>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:left;padding:0 12px 8px 0;border-bottom:2px solid #222;">Product</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:center;padding:0 12px 8px 0;border-bottom:2px solid #222;">Qty</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:right;padding:0 0 8px 12px;border-bottom:2px solid #222;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${items
          .map(
            (it: Record<string, unknown>) => `
          <tr>
            <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;">${it.product_name}</td>
            <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:center;">${it.quantity}</td>
            <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:right;">$${Number(it.subtotal).toFixed(2)}</td>
          </tr>`
          )
          .join("")}
        </tbody>
      </table>
      ${order.notes ? `<p style="font-family:sans-serif;font-size:13px;color:#666;margin-top:12px;">Notes: ${order.notes}</p>` : ""}
      <p style="font-family:sans-serif;margin-top:20px;">
        <a href="https://kongconcentrates.com/wholesale/admin/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">View in Admin Dashboard</a>
      </p>`;

    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY not set");

    await Promise.all([
      fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: dispensary.email }],
          subject: `Order Received #${shortId} — Kong Concentrates`,
          htmlContent: dispensaryHtml,
          textContent: `Hi ${dispensary.contact_name || dispensary.name},\n\nOrder #${shortId} received on ${date}.\n\n${itemsText}\n\nTotal: $${Number(order.total).toFixed(2)}${order.notes ? "\nNotes: " + order.notes : ""}\n\n— Kong Concentrates LLC`,
        }),
      }),
      fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: ADMIN_EMAIL }],
          subject: `New Order #${shortId} — ${dispensary.name}`,
          htmlContent: adminHtml,
          textContent: `New Order #${shortId}\n\nDispensary: ${dispensary.name}\nPhone: ${dispensary.phone || "—"}\nTotal: $${Number(order.total).toFixed(2)}\n\n${itemsText}${order.notes ? "\nNotes: " + order.notes : ""}\n\nhttps://kongconcentrates.com/wholesale/admin/`,
        }),
      }),
    ]);

    console.log(`Order email sent for #${shortId}`);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("order-email error:", err);
    return new Response("error", { status: 500 });
  }
});
