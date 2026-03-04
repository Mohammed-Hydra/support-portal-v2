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
  const [togglingUserId, setTogglingUserId] = useState("");
  const [changingRoleUserId, setChangingRoleUserId] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState({ userId: null, confirmEmail: "" });

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

  const openDeleteConfirm = (targetUserId) => {
    setDeleteConfirm({ userId: targetUserId, confirmEmail: "" });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm({ userId: null, confirmEmail: "" });
  };

  const deleteUserPermanently = async () => {
    const targetUserId = deleteConfirm.userId;
    const target = users.find((item) => Number(item.id) === Number(targetUserId));
    if (!target) {
      toastError("User not found.");
      return;
    }
    const emailMatch = (deleteConfirm.confirmEmail || "").trim().toLowerCase() === (target.email || "").toLowerCase();
    if (!emailMatch) {
      toastError("Type the user's email exactly to confirm permanent deletion.");
      return;
    }

    try {
      setDeletingUserId(String(targetUserId));
      await apiRequest(`/api/users/${targetUserId}`, {
        token,
        method: "DELETE",
      });
      closeDeleteConfirm();
      await loadUsers();
      toastSuccess("User deleted permanently.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to delete user.");
    } finally {
      setDeletingUserId("");
    }
  };

  const toggleUserActive = async (targetUserId) => {
    const target = users.find((item) => Number(item.id) === Number(targetUserId));
    if (!target) return;
    const willEnable = !target.is_active;
    const action = willEnable ? "enable" : "disable";
    const label = `${target.name} (${target.email})`;
    if (!window.confirm(`${action === "enable" ? "Enable" : "Disable"} ${label}? ${willEnable ? "They will be able to sign in again." : "They will not be able to sign in until an admin re-enables the account."}`)) return;

    try {
      setTogglingUserId(String(targetUserId));
      await apiRequest(`/api/users/${targetUserId}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ is_active: willEnable }),
      });
      await loadUsers();
      toastSuccess(willEnable ? "User enabled." : "User disabled.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to update user.");
    } finally {
      setTogglingUserId("");
    }
  };

  const changeUserRole = async (targetUserId, newRole) => {
    const target = users.find((item) => Number(item.id) === Number(targetUserId));
    if (!target || target.role === newRole) return;
    const label = `${target.name} (${target.email})`;
    if (!window.confirm(`Change ${label} from ${target.role} to ${newRole}?`)) return;

    try {
      setChangingRoleUserId(String(targetUserId));
      await apiRequest(`/api/users/${targetUserId}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      await loadUsers();
      toastSuccess(`Role updated to ${newRole}.`);
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to update role.");
    } finally {
      setChangingRoleUserId("");
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
              <input id="user-name" name="name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input id="user-email" name="email" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="grid-2">
              <input
                id="user-password"
                name="password"
                placeholder="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <select id="user-role" name="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="requester">Requester</option>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === "requester" ? (
              <div className="grid-2">
                <input
                  id="user-phone"
                  name="phone"
                  placeholder="Phone Number"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
                <input
                  id="user-company"
                  name="companyName"
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
              <select id="reset-user" name="resetUserId" value={resetUserId} onChange={(e) => setResetUserId(e.target.value)}>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.email})
                  </option>
                ))}
              </select>
              <input
                id="reset-new-password"
                name="newPassword"
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
          {deleteConfirm.userId ? (() => {
            const target = users.find((u) => Number(u.id) === Number(deleteConfirm.userId));
            const label = target ? `${target.name} (${target.email})` : `#${deleteConfirm.userId}`;
            return (
              <div className="stack" style={{ marginBottom: 16, padding: 12, background: "var(--bg-muted, #f5f5f5)", borderRadius: 8 }}>
                <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>Permanently delete user?</p>
                <p style={{ margin: "0 0 8px 0", fontSize: 14 }}>{label}</p>
                <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "var(--muted, #666)" }}>This cannot be undone. Type the user&apos;s email below to confirm.</p>
                <input
                  id="delete-confirm-email"
                  name="confirmEmail"
                  type="text"
                  placeholder="Type user's email to confirm"
                  value={deleteConfirm.confirmEmail}
                  onChange={(e) => setDeleteConfirm((c) => ({ ...c, confirmEmail: e.target.value }))}
                  style={{ marginBottom: 8, maxWidth: 320 }}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={closeDeleteConfirm}>Cancel</button>
                  <button
                    type="button"
                    onClick={deleteUserPermanently}
                    disabled={
                      deletingUserId === String(deleteConfirm.userId)
                      || (deleteConfirm.confirmEmail || "").trim().toLowerCase() !== (target?.email || "").toLowerCase()
                    }
                  >
                    {deletingUserId === String(deleteConfirm.userId) ? "Deleting..." : "Delete permanently"}
                  </button>
                </div>
              </div>
            );
          })() : null}
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
                    <td>
                      <select
                        value={item.role}
                        onChange={(e) => changeUserRole(item.id, e.target.value)}
                        disabled={String(user?.id) === String(item.id) || changingRoleUserId === String(item.id)}
                        title={String(user?.id) === String(item.id) ? "You cannot change your own role" : "Change role"}
                      >
                        <option value="requester">Requester</option>
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                      {changingRoleUserId === String(item.id) ? " …" : null}
                    </td>
                    <td>{item.phone || "-"}</td>
                    <td>{item.company_name || "-"}</td>
                    <td>{item.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleUserActive(item.id)}
                        disabled={String(user?.id) === String(item.id) || togglingUserId === String(item.id)}
                        title={String(user?.id) === String(item.id) ? "You cannot disable your own account" : item.is_active ? "Disable this user (they will see a message to contact admin)" : "Enable this user"}
                      >
                        {togglingUserId === String(item.id) ? "..." : item.is_active ? "Disable" : "Enable"}
                      </button>
                      {" "}
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm(item.id)}
                        disabled={String(user?.id) === String(item.id) || deletingUserId === String(item.id)}
                        title="Permanently delete this user (requires confirmation)"
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
