import { NextResponse } from "next/server";
import Stripe from "stripe";

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set (see .env.example)");
  return new Stripe(key);
}

// POST /api/checkout — creates a one-off Checkout Session and redirects to it.
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Demo item" },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
    if (!session.url) return NextResponse.json({ error: "Stripe returned no URL" }, { status: 502 });
    return NextResponse.redirect(session.url, 303);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "checkout failed" }, { status: 500 });
  }
}
