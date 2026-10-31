import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Download, Plus, Search, CircleCheck, TriangleAlert, CircleAlert, OctagonX } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { DataTable, ErrorNote, Pager } from "../../components/admin/controls";
import { Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { useAuth } from "../../auth/context";
import { useToast } from "../../toast/context";
import { api } from "../../lib/api";
import { formatPaise } from "../../lib/cn";

const STATUS_TONE = { published: "green", draft: "amber", archived: "grey" };
// Same thresholds as the dashboard (BE/Controller/dashboardController.js).
function level(stock) {
  if (stock <= 0) return { label: "Out of stock", color: "#d03b3b", Icon: OctagonX };
  if (stock <= 5) return { label: "Critical", color: "#ec835a", Icon: CircleAlert };
  if (stock <= 20) return { label: "Low", color: "#fab219", Icon: TriangleAlert };
  return { label: "Healthy", color: "#0ca30c", Icon: CircleCheck };
}

function StockCell({ productId, variant, onSaved }) {
  const [value, setValue] = useState(String(variant.stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = value !== String(variant.stock);
  const lvl = level(variant.stock);
  async function save(e) {
    e.preventDefault();
    const stock = Number(value);
    if (!Number.isInteger(stock) || stock < 0) return setError("Whole number ≥ 0");
    setBusy(true);
    setError("");
    try {
      const { product } = await api(`/api/admin/products/${productId}/stock`, { method: "PATCH", body: { sku: variant.sku, stock } });
      onSaved(product, `Stock for ${variant.sku} set to ${stock}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-center justify-end gap-2 md:justify-start">
      <lvl.Icon className="h-4 w-4 shrink-0" style={{ color: lvl.color }} aria-label={lvl.label} />
      <label className="sr-only" htmlFor={`stock-${variant.sku}`}>
        Stock for {variant.sku}
      </label>
      <input id={`stock-${variant.sku}`} type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-20 rounded-md border border-sand-400 bg-white px-2 text-right tabular-nums" />
      {dirty && (
        <Button type="submit" size="sm" variant="brown" disabled={busy} className="min-h-9 px-3">
          Save
        </Button>
      )}
      {error && (
        <span role="alert" className="text-xs text-danger-600">
          {error}
        </span>
      )}
    </form>
  );
}

// Fetches every product (100 per page) and writes one row per variant to an .xlsx file.
// The Excel library is only downloaded when someone exports.
async function exportExcel({ includeInternal }) {
  const products = [];
  for (let page = 1; page <= 50; page += 1) {
    const d = await api(`/api/admin/products?limit=100&page=${page}`);
    products.push(...d.products);
    if (page >= d.pages) break;
  }
  const rows = products.flatMap((p) => p.variants.map((v) => ({ p, v })));
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const head = (value) => ({ value, fontWeight: "bold" });
  const rupees = (paise) => (paise === null || paise === undefined ? null : paise / 100);
  const columns = [
    { header: head("Product"), cell: ({ p }) => ({ value: p.name }), width: 34 },
    { header: head("Slug"), cell: ({ p }) => ({ value: p.slug }), width: 30 },
    { header: head("Status"), cell: ({ p }) => ({ value: p.status }), width: 11 },
    { header: head("SKU"), cell: ({ v }) => ({ value: v.sku }), width: 20 },
    { header: head("Variant"), cell: ({ v }) => ({ value: v.label }), width: 34 },
    { header: head("Price (₹)"), cell: ({ v }) => ({ value: rupees(v.price), type: Number, format: "#,##0.00" }), width: 12 },
    { header: head("MRP (₹)"), cell: ({ v }) => ({ value: rupees(v.mrp), type: Number, format: "#,##0.00" }), width: 12 },
    { header: head("Stock"), cell: ({ v }) => ({ value: v.stock, type: Number }), width: 9 },
    { header: head("Level"), cell: ({ v }) => ({ value: level(v.stock).label }), width: 13 },
    { header: head("Weight (g)"), cell: ({ v }) => ({ value: v.weightGrams ?? null, type: Number }), width: 11 },
    ...(includeInternal
      ? [
          { header: head("Cost (₹)"), cell: ({ p }) => ({ value: rupees(p.internal?.costPrice), type: Number, format: "#,##0.00" }), width: 12 },
          { header: head("Supplier"), cell: ({ p }) => ({ value: p.internal?.supplier ?? null }), width: 24 },
        ]
      : []),
  ];
  const date = new Date().toISOString().slice(0, 10);
  await writeExcelFile(rows, { columns }).toFile(`manushyam-inventory-${date}.xlsx`);
  return rows.length;
}

export default function Inventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const setParam = useCallback(
    (key, value) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (value) n.set(key, value);
          else n.delete(key);
          if (key !== "page") n.delete("page");
          return n;
        },
        { replace: true }
      ),
    [setParams]
  );

  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => setParam("q", search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, q, setParam]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(page), limit: "50", ...(q ? { q } : {}), ...(status ? { status } : {}) });
    api(`/api/admin/products?${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [q, status, page]);

  const replace = (product, message) => {
    setData((d) => ({ ...d, products: d.products.map((p) => (p.id === product.id ? product : p)) }));
    toast({ message });
  };

  async function onExport() {
    setExporting(true);
    try {
      const n = await exportExcel({ includeInternal: user.role === "admin" });
      toast({ message: `Exported ${n} variants.` });
    } catch (err) {
      toast({ message: err.message || "Export failed.", tone: "error" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPage
      title="Inventory"
      subtitle={data ? `${data.total} products` : undefined}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? "Exporting…" : "Export to Excel"}
          </Button>
          <Link to="/admin/products/new" className={buttonVariants({ variant: "brown", size: "sm" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New product
          </Link>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full min-w-0 flex-none sm:w-auto sm:min-w-[260px] sm:flex-1">
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden="true" />
          <input id="product-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, slug or SKU" className="h-11 w-full rounded-md border border-sand-400 bg-white pl-10 pr-3 text-sm focus:outline-none" />
        </div>
        <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-ink-700 sm:w-auto">
          Status
          <select value={status} onChange={(e) => setParam("status", e.target.value)} className="h-11 w-full rounded-md border border-sand-400 bg-white px-3 text-sm sm:min-w-[160px]">
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!data ? (
          <Skeleton className="m-5 h-64" />
        ) : data.products.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No products match.</p>
        ) : (
          <DataTable caption="Products and stock" head={["Product", "Status", "SKU / variant", { label: "Price", className: "text-right" }, "Stock"]} minWidth={760}>
            {data.products.map((p) =>
              p.variants.map((v, i) => (
                <tr key={v.sku}>
                  {i === 0 && (
                    <>
                      <td className="align-top" rowSpan={p.variants.length}>
                        <div className="flex items-center gap-3">
                          {p.images?.[0] ? <img src={p.images[0].url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-sand-400/60" /> : <span className="h-11 w-11 shrink-0 rounded-xl bg-cream-300" />}
                          <Link to={`/admin/products/${p.id}`} className="font-medium text-cocoa-900 hover:text-gold-700">
                            {p.name}
                          </Link>
                        </div>
                      </td>
                      <td className="align-top" rowSpan={p.variants.length}>
                        <StatusPill tone={STATUS_TONE[p.status]} className="capitalize">
                          {p.status}
                        </StatusPill>
                      </td>
                    </>
                  )}
                  <td>
                    <span>
                      <span className="font-mono text-xs">{v.sku}</span>
                      <span className="block text-xs text-ink-500">{v.label}</span>
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatPaise(v.price)}</td>
                  <td>
                    <StockCell key={`${v.sku}-${v.stock}`} productId={p.id} variant={v} onSaved={replace} />
                  </td>
                </tr>
              ))
            )}
          </DataTable>
        )}
      </Panel>
      {data && <Pager page={data.page} pages={data.pages} onPage={(n) => setParam("page", String(n))} />}
    </AdminPage>
  );
}
