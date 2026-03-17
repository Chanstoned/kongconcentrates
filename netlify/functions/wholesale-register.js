const { createClient } = require("@supabase/supabase-js");
const { sendApplicationReceived } = require("./email-helper");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request" }) }; }

  const { email, password, name, contact_name, phone, address, omma_license, obndd_license } = body;

  if (!email || !password || !name || !contact_name || !phone || !address) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  // Create the auth user (auto-confirmed — admin approval is the real gate)
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: authErr.message }) };
  }

  // Insert dispensary profile using service role key (bypasses RLS)
  const { error: dbErr } = await supabaseAdmin.from("dispensaries").insert({
    id: user.id,
    email,
    name,
    contact_name,
    phone,
    address,
    omma_license: omma_license || null,
    obndd_license: obndd_license || null,
    approved: false,
  });

  if (dbErr) {
    // Clean up auth user so they can try again
    await supabaseAdmin.auth.admin.deleteUser(user.id);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Profile setup failed — please contact us." }) };
  }

  // Send notification emails (non-blocking)
  sendApplicationReceived({ name, contact_name, email, phone, address, omma_license, obndd_license }).catch(console.error);

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
