import { useEffect, useState } from "react";
import { apiRequest } from "../../api";
import { toastError, toastSuccess } from "../../toast";

export function UserAdminPage({ token, user, t }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "requester",
    phone: "",
    companyName: "",
  });
  const [resetUserId, setResetUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");

  const loadUsers = async () => {
    try {
      const rows = await apiRequest("/api/users", { token });
      setUsers(rows);
      if (!resetUserId && rows[0]) setResetUserId(String(rows[0].id));
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to load users.");
    }
  };

  useEffect(() => {
    if (user?.role === "admin") loadUsers();
  }, [token, user]);

  if (user?.role !== "admin") return <p>{t.userAdmin}: access denied</p>;

  const createUser = async (event) => {
    event.preventDefault();
    try {
      await apiRequest("/api/users", {
        token,
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", password: "", role: "requester", phone: "", companyName: "" });
      await loadUsers();
      toastSuccess("User created successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to create user.");
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    try {
      await apiRequest(`/api/users/${resetUserId}/reset-password`, {
        token,
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      setNewPassword("");
      toastSuccess("Password reset successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to reset password.");
    }
  };

  const deleteUser = async (targetUserId) => {
    const target = users.find((item) => Number(item.id) === Number(targetUserId));
    const label = target ? `${target.name} (${target.email})` : `#${targetUserId}`;
    if (!window.confirm(`Delete user ${label}? This cannot be undone.`)) return;

    try {
      setDeletingUserId(String(targetUserId));
      await apiRequest(`/api/users/${targetUserId}`, {
        token,
        method: "DELETE",
      });
      await loadUsers();
      toastSuccess("User deleted successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to delete user.");
    } finally {
      setDeletingUserId("");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t.userAdmin}</h1>
        <p>Create accounts, reset credentials, and remove users that are no longer needed.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <div className="subcard">
          <form className="stack" onSubmit={createUser}>
            <h3>Create User</h3>
            <div className="grid-2">
              <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="grid-2">
              <input
                placeholder="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="requester">Requester</option>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === "requester" ? (
              <div className="grid-2">
                <input
                  placeholder="Phone Number"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
                <input
                  placeholder="Company Name"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  required
                />
              </div>
            ) : null}
            <button type="submit">Create</button>
          </form>
        </div>

        <div className="subcard">
          <form className="stack" onSubmit={resetPassword}>
            <h3>Reset Password</h3>
            <div className="grid-2">
              <select value={resetUserId} onChange={(e) => setResetUserId(e.target.value)}>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.email})
                  </option>
                ))}
              </select>
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit">Reset</button>
          </form>
        </div>

        <div className="subcard">
          <h3>User List</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Company</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.role}</td>
                    <td>{item.phone || "-"}</td>
                    <td>{item.company_name || "-"}</td>
                    <td>{item.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => deleteUser(item.id)}
                        disabled={String(user?.id) === String(item.id) || deletingUserId === String(item.id)}
                      >
                        {deletingUserId === String(item.id) ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
