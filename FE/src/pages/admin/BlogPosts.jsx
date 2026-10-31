import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { DataTable, ErrorNote, FilterSelect, Pager } from "../../components/admin/controls";
import { Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { useToast } from "../../toast/context";
import { postState, slugify, useUrlParams } from "../../lib/admin";
import { api } from "../../lib/api";
import { clearQueryCache } from "../../lib/query";
import { formatDate } from "../../lib/orders";

function Categories({ categories, onChange }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function add(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/admin/blog/categories", { method: "POST", body: { name: name.trim(), slug: slugify(name), sortOrder: categories.length * 10 } });
      setName("");
      clearQueryCache();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }
  async function remove(c) {
    try {
      await api(`/api/admin/blog/categories/${c.id}`, { method: "DELETE" });
      clearQueryCache();
      onChange();
      toast({ message: `Category “${c.name}” deleted.` });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }
  return (
    <Panel title="Categories">
      <ul className="divide-y divide-sand-400">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2 text-sm">
            <span>
              {c.name} <span className="font-mono text-xs text-ink-500">/{c.slug}</span>
            </span>
            <Button size="icon" variant="ghost" aria-label={`Delete category ${c.name}`} onClick={() => remove(c)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 border-t border-sand-400 p-4" aria-label="New category">
        <label htmlFor="new-category" className="sr-only">
          New category name
        </label>
        <input id="new-category" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={60} className="h-10 min-w-0 flex-1 rounded-md border border-sand-400 px-3 text-sm" />
        <Button type="submit" size="sm" variant="outline" disabled={name.trim().length < 2}>
          Add
        </Button>
      </form>
      {error && <p className="px-4 pb-3 text-xs text-danger-600">{error}</p>}
    </Panel>
  );
}

export default function BlogPosts() {
  const { toast } = useToast();
  const { get, setParam } = useUrlParams();
  const status = get("status");
  const page = Number(get("page", "1"));
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const loadCategories = useCallback(() => {
    api("/api/admin/blog/categories")
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);
  useEffect(loadCategories, [loadCategories]);

  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/blog/posts?page=${page}${status ? `&status=${status}` : ""}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, page, reloadKey]);

  async function remove(p) {
    try {
      await api(`/api/admin/blog/posts/${p.id}`, { method: "DELETE" });
      clearQueryCache();
      toast({ message: `“${p.title}” deleted.` });
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }

  const catName = (id) => categories.find((c) => c.id === id)?.name ?? "—";
  return (
    <AdminPage
      title="Blog"
      subtitle={data ? `${data.total} articles` : undefined}
      actions={
        <Link to="/admin/blog/new" className={buttonVariants({ variant: "brown", size: "sm" })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New article
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <FilterSelect
            label="Status"
            className="w-48"
            value={status}
            onChange={(v) => setParam("status", v)}
            options={[
              ["", "All"],
              ["published", "Published"],
              ["scheduled", "Scheduled"],
              ["draft", "Drafts"],
            ]}
          />
          <ErrorNote>{error}</ErrorNote>
          <Panel>
            {!data ? (
              <Skeleton className="m-5 h-48" />
            ) : data.posts.length === 0 ? (
              <p className="p-8 text-center text-ink-500">No articles here yet.</p>
            ) : (
              <DataTable caption="Articles" head={["Article", "Category", "Status", "Updated", ""]} minWidth={640}>
                {data.posts.map((p) => {
                  const st = postState(p);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/admin/blog/${p.id}`} className="font-medium text-cocoa-900 hover:text-gold-700">
                          {p.title}
                        </Link>
                        {p.isFeatured && <span className="ml-2 text-xs font-semibold text-gold-700">Featured</span>}
                        <span className="block font-mono text-xs text-ink-500">/blog/{p.slug}</span>
                      </td>
                      <td>{catName(p.category)}</td>
                      <td>
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      </td>
                      <td className="text-ink-700">{formatDate(p.updatedAt)}</td>
                      <td className="text-right">
                        <Button size="icon" variant="danger" aria-label={`Delete “${p.title}”`} onClick={() => remove(p)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </Panel>
          {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParam("page", String(p))} />}
        </div>
        <Categories categories={categories} onChange={loadCategories} />
      </div>
    </AdminPage>
  );
}
