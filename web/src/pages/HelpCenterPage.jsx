import { useEffect, useState } from "react";
import { apiRequest } from "../api";
import { toastError, toastSuccess } from "../toast";

export function HelpCenterPage({ token, user, t }) {
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", category: "General", body: "" });

  const load = async () => {
    try {
      const rows = await apiRequest("/api/help-center/articles", { token });
      setArticles(rows);
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to load articles.");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const openArticle = async (slug) => {
    try {
      const article = await apiRequest(`/api/help-center/articles/${slug}`, { token });
      setSelected(article);
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to open article.");
    }
  };

  const createArticle = async (event) => {
    event.preventDefault();
    try {
      await apiRequest("/api/help-center/articles", {
        token,
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ title: "", category: "General", body: "" });
      await load();
      toastSuccess("Article published successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to publish article.");
    }
  };

  return (
    <div>
      <h1>{t.helpCenter}</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid-2">
        <div className="card">
          <h3>Articles</h3>
          <ul className="list">
            {articles.map((item) => (
              <li key={item.id}>
                <button type="button" className="text-btn" onClick={() => openArticle(item.slug)}>
                  {item.title} ({item.category})
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Preview</h3>
          {selected ? (
            <>
              <h4>{selected.title}</h4>
              <p><em>{selected.category}</em></p>
              <p>{selected.body}</p>
            </>
          ) : (
            <p>Select an article.</p>
          )}
        </div>
      </div>

      {user?.role === "admin" || user?.role === "agent" ? (
        <form className="card" onSubmit={createArticle}>
          <h3>Create Article</h3>
          <input
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <input
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            required
          />
          <textarea
            rows={6}
            placeholder="Body"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
          />
          <button type="submit">Publish</button>
        </form>
      ) : null}
    </div>
  );
}
