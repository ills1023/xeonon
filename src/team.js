const $ = (id) => document.getElementById(id);
const config = window.FORMA_CONFIG || {};
const say = (message) => { $('message').textContent = message; };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const roleNames = { customer: 'Клиент', employee: 'Сотрудник', manager: 'Менеджер', creator: 'Владелец' };
const statusNames = { requested: 'Новый', confirmed: 'Принят', in_production: 'В работе', shipped: 'Выполнен / отправлен', cancelled: 'Отменён' };
let db;
let user;
let profile;

async function setup() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Для аккаунтов и заказов настройте Supabase URL и anon key в config.js.');
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  db = createClient(config.supabaseUrl, config.supabaseAnonKey);
  db.auth.onAuthStateChange(() => setTimeout(() => refresh().catch(showError), 0));
  await refresh();
}

function showError(error) {
  say(error?.message || 'Не удалось выполнить действие. Попробуйте ещё раз.');
}

async function refresh() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  user = data.session?.user || null;
  profile = null;
  if (user) {
    const result = await db.from('profiles').select('id,email,role').eq('id', user.id).single();
    if (result.error) throw result.error;
    profile = result.data;
  }

  $('identity').textContent = user ? `${profile.email} · ${roleNames[profile.role] || profile.role}` : '';
  $('signOut').hidden = !user;
  $('authPanel').hidden = !!user;
  $('clientPanel').hidden = !user || profile.role !== 'customer';
  $('staffPanel').hidden = !user || !['employee', 'manager', 'creator'].includes(profile.role);
  if (!user) return;
  if (profile.role === 'customer') await loadMyOrders();
  if (['manager', 'creator'].includes(profile.role)) await loadStaffOrders(true);
  if (profile.role === 'employee') await loadStaffOrders(false);
}

async function authenticate(mode) {
  try {
    const email = $('email').value.trim();
    const password = $('password').value;
    const result = mode === 'register'
      ? await db.auth.signUp({ email, password })
      : await db.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (mode === 'register' && !result.data.session) {
      say('Аккаунт создан. Подтвердите адрес по ссылке из письма, затем войдите.');
      return;
    }
    say(mode === 'register' ? 'Аккаунт создан.' : 'Вы вошли.');
    await refresh();
  } catch (error) { showError(error); }
}

function renderOrder(order, email, canAssign, employees) {
  const date = new Date(order.created_at).toLocaleString('ru-RU');
  const details = (order.items || []).map((item) => {
    const title = typeof item.title === 'string' ? item.title : 'Заказ';
    return `${escapeHtml(title)}${item.quantity > 1 ? ` × ${Number(item.quantity)}` : ''}`;
  }).join('<br>') || 'Заказ';
  const workflow = canAssign
    ? `<label>Исполнитель<select data-assignee="${order.id}"><option value="">Не назначен</option>${employees.map((person) => `<option value="${person.id}" ${order.assigned_to === person.id ? 'selected' : ''}>${escapeHtml(person.email)}</option>`).join('')}</select></label><button class="button quiet" type="button" data-save-assignee="${order.id}">Сохранить назначение</button>`
    : `<label>Статус<select data-order-status="${order.id}">${Object.entries(statusNames).map(([key, label]) => `<option value="${key}" ${order.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="button quiet" type="button" data-save-status="${order.id}">Обновить статус</button>`;
  return `<article class="creator-product" style="margin:12px 0"><b>${date} · ${escapeHtml(email || 'Клиент')} · ${escapeHtml(statusNames[order.status] || order.status)}</b><p>${details}</p>${workflow}</article>`;
}

async function loadMyOrders() {
  const { data, error } = await db.from('orders').select('id,status,items,created_at').order('created_at', { ascending: false });
  if (error) throw error;
  $('myOrders').innerHTML = data?.length
    ? data.map((order) => `<p class="creator-product"><b>${new Date(order.created_at).toLocaleDateString('ru-RU')} · ${escapeHtml(statusNames[order.status] || order.status)}</b><br>${escapeHtml(order.items?.map((item) => item.title).join(', ') || 'Заказ')}</p>`).join('')
    : '<p>Заказов пока нет.</p>';
}

async function loadStaffOrders(canAssign) {
  $('staffTitle').textContent = canAssign ? 'Управление заказами' : 'Мои назначенные заказы';
  $('staffHelp').textContent = canAssign
    ? 'Назначайте новые заявки сотрудникам. Владелец также управляет ролями команды.'
    : 'Здесь отображаются только назначенные вам заказы. После каждого этапа обновляйте статус.';
  const query = db.from('orders').select('id,user_id,status,items,created_at,assigned_to').order('created_at', { ascending: false }).limit(100);
  const employeesQuery = canAssign
    ? db.from('profiles').select('id,email,role').eq('role', 'employee').order('email')
    : Promise.resolve({ data: [], error: null });
  const [ordersResult, employeesResult] = await Promise.all([query, employeesQuery]);
  if (ordersResult.error) throw ordersResult.error;
  if (employeesResult.error) throw employeesResult.error;
  const orders = ordersResult.data || [];
  let customers = [];
  if (orders.length) {
    const ids = [...new Set(orders.map((order) => order.user_id))];
    const result = await db.from('profiles').select('id,email').in('id', ids);
    if (result.error) throw result.error;
    customers = result.data || [];
  }
  const emails = new Map(customers.map((customer) => [customer.id, customer.email]));
  $('staffOrders').innerHTML = orders.length
    ? orders.map((order) => renderOrder(order, emails.get(order.user_id), canAssign, employeesResult.data || [])).join('')
    : '<p>Заказов пока нет.</p>';
  if (profile.role === 'creator') await renderTeamUsers();
  else $('teamUsers').replaceChildren();
}

async function renderTeamUsers() {
  const { data, error } = await db.from('profiles').select('id,email,role').order('email');
  if (error) throw error;
  const members = (data || []).filter((person) => person.role !== 'creator');
  $('teamUsers').innerHTML = `<h2 style="margin-top:28px">Команда и роли</h2><p class="fine-print">Сотрудник должен сначала создать аккаунт клиента. Только владелец может назначать и снимать роли.</p>${members.length ? members.map((person) => `<article class="creator-product" style="margin:8px 0;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>${escapeHtml(person.email)} · ${escapeHtml(roleNames[person.role] || person.role)}</span><div><label class="sr-only" for="role-${person.id}">Роль пользователя ${escapeHtml(person.email)}</label><select id="role-${person.id}" data-member-role="${person.id}"><option value="customer" ${person.role === 'customer' ? 'selected' : ''}>Клиент</option><option value="employee" ${person.role === 'employee' ? 'selected' : ''}>Сотрудник</option><option value="manager" ${person.role === 'manager' ? 'selected' : ''}>Менеджер</option></select><button class="button quiet" type="button" data-save-role="${person.id}">Сохранить роль</button></div></article>`).join('') : '<p>Пока нет зарегистрированных пользователей.</p>'}`;
}

$('staffPanel').addEventListener('click', async (event) => {
  try {
    const assign = event.target.closest('[data-save-assignee]');
    const status = event.target.closest('[data-save-status]');
    const role = event.target.closest('[data-save-role]');
    if (assign) {
      const orderId = assign.dataset.saveAssignee;
      const employeeId = $(`[data-assignee="${orderId}"]`).value || null;
      const { error } = await db.rpc('assign_order', { p_order_id: orderId, p_employee_id: employeeId });
      if (error) throw error;
      say('Исполнитель назначен.');
      await loadStaffOrders(true);
    } else if (status) {
      const orderId = status.dataset.saveStatus;
      const nextStatus = $(`[data-order-status="${orderId}"]`).value;
      const { error } = await db.rpc('update_assigned_order_status', { p_order_id: orderId, p_status: nextStatus });
      if (error) throw error;
      say('Статус обновлён.');
      await loadStaffOrders(false);
    } else if (role) {
      const userId = role.dataset.saveRole;
      const nextRole = $(`[data-member-role="${userId}"]`).value;
      const { error } = await db.rpc('set_team_role', { p_user_id: userId, p_role: nextRole });
      if (error) throw error;
      say('Роль пользователя обновлена.');
      await loadStaffOrders(true);
    }
  } catch (error) { showError(error); }
});

$('requestForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const details = $('requestText').value.trim();
    if (!details) return;
    const { error } = await db.from('orders').insert({
      user_id: user.id, status: 'requested', items: [{ title: details, quantity: 1, unit_price: 0 }], total_items: 0
    });
    if (error) throw error;
    $('requestText').value = '';
    say('Заявка отправлена. Команда увидит её в списке новых заказов.');
    await loadMyOrders();
  } catch (error) { showError(error); }
});

$('login').addEventListener('click', () => authenticate('login'));
$('register').addEventListener('click', () => authenticate('register'));
$('signOut').addEventListener('click', async () => {
  const { error } = await db.auth.signOut();
  if (error) showError(error);
  else await refresh();
});

setup().catch(showError);

