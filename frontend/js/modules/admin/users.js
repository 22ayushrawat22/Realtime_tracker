// ── js/modules/admin/users.js ─────────────────────────────────────────────────
// Admin: User management – list all users, create, update role,
// reset password, delete. Exposed as window.* for inline HTML handlers.
// ─────────────────────────────────────────────────────────────────────────────
import { $, API } from '../../state.js';
import { showToast } from '../ui/utils.js';

function getToken() {
  return JSON.parse(sessionStorage.getItem('campus_session') || '{}').token;
}

const authHeaders = () => ({ 'Authorization': 'Bearer ' + getToken() });

// ── Fetch and render user list ────────────────────────────────────────────────
export async function fetchUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</td></tr>';

  try {
    const res = await fetch(`${API}/api/users`, { headers: authHeaders() });
    if (!res.ok) throw new Error();
    const users = await res.json();

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No users found.</td></tr>';
      return;
    }

    const roleColors = { admin: '#f59e0b', driver: '#6366f1', student: '#10b981' };

    tbody.innerHTML = users.map(u => {
      const rc = roleColors[u.role] || '#ccc';
      return `<tr style="border-bottom:1px solid var(--border);"
                  onmouseover="this.style.background='rgba(0,0,0,0.03)'"
                  onmouseout="this.style.background='none'">
        <td style="padding:12px;">#${u.id}</td>
        <td style="padding:12px;font-weight:600;">${u.username}</td>
        <td style="padding:12px;">
          <span style="background:${rc}22;color:${rc};padding:3px 10px;border-radius:20px;font-size:0.8rem;font-weight:700;text-transform:uppercase;">${u.role}</span>
        </td>
        <td style="padding:12px;">
          <select onchange="window._updateUserRole(${u.id}, this.value)" class="select-input" style="padding:6px 8px;font-size:0.85rem;">
            <option value="student" ${u.role==='student'?'selected':''}>Student</option>
            <option value="driver"  ${u.role==='driver' ?'selected':''}>Driver</option>
            <option value="admin"   ${u.role==='admin'  ?'selected':''}>Admin</option>
          </select>
        </td>
        <td style="padding:12px;">
          <button onclick="window._resetUserPassword(${u.id},'${u.username}')"
            style="background:rgba(99,102,241,.1);border:none;color:#6366f1;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:500;font-size:0.85rem;">
            Reset PW
          </button>
        </td>
        <td style="padding:12px;text-align:right;">
          <button onclick="window._deleteUser(${u.id},'${u.username}')"
            style="background:rgba(239,68,68,.1);border:none;color:#ef4444;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:500;font-size:0.85rem;">
            Delete
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#ef4444;">Failed to load users.</td></tr>';
  }
}

// ── Create user form ──────────────────────────────────────────────────────────
export function initCreateUserForm() {
  const form = document.getElementById('createUserForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl   = document.getElementById('createUserError');
    errEl.style.display = 'none';
    const btn     = form.querySelector('button[type="submit"]');
    const origTxt = btn.textContent;
    btn.textContent = 'Creating...';
    btn.disabled    = true;

    try {
      const res  = await fetch(`${API}/api/users`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body:    JSON.stringify({
          username: document.getElementById('newUsername').value.trim(),
          password: document.getElementById('newPassword').value,
          role:     document.getElementById('newRole').value
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`User "${document.getElementById('newUsername').value}" created!`, 'success');
        form.reset();
        fetchUsers();
      } else {
        errEl.textContent   = data.error || 'Failed to create user.';
        errEl.style.display = 'block';
      }
    } catch {
      errEl.textContent   = 'Network error.';
      errEl.style.display = 'block';
    }

    btn.textContent = origTxt;
    btn.disabled    = false;
  });
}

// ── Global action handlers (called from inline onclick in table) ──────────────
window._updateUserRole = async (id, role) => {
  const res = await fetch(`${API}/api/users/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ role })
  });
  showToast(res.ok ? 'Role updated!' : 'Failed to update role', res.ok ? 'success' : 'error');
  if (res.ok) fetchUsers();
};

window._resetUserPassword = async (id, username) => {
  const newPw = prompt(`Enter new password for "${username}":`);
  if (!newPw || newPw.length < 4) { showToast('Password too short (min 4 chars)', 'error'); return; }
  const res = await fetch(`${API}/api/users/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ password: newPw })
  });
  showToast(res.ok ? `Password reset for "${username}"` : 'Failed to reset password', res.ok ? 'success' : 'error');
};

window._deleteUser = async (id, username) => {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  const res  = await fetch(`${API}/api/users/${id}`, {
    method:  'DELETE',
    headers: authHeaders()
  });
  const data = await res.json();
  if (res.ok) { showToast(`User "${username}" deleted`, 'success'); fetchUsers(); }
  else        showToast(data.error || 'Failed to delete user', 'error');
};
