import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer } from "../../test/fakeApi";

afterEach(() => vi.unstubAllGlobals());

const home = { id: "a1", label: "Home", fullName: "Ananya Sharma", phone: "9876504210", line1: "42, 2nd Cross", city: "Bengaluru", state: "Karnataka", pincode: "560038", isDefault: true };
const work = { ...home, id: "a2", label: "Work", isDefault: false, pincode: "560103" };

describe("addresses", () => {
  it("lists saved addresses with the default marked", async () => {
    installFakeApi({ ...signedInAs(customer), "GET /api/addresses": () => [200, { addresses: [home, work] }] });
    renderRoute("/account/addresses");
    const cards = await screen.findAllByText("Ananya Sharma");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Set as default" })).toHaveLength(1);
  });

  it("validates the form and sends only filled fields", async () => {
    let addresses = [];
    const fake = installFakeApi({
      ...signedInAs(customer),
      "GET /api/addresses": () => [200, { addresses }],
      "POST /api/addresses": (body) => {
        addresses = [{ ...body, id: "a3", isDefault: true }];
        return [201, { address: addresses[0] }];
      },
    });
    renderRoute("/account/addresses");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add your first address" }));
    const form = screen.getByRole("form", { name: "New address" });

    await user.click(within(form).getByRole("button", { name: "Save address" }));
    expect(within(form).getByText("Enter a valid 6-digit PIN code")).toBeInTheDocument();
    expect(fake.calls.some((c) => c.method === "POST" && c.path === "/api/addresses")).toBe(false);

    await user.type(within(form).getByLabelText("Full name"), "Ananya Sharma");
    await user.type(within(form).getByLabelText("Mobile number"), "9876504210");
    await user.type(within(form).getByLabelText("House no., building, street"), "42, 2nd Cross");
    await user.type(within(form).getByLabelText("PIN code"), "560038");
    await user.type(within(form).getByLabelText("City"), "Bengaluru");
    await user.selectOptions(within(form).getByLabelText("State"), "Karnataka");
    await user.click(within(form).getByRole("button", { name: "Save address" }));

    expect(await screen.findByText(/Bengaluru, Karnataka 560038/)).toBeInTheDocument();
    const post = fake.calls.find((c) => c.method === "POST" && c.path === "/api/addresses");
    expect(post.body).not.toHaveProperty("line2");
    expect(post.body).not.toHaveProperty("landmark");
    expect(post.body).toMatchObject({ fullName: "Ananya Sharma", pincode: "560038", state: "Karnataka", label: "Home" });
  });

  it("asks before deleting", async () => {
    const fake = installFakeApi({ ...signedInAs(customer), "GET /api/addresses": () => [200, { addresses: [home] }], "DELETE /api/addresses/a1": () => [204, null] });
    renderRoute("/account/addresses");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(fake.calls.some((c) => c.method === "DELETE")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(fake.calls.some((c) => c.method === "DELETE" && c.path === "/api/addresses/a1")).toBe(true);
  });
});

describe("profile", () => {
  it("saves the profile and shows server validation errors", async () => {
    installFakeApi({
      ...signedInAs(customer),
      "PATCH /api/me": (body) =>
        body.phone === "123" ? [400, { error: { code: "VALIDATION_ERROR", details: [{ path: "phone", message: "Enter a valid 10-digit mobile number" }] } }] : [200, { user: { ...customer, ...body } }],
    });
    renderRoute("/account/profile");
    const user = userEvent.setup();
    const phone = await screen.findByLabelText("Mobile number");
    await user.type(phone, "123");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a valid 10-digit mobile number")).toBeInTheDocument();

    await user.clear(phone);
    await user.type(phone, "9876504210");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });
});
