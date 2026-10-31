const { z } = require("zod");
const { VITALS, CONSENT_ACTIONS } = require("../Models/Analytics");

// Browser-made random ids (visitor, session, pageview).
const clientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid id");
// Pathname only: the query string and hash are dropped before storage (they can hold tokens or emails).
const path = z
  .string()
  .max(500)
  .transform((p) => p.split(/[?#]/)[0].slice(0, 200))
  .refine((p) => p.startsWith("/"), "Must be a path");
const short = (n) => z.string().trim().max(n * 2).transform((s) => s.slice(0, n));
const utmValue = short(100).transform((s) => s.toLowerCase());

const pageview = z
  .object({
    t: z.literal("pageview"),
    pv: clientId,
    path,
    title: short(150).optional(),
    referrer: z.string().max(1000).optional(),
    utm: z.object({ source: utmValue.optional(), medium: utmValue.optional(), campaign: utmValue.optional(), term: utmValue.optional(), content: utmValue.optional() }).strict().optional(),
  })
  .strict();

const leave = z.object({ t: z.literal("leave"), pv: clientId, durationMs: z.number().int().min(0).max(86400000) }).strict();

const propValue = z.union([short(100), z.number().finite(), z.boolean()]);
const event = z
  .object({
    t: z.literal("event"),
    name: z.string().regex(/^[a-z][a-z0-9_.:-]{0,49}$/, "Use a lowercase event name"),
    path: path.optional(),
    props: z
      .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/), propValue)
      .refine((p) => Object.keys(p).length <= 8, "At most 8 properties")
      .optional(),
  })
  .strict();

const vital = z
  .object({
    t: z.literal("vital"),
    name: z.enum(VITALS),
    // ms for timings; CLS is unitless. Anything beyond a minute is a measurement glitch.
    value: z.number().finite().min(0).max(60000),
    rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
    path: path.optional(),
  })
  .strict();

const ping = z.object({ t: z.literal("ping") }).strict();

const schemas = {
  collect: z
    .object({
      vid: clientId,
      sid: clientId,
      signedIn: z.boolean().optional(),
      events: z.array(z.discriminatedUnion("t", [pageview, leave, event, vital, ping])).min(1).max(30),
    })
    .strict(),
  consent: z
    .object({
      vid: clientId,
      action: z.enum(CONSENT_ACTIONS),
      analytics: z.boolean(),
      policyVersion: z.string().regex(/^[\w.-]{1,20}$/),
    })
    .strict(),
};

module.exports = { schemas };
