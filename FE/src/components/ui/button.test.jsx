import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Link } from "react-router";
import { Button } from "./button";
import { buttonVariants } from "./button-variants";
import { QuantityStepper, Field } from "./primitives";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it.each([
    ["gold", "bg-grad-gold"],
    ["brown", "bg-brown-700"],
    ["green", "bg-leaf-800"],
    ["outline", "border-sand-500"],
    ["icon", "rounded-full"],
  ])("applies the %s variant", (variant, cls) => {
    expect(buttonVariants({ variant })).toContain(cls);
  });

  it("renders as a router link when as={Link}", () => {
    render(
      <MemoryRouter>
        <Button as={Link} to="/solutions" variant="gold">
          Shop Therapy
        </Button>
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: "Shop Therapy" });
    expect(link).toHaveAttribute("href", "/solutions");
    expect(link).not.toHaveAttribute("type");
  });

  it("does not fire clicks when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Pay</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Pay" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("QuantityStepper", () => {
  it("clamps between min and max", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={1} onChange={onChange} max={2} />);
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<QuantityStepper value={2} onChange={onChange} max={2} />);
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  });
});

describe("Field", () => {
  it("links the label and announces errors", () => {
    render(<Field label="PIN code" error="Enter a 6-digit PIN code" />);
    const input = screen.getByLabelText("PIN code");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a 6-digit PIN code");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 6-digit PIN code");
  });
});
