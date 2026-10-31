import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { buildApp, startDb, stopDb, clearDb, registerUser, bearer, refreshCookie } from "./helpers.mjs";

const app = buildApp();

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const home = {
  label: "Home",
  fullName: "Ananya Sharma",
  phone: "+91 98765 04210",
  line1: "42, 2nd Cross, HAL 2nd Stage",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560038",
};

describe("profile", () => {
  it("requires a signed-in user", async () => {
    expect((await request(app).get("/api/me")).status).toBe(401);
  });

  it("updates name and phone, normalising Indian numbers", async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app).patch("/api/me").set(bearer(accessToken)).send({ name: "Ananya S", phone: "+91 98765-04210" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: "Ananya S", phone: "9876504210" });
  });

  it("blocks mass assignment of protected fields", async () => {
    const { accessToken } = await registerUser(app);
    for (const body of [{ role: "admin" }, { email: "x@y.com" }, { isActive: false }, { tokenVersion: 9 }]) {
      const res = await request(app).patch("/api/me").set(bearer(accessToken)).send(body);
      expect(res.status).toBe(400);
    }
    const me = await request(app).get("/api/me").set(bearer(accessToken));
    expect(me.body.user.role).toBe("customer");
  });

  it("changes the password, signing out other sessions but keeping this one", async () => {
    const { accessToken, password } = await registerUser(app);
    const bad = await request(app).post("/api/me/password").set(bearer(accessToken)).send({ currentPassword: "Wrong2025", newPassword: "NewRitual2026" });
    expect(bad.status).toBe(400);

    const ok = await request(app).post("/api/me/password").set(bearer(accessToken)).send({ currentPassword: password, newPassword: "NewRitual2026" });
    expect(ok.status).toBe(200);
    expect(refreshCookie(ok)).toBeTruthy();
    expect((await request(app).get("/api/me").set(bearer(accessToken))).status).toBe(401);
    expect((await request(app).get("/api/me").set(bearer(ok.body.accessToken))).status).toBe(200);
  });

  it("signs out everywhere", async () => {
    const { accessToken } = await registerUser(app);
    expect((await request(app).post("/api/me/logout-all").set(bearer(accessToken))).status).toBe(204);
    expect((await request(app).get("/api/me").set(bearer(accessToken))).status).toBe(401);
  });
});

describe("addresses", () => {
  it("makes the first address the default and switches default on request", async () => {
    const { accessToken } = await registerUser(app);
    const a = await request(app).post("/api/addresses").set(bearer(accessToken)).send(home);
    expect(a.status).toBe(201);
    expect(a.body.address).toMatchObject({ isDefault: true, phone: "9876504210" });
    expect(a.body.address.user).toBeUndefined();

    const b = await request(app).post("/api/addresses").set(bearer(accessToken)).send({ ...home, label: "Work", pincode: "560103", isDefault: true });
    expect(b.body.address.isDefault).toBe(true);

    const list = await request(app).get("/api/addresses").set(bearer(accessToken));
    expect(list.body.addresses.map((x) => [x.label, x.isDefault])).toEqual([["Work", true], ["Home", false]]);

    await request(app).patch(`/api/addresses/${a.body.address.id}/default`).set(bearer(accessToken));
    const after = await request(app).get("/api/addresses").set(bearer(accessToken));
    expect(after.body.addresses.filter((x) => x.isDefault).map((x) => x.label)).toEqual(["Home"]);
  });

  it("validates PIN code, phone and state", async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app).post("/api/addresses").set(bearer(accessToken)).send({ ...home, pincode: "012345", phone: "12345", state: "Atlantis" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(["phone", "pincode", "state"]);
  });

  it("never lets one customer read, edit or delete another customer’s address (IDOR)", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const created = await request(app).post("/api/addresses").set(bearer(alice.accessToken)).send(home);
    const id = created.body.address.id;

    expect((await request(app).put(`/api/addresses/${id}`).set(bearer(bob.accessToken)).send({ ...home, city: "Hacked" })).status).toBe(404);
    expect((await request(app).patch(`/api/addresses/${id}/default`).set(bearer(bob.accessToken))).status).toBe(404);
    expect((await request(app).delete(`/api/addresses/${id}`).set(bearer(bob.accessToken))).status).toBe(404);
    expect((await request(app).get("/api/addresses").set(bearer(bob.accessToken))).body.addresses).toHaveLength(0);

    const mine = await request(app).get("/api/addresses").set(bearer(alice.accessToken));
    expect(mine.body.addresses[0].city).toBe("Bengaluru");
  });

  it("promotes another address when the default is deleted", async () => {
    const { accessToken } = await registerUser(app);
    const a = await request(app).post("/api/addresses").set(bearer(accessToken)).send(home);
    await request(app).post("/api/addresses").set(bearer(accessToken)).send({ ...home, label: "Work" });
    expect((await request(app).delete(`/api/addresses/${a.body.address.id}`).set(bearer(accessToken))).status).toBe(204);
    const list = await request(app).get("/api/addresses").set(bearer(accessToken));
    expect(list.body.addresses).toHaveLength(1);
    expect(list.body.addresses[0]).toMatchObject({ label: "Work", isDefault: true });
  });

  it("caps saved addresses at 10", async () => {
    const { accessToken } = await registerUser(app);
    for (let i = 0; i < 10; i += 1) await request(app).post("/api/addresses").set(bearer(accessToken)).send(home);
    const res = await request(app).post("/api/addresses").set(bearer(accessToken)).send(home);
    expect(res.status).toBe(400);
  });

  it("rejects malformed ids", async () => {
    const { accessToken } = await registerUser(app);
    expect((await request(app).delete("/api/addresses/not-an-id").set(bearer(accessToken))).status).toBe(400);
  });
});
