import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer, admin } from "../../test/fakeApi";
import { safeNext } from "./authUtils";
import { passwordStrength } from "./passwordStrength";

afterEach(() => vi.unstubAllGlobals());

describe("sign in", () => {
  it("goes from password to emailed code to the account page", async () => {
    const fake = installFakeApi({
      "POST /api/auth/login": () => [200, { otpRequired: true, challengeId: "c-1", email: "an•••@example.com" }],
      "POST /api/auth/login/verify": (body) => (body.code === "123456" ? [200, { user: customer, accessToken: "t1" }] : [400, { error: { message: "The code is incorrect or has expired." } }]),
    });
    const { router } = renderRoute("/login");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Email"), "ananya@example.com");
    await user.type(screen.getByLabelText("Password"), "Ritual2025");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText("an•••@example.com")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Digit 1"), "999999");
    await user.click(screen.getByRole("button", { name: "Verify & sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("incorrect");

    await user.type(screen.getByLabelText("Digit 1"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify & sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
    expect(await screen.findByRole("heading", { name: "Namaste, Ananya" })).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path === "/api/auth/login").body).toEqual({ email: "ananya@example.com", password: "Ritual2025" });
  });

  it("shows the server’s error for wrong credentials", async () => {
    installFakeApi({ "POST /api/auth/login": () => [401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }] });
    renderRoute("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "nope1234");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  it("validates before calling the server", async () => {
    const fake = installFakeApi();
    renderRoute("/login");
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path === "/api/auth/login")).toBe(false);
  });
});

describe("registration", () => {
  it("requires terms and a valid password, then verifies the code", async () => {
    installFakeApi({
      "POST /api/auth/register": () => [202, { challengeId: "c-2", email: "ne•••@example.com" }],
      "POST /api/auth/register/verify": () => [201, { user: { ...customer, name: "New Person" }, accessToken: "t2" }],
    });
    const { router } = renderRoute("/register");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Full name"), "New Person");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Please accept the terms to continue")).toBeInTheDocument();
    expect(screen.getAllByText(/8\+ characters/).length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "Ritual2025");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(await screen.findByLabelText("Digit 1"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify & create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
  });
});

describe("protected areas", () => {
  it("sends signed-out visitors to sign in and remembers where they were going", async () => {
    installFakeApi();
    const { router } = renderRoute("/account/addresses");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Faccount%2Faddresses");
  });

  it("keeps customers out of the admin panel", async () => {
    installFakeApi(signedInAs(customer));
    renderRoute("/admin");
    expect(await screen.findByRole("heading", { name: "You don’t have access to this page" })).toBeInTheDocument();
  });

  it("lets admins in and shows admin-only sections", async () => {
    installFakeApi(signedInAs(admin));
    renderRoute("/admin");
    const nav = await screen.findByRole("complementary", { name: "Admin navigation" });
    expect(within(nav).getByRole("link", { name: "Coupons" })).toBeInTheDocument();
  });

  it("restores the session on page load and links the header to the account", async () => {
    installFakeApi(signedInAs(customer));
    renderRoute("/about");
    expect(await screen.findByRole("link", { name: "My account" })).toHaveAttribute("href", "/account");
  });
});

describe("helpers", () => {
  it.each([
    ["/account/addresses", "/account/addresses"],
    ["//evil.example", "/account"],
    ["https://evil.example", "/account"],
    ["/\\evil.example", "/account"],
    [null, "/account"],
  ])("safeNext(%s) → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it("matches the server password rule", () => {
    expect(passwordStrength("password").valid).toBe(false);
    expect(passwordStrength("12345678").valid).toBe(false);
    expect(passwordStrength("Ritual2025").valid).toBe(true);
    expect(passwordStrength("Ritual-2025-Strong").score).toBe(4);
  });
});
