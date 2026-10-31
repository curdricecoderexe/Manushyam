// Razorpay Checkout is loaded only when a customer actually pays, never on other pages.
const SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading = null;

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SRC;
      script.async = true;
      script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("The payment window didn’t load.")));
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error("We couldn’t open the payment window. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

// Opens the payment window. Resolves with { status: "paid", response } when Razorpay hands back a
// signed payment, or { status: "dismissed", reason } if the customer closes it (after any failed tries).
export async function payWithRazorpay(next, { description }) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve) => {
    let lastError = null;
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const checkout = new Razorpay({
      key: next.keyId,
      order_id: next.razorpayOrderId,
      amount: next.amount,
      currency: next.currency,
      name: "ManushyaM",
      description,
      prefill: next.prefill,
      theme: { color: "#8E5A1C" },
      retry: { enabled: true, max_count: 3 },
      handler: (response) => done({ status: "paid", response }),
      modal: { ondismiss: () => done({ status: "dismissed", reason: lastError }), confirm_close: true },
    });
    // Razorpay keeps the window open so the customer can try another method; remember why it failed.
    checkout.on("payment.failed", (r) => {
      lastError = r?.error?.description || "The payment didn’t go through.";
    });
    checkout.open();
  });
}
