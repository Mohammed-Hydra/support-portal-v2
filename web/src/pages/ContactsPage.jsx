import { useEffect, useState } from "react";
import { apiRequest } from "../api";
import { toastError, toastSuccess } from "../toast";

export function ContactsPage({ token, t }) {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });

  const load = async () => {
    try {
      const rows = await apiRequest("/api/contacts", { token });
      setContacts(rows);
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to load contacts.");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await apiRequest("/api/contacts", {
        token,
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", phone: "", company: "" });
      await load();
      toastSuccess("Contact added successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to add contact.");
    }
  };

  return (
    <div>
      <h1>{t.contacts}</h1>
      {error ? <p className="error">{error}</p> : null}
      <form className="card" onSubmit={submit}>
        <div className="grid-2">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="grid-2">
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </div>
        <button type="submit">Add Contact</button>
      </form>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Tickets</th></tr>
          </thead>
          <tbody>
            {contacts.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.email || "-"}</td>
                <td>{item.phone || "-"}</td>
                <td>{item.company || "-"}</td>
                <td>{item.tickets_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
