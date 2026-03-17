import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "process@kongconcentrates.com";
const FROM_NAME = "Kong Concentrates";
const FROM_EMAIL = "process@kongconcentrates.com";

function getProductImageUrl(productName: string): string | null {
  const map: Record<string, string> = {
    "pink runtz":                        "https://kongconcentrates.com/images/pink%20runtz.PNG",
    "bacio mints":                       "https://kongconcentrates.com/images/bacio%20mints.PNG",
    "hooch x white rainbow":             "https://kongconcentrates.com/images/hooch%20x%20white%20rainbow.PNG",
    "sticky buns":                       "https://kongconcentrates.com/images/sticky%20buns.PNG",
    "devil driver":                      "https://kongconcentrates.com/images/devil%20driver.PNG",
    "grape pie":                         "https://kongconcentrates.com/images/grape%20pie.PNG",
    "bacio mints vape":                  "https://kongconcentrates.com/images/bacio%20mints%20vape.png",
    "creme soda x pink runtz hash hole": "https://kongconcentrates.com/images/creme%20soda%20hash%20hole.jpg",
  };
  return map[(productName || "").toLowerCase()] ?? null;
}

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
        .from("dispensaries")
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
      .map((it: Record<string, unknown>) => {
        const imgUrl = getProductImageUrl(String(it.product_name ?? ""));
        return `
      <tr>
        <td style="padding:12px 12px 12px 0;border-bottom:1px solid #eee;vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            ${imgUrl ? `<td style="vertical-align:middle;padding-right:12px;"><img src="${imgUrl}" alt="${it.product_name}" width="72" height="72" style="width:72px;height:72px;object-fit:cover;border-radius:6px;display:block;"></td>` : ""}
            <td style="vertical-align:middle;">
              <div style="font-family:sans-serif;font-size:14px;font-weight:bold;color:#111;">${it.product_name}</div>
              <div style="font-family:sans-serif;font-size:12px;color:#888;margin-top:3px;">Qty: ${it.quantity} &nbsp;·&nbsp; $${Number(it.unit_price).toFixed(2)}/unit</div>
            </td>
          </tr></table>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:15px;font-weight:bold;text-align:right;vertical-align:middle;">$${Number(it.subtotal).toFixed(2)}</td>
      </tr>`;
      })
      .join("");

    const itemsText = items
      .map(
        (it: Record<string, unknown>) =>
          `  ${it.product_name} × ${it.quantity}  —  $${Number(it.subtotal).toFixed(2)}`
      )
      .join("\n");

    const dispensaryHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#111;padding:24px;text-align:center;">
          <img src="https://kongconcentrates.com/images/MAIN-ROUND-1.png" alt="Kong Concentrates" height="80" style="height:80px;">
        </div>
        <div style="background:#c9a84c;padding:18px;text-align:center;">
          <h1 style="margin:0;color:#111;font-size:22px;font-weight:bold;font-family:sans-serif;">Thank You for Your Order!</h1>
        </div>
        <div style="padding:32px 24px;">
          <p style="font-family:sans-serif;font-size:15px;">Hi ${dispensary.contact_name || dispensary.name},</p>
          <p style="font-family:sans-serif;">We truly appreciate your business! Your order has been received and we're on it. Your invoice is attached to this email.</p>
          <p style="font-family:sans-serif;font-size:13px;color:#888;margin-bottom:20px;">Order <strong style="color:#222;">#${shortId}</strong> &nbsp;·&nbsp; ${date}</p>
          <table style="border-collapse:collapse;width:100%;max-width:560px;">
            <thead>
              <tr>
                <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:left;padding:0 0 10px;border-bottom:2px solid #222;">Product</th>
                <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:right;padding:0 0 10px;border-bottom:2px solid #222;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsTableRows}</tbody>
          </table>
          <p style="font-family:sans-serif;font-size:20px;font-weight:bold;text-align:right;border-top:2px solid #222;padding-top:12px;margin-top:4px;">Total: $${Number(order.total).toFixed(2)}</p>
          ${order.notes ? `<p style="font-family:sans-serif;font-size:13px;color:#666;background:#f5f5f5;padding:12px;border-radius:4px;">Notes: ${order.notes}</p>` : ""}
          <p style="font-family:sans-serif;">We'll keep you updated every step of the way as your order is processed and shipped.</p>
          <div style="background:#f9f6ee;border-left:4px solid #c9a84c;padding:16px 20px;margin:24px 0;border-radius:0 6px 6px 0;">
            <p style="font-family:sans-serif;margin:0 0 6px;font-weight:bold;color:#111;">Certificate of Analysis (COA)</p>
            <p style="font-family:sans-serif;margin:0;color:#555;font-size:13px;">All Kong Concentrates products are third-party lab tested for quality and safety.</p>
            <a href="https://kongconcentrates.com/coa/" style="display:inline-block;margin-top:10px;color:#c9a84c;font-weight:bold;text-decoration:none;font-family:sans-serif;">View Lab Results &rarr;</a>
          </div>
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#111;border-radius:6px;margin-top:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="font-family:sans-serif;margin:0 0 6px;font-weight:bold;font-size:15px;color:#fff;">Questions or Problems?</p>
              <p style="font-family:sans-serif;margin:0 0 10px;color:#aaa;font-size:13px;">We're here to help — reach out anytime and we'll get back to you right away.</p>
              <a href="mailto:process@kongconcentrates.com" style="font-family:sans-serif;color:#c9a84c;text-decoration:none;font-weight:bold;">process@kongconcentrates.com</a>
              <p style="font-family:sans-serif;margin:6px 0 0;color:#666;font-size:12px;">Kong Concentrates LLC &nbsp;·&nbsp; 29141 S 647 Pl, Grove, OK 74344</p>
            </td></tr>
          </table>
        </div>
      </div>`;

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
          textContent: `Thank you for your order, ${dispensary.contact_name || dispensary.name}!\n\nOrder #${shortId} — ${date}\n\n${itemsText}\n\nTotal: $${Number(order.total).toFixed(2)}${order.notes ? "\nNotes: " + order.notes : ""}\n\nView COAs: https://kongconcentrates.com/coa/\n\nQuestions? Contact us at process@kongconcentrates.com\n— Kong Concentrates LLC · 29141 S 647 Pl, Grove, OK 74344`,
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
