import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { AppError, isSafeId } from "./http";
import { getAdminServices } from "./firebaseAdmin";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new AppError(503, "STRIPE_NOT_CONFIGURED", "Billing is not configured.");
    stripeClient = new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 });
  }
  return stripeClient;
}

function appUrl(path: string): string {
  const base = process.env.APP_URL;
  if (!base) throw new AppError(503, "APP_URL_NOT_CONFIGURED", "The application URL is not configured.");
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function customerForUser(uid: string, email?: string): Promise<string> {
  const entitlementRef = getAdminServices().db.doc(`entitlements/${uid}`);
  const snapshot = await entitlementRef.get();
  const existing = snapshot.data()?.stripeCustomerId;
  if (typeof existing === "string" && existing) return existing;

  const customer = await getStripe().customers.create({
    email,
    metadata: { firebaseUid: uid },
  }, { idempotencyKey: `memeforge-customer-${uid}` });
  await entitlementRef.set({
    uid,
    stripeCustomerId: customer.id,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return customer.id;
}

export async function createCheckoutSession(
  uid: string,
  email: string | undefined,
  requestId: string,
): Promise<Stripe.Checkout.Session> {
  const price = process.env.STRIPE_PRO_PRICE_ID;
  if (!price) throw new AppError(503, "STRIPE_PRICE_NOT_CONFIGURED", "The Pro subscription price is not configured.");
  if (!isSafeId(requestId, 80)) throw new AppError(400, "INVALID_REQUEST_ID", "A valid X-Request-Id is required.");

  const customer = await customerForUser(uid, email);
  return getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: uid,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: appUrl("profile?checkout=success&session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: appUrl("profile?checkout=cancelled"),
    metadata: { firebaseUid: uid },
    subscription_data: { metadata: { firebaseUid: uid } },
  }, { idempotencyKey: `memeforge-checkout-${uid}-${requestId}` });
}

export async function createPortalSession(uid: string, email?: string): Promise<Stripe.BillingPortal.Session> {
  const customer = await customerForUser(uid, email);
  return getStripe().billingPortal.sessions.create({
    customer,
    return_url: appUrl("profile"),
  });
}

function periodEnd(subscription: Stripe.Subscription): string | null {
  const value = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const uid = subscription.metadata.firebaseUid;
  if (!uid) throw new AppError(400, "MISSING_SUBSCRIPTION_UID", "The subscription is missing its Firebase user reference.");
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  await getAdminServices().db.doc(`entitlements/${uid}`).set({
    uid,
    plan: "pro",
    status: subscription.status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd(subscription),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<string> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError(503, "STRIPE_WEBHOOK_NOT_CONFIGURED", "Stripe webhooks are not configured.");
  if (!signature) throw new AppError(400, "MISSING_STRIPE_SIGNATURE", "The Stripe signature is missing.");

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new AppError(400, "INVALID_STRIPE_SIGNATURE", "The Stripe webhook signature is invalid.");
  }

  const eventRef = getAdminServices().db.doc(`stripeEvents/${event.id}`);
  const claimToken = randomUUID();
  const now = Date.now();
  const shouldProcess = await getAdminServices().db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef);
    const existing = snapshot.data();
    if (existing?.status === "processed") return false;
    if (existing?.status === "processing" && typeof existing.leaseUntil === "string" && Date.parse(existing.leaseUntil) > now) {
      throw new AppError(409, "WEBHOOK_IN_PROGRESS", "This Stripe event is already being processed.", true);
    }
    transaction.set(eventRef, {
      type: event.type,
      status: "processing",
      claimToken,
      leaseUntil: new Date(now + 5 * 60_000).toISOString(),
      receivedAt: existing?.receivedAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!shouldProcess) return event.id;

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        await syncSubscription(await getStripe().subscriptions.retrieve(session.subscription));
      }
    } else if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
        parent?: { subscription_details?: { subscription?: string | Stripe.Subscription | null } } | null;
      };
      const subscription = invoice.parent?.subscription_details?.subscription || invoice.subscription;
      const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
      if (subscriptionId) await syncSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
    }

    await eventRef.set({
      status: "processed",
      processedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      leaseUntil: FieldValue.delete(),
    }, { merge: true });
    return event.id;
  } catch (error) {
    await eventRef.set({
      status: "failed",
      failedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      leaseUntil: FieldValue.delete(),
      errorCode: error instanceof AppError ? error.code : "PROCESSING_FAILED",
    }, { merge: true });
    throw error;
  }
}
