import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import { toastError, toastSuccess } from "../toast";

const priorities = ["Low", "Medium", "High", "Critical"];
const channels = ["Portal", "Email", "WhatsApp"];
const statuses = ["New", "In Progress", "Waiting User", "Resolved", "Closed"];
const triggers = [
  "ticket_created",
  "ticket_updated",
  "ticket_status_changed",
  "ticket_priority_changed",
  "ticket_message_added",
];

function emptySlaForm() {
  return {
    name: "",
    priority: "Medium",
    first_response_minutes: 120,
    resolution_minutes: 2880,
    category: "",
    department: "",
    channel: "",
    is_default: false,
    is_active: true,
  };
}

function emptyRuleForm() {
  return {
    name: "",
    trigger_event: "ticket_created",
    execution_order: 100,
    is_active: true,
    condition_json: {
      priority: "",
      status: "",
      category: "",
      channel: "",
      subjectIncludes: "",
      requesterCompany: "",
      assigned: "",
    },
    action_json: {
      setStatus: "",
      setPriority: "",
      assignStrategy: "",
      assignAgentId: "",
      addInternalNote: "",
      addTag: "",
      notifyText: "",
    },
  };
}

export function SettingsPage({ token, user, t }) {
  const [loading, setLoading] = useState(true);
  const [slaPolicies, setSlaPolicies] = useState([]);
  const [automationRules, setAutomationRules] = useState([]);
  const [automationRuns, setAutomationRuns] = useState([]);
  const [agents, setAgents] = useState([]);
  const [slaForm, setSlaForm] = useState(emptySlaForm());
  const [ruleForm, setRuleForm] = useState(emptyRuleForm());
  const [testTicketId, setTestTicketId] = useState("");
  const [editingSlaId, setEditingSlaId] = useState(null);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customFieldForm, setCustomFieldForm] = useState({ key: "", label: "", field_type: "text", category_filter: "", is_required: false });
  const [soundOnNotification, setSoundOnNotification] = useState(false);
  const [cannedResponses, setCannedResponses] = useState([]);
  const [ticketTemplates, setTicketTemplates] = useState([]);
  const [webhooks, setWebhooks] = useState([]);

  const isAdmin = user?.role === "admin";
  const channelHint = useMemo(
    () => "Configure Microsoft 365 and WhatsApp webhook secrets with environment variables.",
    []
  );

  const loadAll = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [slas, rules, runs, agentRows, defs, canned, templates, wh] = await Promise.all([
        apiRequest("/api/settings/sla-policies", { token }),
        apiRequest("/api/settings/automation-rules", { token }),
        apiRequest("/api/settings/automation-runs?limit=40", { token }),
        apiRequest("/api/users/agents", { token }),
        apiRequest("/api/custom-fields/definitions", { token }).catch(() => []),
        apiRequest("/api/canned-responses", { token }).catch(() => []),
        apiRequest("/api/ticket-templates", { token }).catch(() => []),
        apiRequest("/api/settings/webhooks", { token }).catch(() => []),
      ]);
      setSlaPolicies(Array.isArray(slas) ? slas : []);
      setAutomationRules(Array.isArray(rules) ? rules : []);
      setAutomationRuns(Array.isArray(runs) ? runs : []);
      setAgents(Array.isArray(agentRows) ? agentRows : []);
      setCustomFieldDefs(Array.isArray(defs) ? defs : []);
      setCannedResponses(Array.isArray(canned) ? canned : []);
      setTicketTemplates(Array.isArray(templates) ? templates : []);
      setWebhooks(Array.isArray(wh) ? wh : []);
    } catch (err) {
      toastError(err.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAll();
    } else {
      setLoading(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    apiRequest("/api/user/preferences", { token })
      .then((p) => setSoundOnNotification(p?.sound_on_notification === true))
      .catch(() => {});
  }, [token]);

  const saveSoundPref = async (checked) => {
    setSoundOnNotification(checked);
    try {
      await apiRequest("/api/user/preferences", {
        token,
        method: "PATCH",
        body: JSON.stringify({ sound_on_notification: checked }),
      });
      toastSuccess("Preferences saved.");
    } catch (err) {
      toastError(err.message || "Failed to save.");
      setSoundOnNotification(!checked);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiRequest("/api/auth/change-password", {
        token,
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordSuccess("Password changed successfully.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPasswordError(err.message || "Failed to change password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const preferencesCard = (
    <div className="subcard">
      <h3>Notifications</h3>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={soundOnNotification}
          onChange={(e) => saveSoundPref(e.target.checked)}
        />
        Play sound when new ticket or reply arrives
      </label>
      {typeof Notification !== "undefined" && (
        <label className="inline-check" style={{ marginTop: 8, display: "block" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              try {
                const { registerPushSubscription } = await import("../utils/pushRegistration");
                await registerPushSubscription(token);
                toastSuccess("Push enabled! You'll get alerts even when the portal tab is closed.");
              } catch (e) {
                if (e.message?.includes("permission denied")) {
                  toastError("Notifications blocked. Enable them in your browser settings.");
                } else if (e.message?.includes("not configured")) {
                  toastError("Push not configured. Admin: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.");
                } else {
                  toastError(e.message || "Could not enable push notifications.");
                }
              }
            }}
          >
            Enable push (alerts when tab closed)
          </button>
          <span className="muted" style={{ display: "block", marginTop: 4 }}>
            Get desktop alerts even when the portal is closed. Requires HTTPS.
          </span>
        </label>
      )}
    </div>
  );

  const changePasswordCard = (
    <div className="subcard">
      <h3>Change password</h3>
      <p className="muted">Update your login password. You do not need an admin to reset it.</p>
      <form className="stack" onSubmit={changePassword}>
        <label>
          Current password
          <input
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            required
            minLength={6}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            required
            minLength={6}
          />
        </label>
        {passwordError ? <p className="error">{passwordError}</p> : null}
        {passwordSuccess ? <p className="success">{passwordSuccess}</p> : null}
        <button type="submit" disabled={changingPassword}>{changingPassword ? "Updating..." : "Update password"}</button>
      </form>
    </div>
  );

  if (!isAdmin) {
    return (
      <div>
        <div className="page-header">
          <h1>{t?.settings ?? "Settings"}</h1>
          <p>Change your account password and preferences.</p>
        </div>
        <div className="card stack">
          {preferencesCard}
          {changePasswordCard}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1>{t?.settings ?? "Settings"}</h1>
        </div>
        <div className="card">
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  const saveSlaPolicy = async (event) => {
    event.preventDefault();
    const payload = {
      ...slaForm,
      first_response_minutes: Number(slaForm.first_response_minutes),
      resolution_minutes: Number(slaForm.resolution_minutes),
    };
    try {
      if (editingSlaId) {
        await apiRequest(`/api/settings/sla-policies/${editingSlaId}`, {
          token,
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toastSuccess("SLA policy updated.");
      } else {
        await apiRequest("/api/settings/sla-policies", {
          token,
          method: "POST",
          body: JSON.stringify(payload),
        });
        toastSuccess("SLA policy created.");
      }
      setSlaForm(emptySlaForm());
      setEditingSlaId(null);
      await loadAll();
    } catch (err) {
      toastError(err.message || "Failed to save SLA policy.");
    }
  };

  const saveAutomationRule = async (event) => {
    event.preventDefault();
    const payload = {
      ...ruleForm,
      execution_order: Number(ruleForm.execution_order),
      condition_json: Object.fromEntries(
        Object.entries(ruleForm.condition_json).filter(([, value]) => String(value || "").trim() !== "")
      ),
      action_json: Object.fromEntries(
        Object.entries(ruleForm.action_json).filter(([, value]) => String(value || "").trim() !== "")
      ),
    };
    try {
      if (editingRuleId) {
        await apiRequest(`/api/settings/automation-rules/${editingRuleId}`, {
          token,
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toastSuccess("Automation rule updated.");
      } else {
        await apiRequest("/api/settings/automation-rules", {
          token,
          method: "POST",
          body: JSON.stringify(payload),
        });
        toastSuccess("Automation rule created.");
      }
      setRuleForm(emptyRuleForm());
      setEditingRuleId(null);
      await loadAll();
    } catch (err) {
      toastError(err.message || "Failed to save automation rule.");
    }
  };

  const runRuleTest = async (ruleId) => {
    const numericTicketId = Number(testTicketId);
    if (!numericTicketId) {
      toastError("Enter Ticket ID for test.");
      return;
    }
    try {
      const result = await apiRequest(`/api/settings/automation-rules/${ruleId}/test`, {
        token,
        method: "POST",
        body: JSON.stringify({ ticketId: numericTicketId }),
      });
      toastSuccess(`Rule test complete. Executed: ${result.executed}, Matched: ${result.matched}`);
      await loadAll();
    } catch (err) {
      toastError(err.message || "Failed to test rule.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t.settings}</h1>
        <p>Manage SLA policies, automation rules, and rule execution history.</p>
      </div>

      <div className="card">
        {preferencesCard}
        {changePasswordCard}
        <div className="subcard">
          <h3>{editingSlaId ? "Edit SLA Policy" : "Create SLA Policy"}</h3>
          <form className="stack" onSubmit={saveSlaPolicy}>
            <div className="grid-2">
              <input
                placeholder="Policy Name"
                value={slaForm.name}
                onChange={(e) => setSlaForm({ ...slaForm, name: e.target.value })}
                required
              />
              <select
                value={slaForm.priority}
                onChange={(e) => setSlaForm({ ...slaForm, priority: e.target.value })}
              >
                {priorities.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <input
                type="number"
                min="1"
                placeholder="First response (minutes)"
                value={slaForm.first_response_minutes}
                onChange={(e) => setSlaForm({ ...slaForm, first_response_minutes: e.target.value })}
                required
              />
              <input
                type="number"
                min="1"
                placeholder="Resolution (minutes)"
                value={slaForm.resolution_minutes}
                onChange={(e) => setSlaForm({ ...slaForm, resolution_minutes: e.target.value })}
                required
              />
            </div>
            <div className="grid-2">
              <input
                placeholder="Category (optional)"
                value={slaForm.category}
                onChange={(e) => setSlaForm({ ...slaForm, category: e.target.value })}
              />
              <input
                placeholder="Department (optional)"
                value={slaForm.department}
                onChange={(e) => setSlaForm({ ...slaForm, department: e.target.value })}
              />
            </div>
            <div className="grid-2">
              <select value={slaForm.channel} onChange={(e) => setSlaForm({ ...slaForm, channel: e.target.value })}>
                <option value="">Any Channel</option>
                {channels.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <div className="inline-check">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={slaForm.is_default}
                    onChange={(e) => setSlaForm({ ...slaForm, is_default: e.target.checked })}
                  />
                  Default policy
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={slaForm.is_active}
                    onChange={(e) => setSlaForm({ ...slaForm, is_active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="top-actions">
              <button type="submit">{editingSlaId ? "Update SLA" : "Create SLA"}</button>
              {editingSlaId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSlaId(null);
                    setSlaForm(emptySlaForm());
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Priority</th>
                  <th>First Response</th>
                  <th>Resolution</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {slaPolicies.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.priority}</td>
                    <td>{item.first_response_minutes}m</td>
                    <td>{item.resolution_minutes}m</td>
                    <td>
                      {(item.category || "any")}/{(item.department || "any")}/{(item.channel || "any")}
                    </td>
                    <td>{item.is_active ? (item.is_default ? "Default" : "Active") : "Inactive"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSlaId(item.id);
                          setSlaForm({
                            name: item.name,
                            priority: item.priority,
                            first_response_minutes: item.first_response_minutes,
                            resolution_minutes: item.resolution_minutes,
                            category: item.category || "",
                            department: item.department || "",
                            channel: item.channel || "",
                            is_default: Boolean(item.is_default),
                            is_active: Boolean(item.is_active),
                          });
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {!slaPolicies.length && !loading ? (
                  <tr>
                    <td colSpan={7} className="muted">No SLA policies.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="subcard">
          <h3>{editingRuleId ? "Edit Automation Rule" : "Create Automation Rule"}</h3>
          <form className="stack" onSubmit={saveAutomationRule}>
            <div className="grid-2">
              <input
                placeholder="Rule Name"
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                required
              />
              <select
                value={ruleForm.trigger_event}
                onChange={(e) => setRuleForm({ ...ruleForm, trigger_event: e.target.value })}
              >
                {triggers.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <input
                type="number"
                min="1"
                placeholder="Execution Order"
                value={ruleForm.execution_order}
                onChange={(e) => setRuleForm({ ...ruleForm, execution_order: e.target.value })}
              />
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>

            <h4>Conditions</h4>
            <div className="grid-2">
              <select
                value={ruleForm.condition_json.priority}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    condition_json: { ...ruleForm.condition_json, priority: e.target.value },
                  })
                }
              >
                <option value="">Any Priority</option>
                {priorities.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                value={ruleForm.condition_json.status}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    condition_json: { ...ruleForm.condition_json, status: e.target.value },
                  })
                }
              >
                <option value="">Any Status</option>
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <input
                placeholder="Category contains"
                value={ruleForm.condition_json.category}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    condition_json: { ...ruleForm.condition_json, category: e.target.value },
                  })
                }
              />
              <select
                value={ruleForm.condition_json.channel}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    condition_json: { ...ruleForm.condition_json, channel: e.target.value },
                  })
                }
              >
                <option value="">Any Channel</option>
                {channels.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <input
                placeholder="Subject contains"
                value={ruleForm.condition_json.subjectIncludes}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    condition_json: { ...ruleForm.condition_json, subjectIncludes: e.target.value },
                  })
                }
              />
              <input
                placeholder="Requester company contains"
                value={ruleForm.condition_json.requesterCompany}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    condition_json: { ...ruleForm.condition_json, requesterCompany: e.target.value },
                  })
                }
              />
            </div>

            <h4>Actions</h4>
            <div className="grid-2">
              <select
                value={ruleForm.action_json.setStatus}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    action_json: { ...ruleForm.action_json, setStatus: e.target.value },
                  })
                }
              >
                <option value="">Keep status</option>
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                value={ruleForm.action_json.setPriority}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    action_json: { ...ruleForm.action_json, setPriority: e.target.value },
                  })
                }
              >
                <option value="">Keep priority</option>
                {priorities.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <select
                value={ruleForm.action_json.assignStrategy}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    action_json: { ...ruleForm.action_json, assignStrategy: e.target.value, assignAgentId: "" },
                  })
                }
              >
                <option value="">No auto assignment</option>
                <option value="least_loaded">Assign to least-loaded agent</option>
              </select>
              <select
                value={ruleForm.action_json.assignAgentId}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    action_json: { ...ruleForm.action_json, assignStrategy: "", assignAgentId: e.target.value },
                  })
                }
              >
                <option value="">No fixed agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <input
                placeholder="Add tag"
                value={ruleForm.action_json.addTag}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    action_json: { ...ruleForm.action_json, addTag: e.target.value },
                  })
                }
              />
              <input
                placeholder="Notification text (for logs)"
                value={ruleForm.action_json.notifyText}
                onChange={(e) =>
                  setRuleForm({
                    ...ruleForm,
                    action_json: { ...ruleForm.action_json, notifyText: e.target.value },
                  })
                }
              />
            </div>
            <textarea
              rows={3}
              placeholder="Internal note to add when rule matches"
              value={ruleForm.action_json.addInternalNote}
              onChange={(e) =>
                setRuleForm({
                  ...ruleForm,
                  action_json: { ...ruleForm.action_json, addInternalNote: e.target.value },
                })
              }
            />

            <div className="top-actions">
              <button type="submit">{editingRuleId ? "Update Rule" : "Create Rule"}</button>
              {editingRuleId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleId(null);
                    setRuleForm(emptyRuleForm());
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="grid-2" style={{ marginTop: "10px" }}>
            <input
              type="number"
              placeholder="Ticket ID for testing"
              value={testTicketId}
              onChange={(e) => setTestTicketId(e.target.value)}
            />
            <span className="muted">Use "Test" button on a rule row to run it on this ticket.</span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trigger</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Conditions</th>
                  <th>Actions</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {automationRules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>{rule.trigger_event}</td>
                    <td>{rule.execution_order}</td>
                    <td>{rule.is_active ? "Active" : "Inactive"}</td>
                    <td><code>{JSON.stringify(rule.condition_json || {})}</code></td>
                    <td><code>{JSON.stringify(rule.action_json || {})}</code></td>
                    <td>
                      <div className="top-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRuleId(rule.id);
                            setRuleForm({
                              name: rule.name,
                              trigger_event: rule.trigger_event,
                              execution_order: rule.execution_order || 100,
                              is_active: Boolean(rule.is_active),
                              condition_json: {
                                priority: rule.condition_json?.priority || "",
                                status: rule.condition_json?.status || "",
                                category: rule.condition_json?.category || "",
                                channel: rule.condition_json?.channel || "",
                                subjectIncludes: rule.condition_json?.subjectIncludes || "",
                                requesterCompany: rule.condition_json?.requesterCompany || "",
                                assigned: rule.condition_json?.assigned || "",
                              },
                              action_json: {
                                setStatus: rule.action_json?.setStatus || "",
                                setPriority: rule.action_json?.setPriority || "",
                                assignStrategy: rule.action_json?.assignStrategy || "",
                                assignAgentId: rule.action_json?.assignAgentId || "",
                                addInternalNote: rule.action_json?.addInternalNote || "",
                                addTag: rule.action_json?.addTag || "",
                                notifyText: rule.action_json?.notifyText || "",
                              },
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" onClick={() => runRuleTest(rule.id)}>Test</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!automationRules.length && !loading ? (
                  <tr>
                    <td colSpan={7} className="muted">No automation rules.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="subcard">
          <h3>Automation Execution History</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Rule</th>
                  <th>Event</th>
                  <th>Ticket</th>
                  <th>Matched</th>
                  <th>Actions / Error</th>
                </tr>
              </thead>
              <tbody>
                {automationRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{new Date(run.created_at).toLocaleString()}</td>
                    <td>{run.rule_name || `Rule #${run.rule_id || "-"}`}</td>
                    <td>{run.event_name}</td>
                    <td>#{run.ticket_id} {run.ticket_subject ? `- ${run.ticket_subject}` : ""}</td>
                    <td>{run.matched ? "Yes" : "No"}</td>
                    <td>
                      {run.error_message ? (
                        <span className="error">{run.error_message}</span>
                      ) : (
                        <code>{JSON.stringify(run.actions_applied || {})}</code>
                      )}
                    </td>
                  </tr>
                ))}
                {!automationRuns.length && !loading ? (
                  <tr>
                    <td colSpan={6} className="muted">No runs yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="subcard">
          <h3>Channel Settings</h3>
          <p>{channelHint}</p>
        </div>

        {(user?.role === "admin" || user?.role === "agent") ? (
          <div className="subcard">
            <h3>Quick replies (canned responses)</h3>
            <p className="muted">Pre-defined replies for common issues. Use in ticket replies via the dropdown.</p>
            <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target;
              const title = (form.title?.value || "").trim();
              const body = (form.body?.value || "").trim();
              if (!title || !body) return;
              try {
                await apiRequest("/api/canned-responses", { token, method: "POST", body: JSON.stringify({ title, body }) });
                toastSuccess("Quick reply added.");
                form.reset();
                await loadAll();
              } catch (err) { toastError(err.message); }
            }}>
              <div className="grid-2">
                <input name="title" placeholder="Title (e.g. Password reset)" required />
                <textarea name="body" rows={2} placeholder="Reply text..." required />
              </div>
              <button type="submit">Add quick reply</button>
            </form>
            <ul className="list" style={{ marginTop: 12 }}>
              {cannedResponses.map((r) => (
                <li key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span><strong>{r.title}</strong> — {String(r.body).slice(0, 50)}…</span>
                  <button type="button" className="btn-secondary" onClick={async () => {
                    if (confirm("Delete this quick reply?")) {
                      await apiRequest(`/api/canned-responses/${r.id}`, { token, method: "DELETE" });
                      toastSuccess("Deleted.");
                      await loadAll();
                    }
                  }}>Delete</button>
                </li>
              ))}
              {!cannedResponses.length && <li className="muted">No quick replies yet.</li>}
            </ul>
          </div>
        ) : null}

        {(user?.role === "admin" || user?.role === "agent") ? (
          <div className="subcard">
            <h3>Ticket templates</h3>
            <p className="muted">Pre-filled forms for common request types. Select when creating a ticket.</p>
            <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target;
              const name = (form.tplName?.value || "").trim();
              const subject = (form.tplSubject?.value || "").trim();
              const description = (form.tplDesc?.value || "").trim();
              const category = form.tplCategory?.value || "general";
              const priority = form.tplPriority?.value || "Medium";
              if (!name || !subject) return;
              try {
                await apiRequest("/api/ticket-templates", { token, method: "POST", body: JSON.stringify({ name, subject, description, category, priority }) });
                toastSuccess("Template added.");
                form.reset();
                await loadAll();
              } catch (err) { toastError(err.message); }
            }}>
              <div className="grid-2">
                <input name="tplName" placeholder="Template name" required />
                <input name="tplSubject" placeholder="Default subject" required />
              </div>
              <textarea name="tplDesc" rows={2} placeholder="Default description (optional)" />
              <div className="grid-2">
                <select name="tplCategory">
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select name="tplPriority">
                  {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button type="submit">Add template</button>
            </form>
            <ul className="list" style={{ marginTop: 12 }}>
              {ticketTemplates.map((t) => (
                <li key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span><strong>{t.name}</strong> — {t.subject}</span>
                  <button type="button" className="btn-secondary" onClick={async () => {
                    if (confirm("Delete this template?")) {
                      await apiRequest(`/api/ticket-templates/${t.id}`, { token, method: "DELETE" });
                      toastSuccess("Deleted.");
                      await loadAll();
                    }
                  }}>Delete</button>
                </li>
              ))}
              {!ticketTemplates.length && <li className="muted">No templates yet.</li>}
            </ul>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="subcard">
            <h3>Slack / Teams webhooks</h3>
            <p className="muted">Get notified when new tickets or messages arrive. Add your incoming webhook URL.</p>
            <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target;
              const name = (form.whName?.value || "").trim();
              const url = (form.whUrl?.value || "").trim();
              const type = form.whType?.value || "slack";
              if (!name || !url) return;
              try {
                await apiRequest("/api/settings/webhooks", { token, method: "POST", body: JSON.stringify({ name, webhook_url: url, type }) });
                toastSuccess("Webhook added.");
                form.reset();
                await loadAll();
              } catch (err) { toastError(err.message); }
            }}>
              <div className="grid-2">
                <input name="whName" placeholder="Name (e.g. Support channel)" required />
                <select name="whType">
                  <option value="slack">Slack</option>
                  <option value="teams">Teams</option>
                </select>
              </div>
              <input name="whUrl" type="url" placeholder="Webhook URL" required />
              <button type="submit">Add webhook</button>
            </form>
            <ul className="list" style={{ marginTop: 12 }}>
              {webhooks.map((w) => (
                <li key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{w.name} ({w.type})</span>
                  <button type="button" className="btn-secondary" onClick={async () => {
                    if (confirm("Remove this webhook?")) {
                      await apiRequest(`/api/settings/webhooks/${w.id}`, { token, method: "DELETE" });
                      toastSuccess("Removed.");
                      await loadAll();
                    }
                  }}>Remove</button>
                </li>
              ))}
              {!webhooks.length && <li className="muted">No webhooks configured.</li>}
            </ul>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="subcard">
            <h3>Custom Fields</h3>
            <p className="muted">Add extra fields (e.g. Asset ID, Location) to tickets. Use key like asset_id or location.</p>
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const categoryFilter = (customFieldForm.category_filter || "").trim()
                    ? (customFieldForm.category_filter || "").split(",").map((s) => s.trim()).filter(Boolean)
                    : [];
                  await apiRequest("/api/custom-fields/definitions", {
                    token,
                    method: "POST",
                    body: JSON.stringify({
                      key: (customFieldForm.key || "").trim().replace(/[^a-z0-9_]/g, "_") || "field",
                      label: (customFieldForm.label || "").trim() || customFieldForm.key,
                      field_type: customFieldForm.field_type || "text",
                      category_filter: categoryFilter,
                      is_required: Boolean(customFieldForm.is_required),
                    }),
                  });
                  toastSuccess("Custom field added.");
                  setCustomFieldForm({ key: "", label: "", field_type: "text", category_filter: "", is_required: false });
                  await loadAll();
                } catch (err) {
                  toastError(err.message || "Failed to add field.");
                }
              }}
            >
              <div className="grid-2">
                <input
                  placeholder="Key (e.g. asset_id)"
                  value={customFieldForm.key}
                  onChange={(e) => setCustomFieldForm((p) => ({ ...p, key: e.target.value }))}
                />
                <input
                  placeholder="Label (e.g. Asset ID)"
                  value={customFieldForm.label}
                  onChange={(e) => setCustomFieldForm((p) => ({ ...p, label: e.target.value }))}
                />
              </div>
              <div className="grid-2">
                <select
                  value={customFieldForm.field_type}
                  onChange={(e) => setCustomFieldForm((p) => ({ ...p, field_type: e.target.value }))}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="select">Select</option>
                </select>
                <input
                  placeholder="Categories (comma-separated, optional)"
                  value={customFieldForm.category_filter}
                  onChange={(e) => setCustomFieldForm((p) => ({ ...p, category_filter: e.target.value }))}
                />
              </div>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={customFieldForm.is_required}
                  onChange={(e) => setCustomFieldForm((p) => ({ ...p, is_required: e.target.checked }))}
                />
                Required
              </label>
              <button type="submit">Add Custom Field</button>
            </form>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {customFieldDefs.map((d) => (
                    <tr key={d.id}>
                      <td><code>{d.key}</code></td>
                      <td>{d.label}</td>
                      <td>{d.field_type}</td>
                      <td>{(d.category_filter || []).join(", ") || "All"}</td>
                    </tr>
                  ))}
                  {!customFieldDefs.length ? (
                    <tr>
                      <td colSpan={4} className="muted">No custom fields defined.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
