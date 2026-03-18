const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

const ADMIN_EMAIL = "process@kongconcentrates.com";
const FROM = "Kong Concentrates <process@kongconcentrates.com>";

// Single pooled transport — reuses the SMTP connection across calls
const transport = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  pool: true,
  maxConnections: 3,
  auth: {
    user: "a53daf001@smtp-brevo.com",
    pass: process.env.BREVO_SMTP_KEY,
  },
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 15000,
});

async function sendEmail({ to, subject, html, text, attachments }) {
  if (!process.env.BREVO_SMTP_KEY) {
    throw new Error("BREVO_SMTP_KEY environment variable is not set");
  }
  await transport.sendMail({ from: FROM, to, subject, html, text, attachments });
}

// ── PDF Invoice generation ────────────────────────────────────────
function generateInvoicePDF({ order, items, dispensary }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const shortId = order.id.slice(-8).toUpperCase();
    const date = new Date(order.created_at).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    // ── Header (left: branding, right: invoice label)
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#111")
      .text("KONG CONCENTRATES LLC", 50, 50);
    doc.fontSize(9).font("Helvetica").fillColor("#888")
      .text("29141 S 647 Pl · Grove, OK 74344", 50, 78)
      .text("process@kongconcentrates.com · PAAA-NYSE-PYO4", 50, 90);

    doc.fontSize(14).font("Helvetica-Bold").fillColor("#555")
      .text("WHOLESALE INVOICE", 0, 52, { align: "right", width: 545 });
    doc.fontSize(9).font("Helvetica").fillColor("#666")
      .text(`Invoice #${shortId}`, 0, 72, { align: "right", width: 545 })
      .text(`Date: ${date}`, 0, 84, { align: "right", width: 545 });

    // ── Divider
    doc.moveTo(50, 110).lineTo(562, 110).lineWidth(1.5).strokeColor("#222").stroke();

    // ── Bill To
    doc.fontSize(8).font("Helvetica").fillColor("#aaa").text("BILL TO", 50, 126);
    doc.fontSize(15).font("Helvetica-Bold").fillColor("#111").text(dispensary.name, 50, 140);
    doc.fontSize(10).font("Helvetica").fillColor("#555");
    let billY = 160;
    if (dispensary.address) { doc.text(dispensary.address, 50, billY); billY += 14; }
    if (dispensary.phone)   { doc.text(dispensary.phone,   50, billY); billY += 14; }
    if (dispensary.email)   { doc.text(dispensary.email,   50, billY); }

    // ── Items table header
    const tTop = 230;
    doc.fontSize(8).font("Helvetica").fillColor("#999")
      .text("PRODUCT",    50,  tTop)
      .text("QTY",       370,  tTop, { width: 50, align: "right" })
      .text("UNIT PRICE", 430, tTop, { width: 65, align: "right" })
      .text("SUBTOTAL",   500, tTop, { width: 62, align: "right" });
    doc.moveTo(50, tTop + 13).lineTo(562, tTop + 13).lineWidth(0.5).strokeColor("#ccc").stroke();

    // ── Item rows
    let y = tTop + 22;
    items.forEach((it) => {
      const info = getProductInfo(it.product_name);
      doc.fontSize(11).font("Helvetica").fillColor("#222")
        .text(it.product_name, 50, y, { width: 300 });
      doc.text(String(it.quantity),                    370, y, { width: 50,  align: "right" });
      doc.text("$" + Number(it.unit_price).toFixed(2), 430, y, { width: 65,  align: "right" });
      doc.text("$" + Number(it.subtotal).toFixed(2),   500, y, { width: 62,  align: "right" });
      if (info) {
        doc.fontSize(8).font("Helvetica").fillColor("#999")
          .text(`Batch: ${info.batch}  ·  Metrc: ${info.metrc}`, 50, y + 14, { width: 400 });
      }
      const rowH = info ? 38 : 26;
      doc.moveTo(50, y + rowH - 3).lineTo(562, y + rowH - 3).lineWidth(0.3).strokeColor("#eee").stroke();
      y += rowH;
    });

    // ── Total
    y += 8;
    doc.moveTo(380, y).lineTo(562, y).lineWidth(1).strokeColor("#222").stroke();
    y += 10;
    doc.fontSize(9).font("Helvetica").fillColor("#777").text("TOTAL", 380, y, { width: 110 });
    doc.fontSize(20).font("Helvetica-Bold").fillColor("#111")
      .text("$" + Number(order.total).toFixed(2), 430, y - 4, { width: 132, align: "right" });

    // ── Notes
    if (order.notes) {
      y += 46;
      doc.fontSize(9).font("Helvetica").fillColor("#888")
        .text("Notes: " + order.notes, 50, y, { width: 460 });
    }

    // ── Footer
    doc.fontSize(8).font("Helvetica").fillColor("#bbb")
      .text("Thank you for your partnership · Kong Concentrates LLC", 50, 720, {
        align: "center", width: 512,
      });

    doc.end();
  });
}

// ── Product batch / Metrc info ────────────────────────────────────
function getProductInfo(productName) {
  const map = {
    "bacio mints":             { batch: "KC-26-KC-01",  metrc: "1A40E0100002F6A000000___" },
    "pink runtz":              { batch: "KC-26-ECE-01", metrc: "1A40E0100002F6A000000___" },
    "sticky buns":             { batch: "KC-26-ECE-02", metrc: "1A40E0100002F6A000000___" },
    "hooch x white rainbow":   { batch: "KC-26-ECE-03", metrc: "1A40E0100002F6A000000___" },
    "grape pie":               { batch: "KC-26-ECE-04", metrc: "1A40E0100002F6A000000___" },
    "devil driver":            { batch: "KC-26-ECE-05", metrc: "1A40E0100002F6A000000___" },
    "bacio mints vape":                  { batch: "KC-26-KC-02",  metrc: "1A40E0100002F6A000000___" },
    "creme soda x pink runtz hash hole": { batch: "KC-26-KC-03",  metrc: "1A40E0100002F6A000000___" },
  };
  return map[(productName || "").toLowerCase()] || null;
}

// ── Product image URL lookup ───────────────────────────────────────
function getProductImageUrl(productName) {
  const map = {
    "pink runtz":                        "https://kongconcentrates.com/images/pink%20runtz.PNG",
    "bacio mints":                       "https://kongconcentrates.com/images/bacio%20mints.PNG",
    "hooch x white rainbow":             "https://kongconcentrates.com/images/hooch%20x%20white%20rainbow.PNG",
    "sticky buns":                       "https://kongconcentrates.com/images/sticky%20buns.PNG",
    "devil driver":                      "https://kongconcentrates.com/images/devil%20driver.PNG",
    "grape pie":                         "https://kongconcentrates.com/images/grape%20pie.PNG",
    "bacio mints vape":                  "https://kongconcentrates.com/images/bacio%20mints%20vape.png",
    "creme soda x pink runtz hash hole": "https://kongconcentrates.com/images/creme%20soda%20hash%20hole.jpg",
  };
  return map[(productName || "").toLowerCase()] || null;
}

// ── Order placed confirmation (to dispensary + admin) ─────────────
async function sendOrderConfirmation({ order, items, dispensary }) {
  const shortId = order.id.slice(-8).toUpperCase();
  const date = new Date(order.created_at).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const pdfBuffer = await generateInvoicePDF({ order, items, dispensary });
  const attachment = {
    filename: `Kong-Invoice-${shortId}.pdf`,
    content: pdfBuffer,
    contentType: "application/pdf",
  };

  const itemsTableRows = items.map((it) => {
    const imgUrl = getProductImageUrl(it.product_name);
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
  }).join("");

  const itemsText = items.map((it) =>
    `  ${it.product_name} × ${it.quantity}  —  $${Number(it.subtotal).toFixed(2)}`
  ).join("\n");

  // Send to dispensary and admin in parallel
  await Promise.all([
    sendEmail({
      to: dispensary.email,
      subject: `Order Received #${shortId} — Kong Concentrates`,
      attachments: [attachment],
      html: `
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
        </div>`,
      text: `Thank you for your order, ${dispensary.contact_name || dispensary.name}!\n\nOrder #${shortId} — ${date}\n\n${itemsText}\n\nTotal: $${Number(order.total).toFixed(2)}${order.notes ? "\nNotes: " + order.notes : ""}\n\nYour invoice is attached.\n\nView COAs: https://kongconcentrates.com/coa/\n\nQuestions? Contact us at process@kongconcentrates.com\n— Kong Concentrates LLC · 29141 S 647 Pl, Grove, OK 74344`,
    }),
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `New Order #${shortId} — ${dispensary.name}`,
      attachments: [attachment],
      html: `
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
          <tbody>${items.map((it) => `
            <tr>
              <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;">${it.product_name}</td>
              <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:center;">${it.quantity}</td>
              <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:right;">$${Number(it.subtotal).toFixed(2)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        ${order.notes ? `<p style="font-family:sans-serif;font-size:13px;color:#666;margin-top:12px;">Notes: ${order.notes}</p>` : ""}
        <p style="font-family:sans-serif;margin-top:20px;">
          <a href="https://kongconcentrates.com/wholesale/admin/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">View in Admin Dashboard</a>
        </p>`,
      text: `New Order #${shortId}\n\nDispensary: ${dispensary.name}\nPhone: ${dispensary.phone || "—"}\nTotal: $${Number(order.total).toFixed(2)}\n\n${itemsText}${order.notes ? "\nNotes: " + order.notes : ""}\n\nhttps://kongconcentrates.com/wholesale/admin/`,
    }),
  ]);
}

// ── New application received ──────────────────────────────────────
async function sendApplicationReceived({ name, contact_name, email, phone, address, omma_license, obndd_license }) {
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New Wholesale Application — ${name}`,
    html: `
      <h2 style="font-family:sans-serif;">New Wholesale Application</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Dispensary</td><td><strong>${name}</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Contact</td><td>${contact_name}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Email</td><td>${email}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Phone</td><td>${phone}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Address</td><td>${address}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">OMMA</td><td>${omma_license || "—"}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">OBNDD</td><td>${obndd_license || "—"}</td></tr>
      </table>
      <p style="font-family:sans-serif;margin-top:20px;">
        <a href="https://kongconcentrates.com/wholesale/admin/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">Review in Admin Dashboard</a>
      </p>`,
    text: `New Wholesale Application\n\nDispensary: ${name}\nContact: ${contact_name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nOMMA: ${omma_license || "—"}\nOBNDD: ${obndd_license || "—"}\n\nReview at https://kongconcentrates.com/wholesale/admin/`,
  });

  await sendEmail({
    to: email,
    subject: "Application Received — Kong Concentrates Wholesale",
    html: `
      <h2 style="font-family:sans-serif;">Application Received</h2>
      <p style="font-family:sans-serif;">Hi ${contact_name},</p>
      <p style="font-family:sans-serif;">We've received your wholesale application for <strong>${name}</strong>. Our team will review it and get back to you within 1–2 business days.</p>
      <p style="font-family:sans-serif;">Questions? Reply to this email or contact us at <a href="mailto:process@kongconcentrates.com">process@kongconcentrates.com</a>.</p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344</p>`,
    text: `Hi ${contact_name},\n\nWe've received your wholesale application for ${name}. Our team will review it within 1–2 business days.\n\nQuestions? Email process@kongconcentrates.com\n\n— Kong Concentrates LLC`,
  });
}

// ── Account approved / rejected ───────────────────────────────────
async function sendAccountApproved({ name, contact_name, email }) {
  await sendEmail({
    to: email,
    subject: "Wholesale Account Approved — Kong Concentrates",
    html: `
      <h2 style="font-family:sans-serif;">You're Approved!</h2>
      <p style="font-family:sans-serif;">Hi ${contact_name},</p>
      <p style="font-family:sans-serif;">Great news — your wholesale account for <strong>${name}</strong> has been approved. You can now sign in to place orders.</p>
      <p style="font-family:sans-serif;">
        <a href="https://kongconcentrates.com/wholesale/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">Sign In to Wholesale Portal</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344</p>`,
    text: `Hi ${contact_name},\n\nYour wholesale account for ${name} has been approved! Sign in at https://kongconcentrates.com/wholesale/\n\n— Kong Concentrates LLC`,
  });
}

async function sendAccountRejected({ name, contact_name, email }) {
  await sendEmail({
    to: email,
    subject: "Wholesale Application Update — Kong Concentrates",
    html: `
      <h2 style="font-family:sans-serif;">Application Update</h2>
      <p style="font-family:sans-serif;">Hi ${contact_name},</p>
      <p style="font-family:sans-serif;">Thank you for applying for a wholesale account. After review, we're unable to approve the application for <strong>${name}</strong> at this time.</p>
      <p style="font-family:sans-serif;">If you have questions, please contact us at <a href="mailto:process@kongconcentrates.com">process@kongconcentrates.com</a>.</p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344</p>`,
    text: `Hi ${contact_name},\n\nWe're unable to approve the wholesale application for ${name} at this time. Questions? Email process@kongconcentrates.com\n\n— Kong Concentrates LLC`,
  });
}

// ── Order status change ───────────────────────────────────────────
const STATUS_LABELS = {
  received: "Received",
  processing: "Processing",
  out_for_delivery: "Out for Delivery",
  complete: "Complete",
};

async function sendOrderStatusUpdate({ dispensary, status, orderId, total }) {
  const label = STATUS_LABELS[status] || status;
  const shortId = orderId.slice(-8).toUpperCase();
  const name = dispensary.contact_name || dispensary.name;
  const totalStr = total ? `$${Number(total).toFixed(2)}` : null;

  const statusMessages = {
    processing: {
      html: `<p style="font-family:sans-serif;">We are currently arranging delivery of your order. Delivery runs <strong>Monday–Friday</strong> and is subject to transporter availability.</p>
      <p style="font-family:sans-serif;">If you have any specific days or times you prefer for delivery, please let us know by replying to this email or reaching out at <a href="mailto:process@kongconcentrates.com">process@kongconcentrates.com</a>.</p>`,
      text: `We are currently arranging delivery of your order. Delivery runs Monday–Friday and is subject to transporter availability.\n\nIf you have any specific days or times you prefer for delivery, please let us know by replying to this email or reaching out at process@kongconcentrates.com.`,
    },
    out_for_delivery: {
      html: `<p style="font-family:sans-serif;">A transporter is on the way to you with your order right now.</p>
      ${totalStr ? `<p style="font-family:sans-serif;">Your order total is <strong>${totalStr}</strong>. Please have <strong>cash payment ready upon delivery</strong>.</p>` : ''}`,
      text: `A transporter is on the way to you with your order right now.${totalStr ? `\n\nYour order total is ${totalStr}. Please have cash payment ready upon delivery.` : ''}`,
    },
    complete: {
      html: `<p style="font-family:sans-serif;">Thank you for your business — we truly appreciate your partnership!</p>
      <p style="font-family:sans-serif;">If you have any questions or concerns about your order, please don't hesitate to contact us at <a href="mailto:process@kongconcentrates.com">process@kongconcentrates.com</a> and we will be glad to help.</p>`,
      text: `Thank you for your business — we truly appreciate your partnership!\n\nIf you have any questions or concerns about your order, please don't hesitate to contact us at process@kongconcentrates.com and we will be glad to help.`,
    },
  };

  const msg = statusMessages[status] || { html: '', text: '' };

  await sendEmail({
    to: dispensary.email,
    subject: `Order #${shortId} — ${label} · Kong Concentrates`,
    html: `
      <h2 style="font-family:sans-serif;">Order Update</h2>
      <p style="font-family:sans-serif;">Hi ${name},</p>
      <p style="font-family:sans-serif;">Your order <strong>#${shortId}</strong> status has been updated to <strong>${label}</strong>.</p>
      ${msg.html}
      <p style="font-family:sans-serif;text-align:center;">
        <a href="https://kongconcentrates.com/wholesale/portal/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">View Order Details</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344 · process@kongconcentrates.com</p>`,
    text: `Hi ${name},\n\nYour order #${shortId} status has been updated to: ${label}\n\n${msg.text}\n\nView at https://kongconcentrates.com/wholesale/portal/\n\n— Kong Concentrates LLC`,
  });
}

module.exports = {
  sendApplicationReceived,
  sendAccountApproved,
  sendAccountRejected,
  sendOrderStatusUpdate,
  sendOrderConfirmation,
};
