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
let creatorProducts = [];
let theme = (() => { try { return JSON.parse(localStorage.getItem('forma-theme-v1')) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; } })();

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $('teamThemeToggle').setAttribute('aria-pressed', String(theme === 'dark'));
  $('teamThemeToggle').textContent = theme === 'dark' ? '☼' : '◐';
  $('teamThemeToggle').setAttribute('aria-label', theme === 'dark' ? 'Светлая тема' : 'Тёмная тема');
  try { localStorage.setItem('forma-theme-v1', JSON.stringify(theme)); } catch {}
}

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
  $('creatorPanel').hidden = !user || profile.role !== 'creator';
  if (!user) return;
  if (profile.role === 'customer') await loadMyOrders();
  if (['manager', 'creator'].includes(profile.role)) await loadStaffOrders(true);
  if (profile.role === 'employee') await loadStaffOrders(false);
  if (profile.role === 'creator') await loadCreatorProducts();
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
    const custom = item.raw_cost != null
      ? `<small class="order-cost">Материал: ${escapeHtml(String(item.material_amount))} ${escapeHtml(item.material_unit || '')} · сырьё ${Number(item.raw_cost).toFixed(2)} € + наценка 60% = ${Number(item.unit_price).toFixed(2)} €</small>`
      : '';
    const description = item.description ? `<small class="order-description">${escapeHtml(item.description)}</small>` : '';
    const dimensions = item.dimensions_mm && Object.values(item.dimensions_mm).some(Boolean)
      ? `<small class="order-description">Габариты: ${Object.values(item.dimensions_mm).map((value) => value ? `${Number(value)} мм` : '—').join(' × ')}</small>` : '';
    const specs = [
      item.project_type && `Тип: ${escapeHtml(item.project_type)}`,
      item.intended_use && `Назначение: ${escapeHtml(item.intended_use)}`,
      item.technology && `Производство: ${escapeHtml(item.technology)}`,
      item.color && `Цвет: ${escapeHtml(item.color)}`,
      item.finish && `Финиш: ${escapeHtml(item.finish)}`,
      item.due_date && `Желаемый срок: ${escapeHtml(item.due_date)}`
    ].filter(Boolean).map((value) => `<small class="order-description">${value}</small>`).join('');
    const laser = item.laser_design?.text ? `<small class="order-description">Гравировка: ${escapeHtml(item.laser_design.text)} · ${escapeHtml(item.laser_design.surface || '')} · ${escapeHtml(item.laser_design.font || '')} · ${Number(item.laser_design.font_size || 0)} px</small>` : '';
    const model = item.model_url ? `<a class="order-model-link" href="${escapeHtml(item.model_url)}" target="_blank" rel="noopener">Скачать STL: ${escapeHtml(item.model_file || 'модель')}</a>` : (item.model_file ? `<small>Файл модели: ${escapeHtml(item.model_file)}</small>` : '');
    return `<span class="order-item">${escapeHtml(title)}${item.quantity > 1 ? ` × ${Number(item.quantity)}` : ''}${description}${specs}${dimensions}${laser}${custom}${model}</span>`;
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
  await Promise.all(orders.map(async (order) => {
    for (const item of order.items || []) {
      if (!item.model_path) continue;
      const { data } = await db.storage.from('customer-models').createSignedUrl(item.model_path, 3600);
      if (data?.signedUrl) item.model_url = data.signedUrl;
    }
  }));
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

function catalogRow(product) {
  return {
    slug: product.slug,
    title: product.title,
    description: product.description,
    category: product.category,
    price: Number(product.price),
    weight_kg: Number(product.weight || product.weight_kg || 0.1),
    dimensions: product.dimensions || {},
    image_url: product.image ? new URL(product.image, location.href).href : null,
    model_url: product.model ? new URL(product.model, location.href).href : null,
    published: true
  };
}

async function importCurrentCatalog() {
  const button = $('importCatalog');
  button.disabled = true;
  try {
    const response = await fetch('./catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Не удалось прочитать базовый каталог.');
    const defaults = await response.json();
    const { data: existing, error: readError } = await db.from('products').select('slug');
    if (readError) throw readError;
    const known = new Set((existing || []).map((item) => item.slug));
    const missing = defaults.filter((item) => !known.has(item.slug)).map(catalogRow);
    if (!missing.length) {
      $('editorMessage').textContent = 'Каталог уже импортирован; существующие товары не перезаписаны.';
      return;
    }
    const { error } = await db.from('products').insert(missing);
    if (error) throw error;
    $('editorMessage').textContent = `Добавлено товаров: ${missing.length}.`;
    await loadCreatorProducts();
  } catch (error) {
    $('editorMessage').textContent = error.message;
  } finally { button.disabled = false; }
}

async function loadCreatorProducts() {
  const { data, error } = await db.from('products').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  creatorProducts = data || [];
  $('creatorProducts').innerHTML = creatorProducts.length ? creatorProducts.map((product) => `<article class="team-product"><img src="${escapeHtml(product.image_url || '')}" alt="" onerror="this.style.visibility='hidden'"><div><b>${escapeHtml(product.title?.ru || product.slug)}</b><p>${escapeHtml(product.slug)} · ${Number(product.price).toFixed(2)} € · ${product.published ? 'Опубликован' : 'Скрыт'}</p></div><div class="team-product-actions"><button class="button" type="button" data-edit-product="${escapeHtml(product.slug)}">Изменить</button><button class="button quiet" type="button" data-toggle-product="${escapeHtml(product.slug)}" data-published="${!product.published}">${product.published ? 'Снять с публикации' : 'Опубликовать'}</button></div></article>`).join('') : '<p>Каталог пуст. Импортируйте текущие товары или добавьте первый товар в форме.</p>';
}

function beginProductEdit(slug) {
  const product = creatorProducts.find((item) => item.slug === slug);
  if (!product) return;
  $('productForm').reset();
  $('editingSlug').value = product.slug;
  $('productSlug').value = product.slug;
  $('productSlug').disabled = true;
  $('productCategory').value = product.category;
  $('productPrice').value = product.price;
  $('productWeight').value = product.weight_kg;
  $('titleRu').value = product.title?.ru || '';
  $('titleEn').value = product.title?.en || '';
  $('titleDe').value = product.title?.de || '';
  $('descriptionRu').value = product.description?.ru || '';
  $('descriptionEn').value = product.description?.en || '';
  $('descriptionDe').value = product.description?.de || '';
  $('dimensionWidth').value = product.dimensions?.width || '';
  $('dimensionDepth').value = product.dimensions?.depth || '';
  $('dimensionHeight').value = product.dimensions?.height || '';
  $('productPublished').checked = product.published;
  $('productForm').dataset.imageUrl = product.image_url || '';
  $('productForm').dataset.modelUrl = product.model_url || '';
  $('editorHeading').textContent = `Изменить: ${product.title?.ru || product.slug}`;
  $('editorMessage').textContent = 'Вы редактируете товар. Новый файл заменит текущий.';
  $('creatorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function uploadCatalogFile(file, slug, kind) {
  if (!file) return null;
  const imageExtension = file.name.split('.').pop().toLowerCase();
  const allowedImages = ['jpg', 'jpeg', 'png', 'webp', 'svg'];
  const extension = kind === 'model' ? 'stl' : imageExtension;
  if (kind === 'model' && imageExtension !== 'stl') throw new Error('3D-модель должна быть файлом .stl.');
  if (kind === 'image' && !allowedImages.includes(extension)) throw new Error('Изображение должно быть JPG, PNG, WEBP или SVG.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Максимальный размер файла — 50 МБ.');
  const filePath = `${slug}/${kind}-${Date.now()}.${extension}`;
  const { error } = await db.storage.from('catalog').upload(filePath, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return db.storage.from('catalog').getPublicUrl(filePath).data.publicUrl;
}

async function saveProduct(event) {
  event.preventDefault();
  const form = $('productForm');
  const slug = $('editingSlug').value || $('productSlug').value.trim();
  const image = $('productImage').files[0];
  const model = $('productModel').files[0];
  const existing = creatorProducts.find((item) => item.slug === slug);
  const saveButton = form.querySelector('[type="submit"]');
  saveButton.disabled = true;
  try {
    let imageUrl = form.dataset.imageUrl || existing?.image_url || null;
    let modelUrl = form.dataset.modelUrl || existing?.model_url || null;
    if (image) imageUrl = await uploadCatalogFile(image, slug, 'image');
    if (model) modelUrl = await uploadCatalogFile(model, slug, 'model');
    const row = {
      slug,
      category: $('productCategory').value,
      title: { ru: $('titleRu').value.trim(), en: $('titleEn').value.trim(), de: $('titleDe').value.trim() },
      description: { ru: $('descriptionRu').value.trim(), en: $('descriptionEn').value.trim(), de: $('descriptionDe').value.trim() },
      price: Number($('productPrice').value),
      weight_kg: Number($('productWeight').value),
      dimensions: {
        width: Number($('dimensionWidth').value) || 0,
        depth: Number($('dimensionDepth').value) || 0,
        height: Number($('dimensionHeight').value) || 0
      },
      image_url: imageUrl,
      model_url: modelUrl,
      published: $('productPublished').checked,
      updated_at: new Date().toISOString()
    };
    const { error } = await db.from('products').upsert(row, { onConflict: 'slug' });
    if (error) throw error;
    $('editorMessage').textContent = 'Товар сохранён. Обновите магазин, чтобы увидеть изменения.';
    resetProductForm();
    await loadCreatorProducts();
  } catch (error) { $('editorMessage').textContent = error.message; }
  finally { saveButton.disabled = false; }
}

function resetProductForm() {
  $('productForm').reset();
  $('productForm').dataset.imageUrl = '';
  $('productForm').dataset.modelUrl = '';
  $('productSlug').disabled = false;
  $('editingSlug').value = '';
  $('editorHeading').textContent = 'Добавить товар';
}

$('importCatalog').addEventListener('click', importCurrentCatalog);
$('productForm').addEventListener('submit', saveProduct);
$('cancelEdit').addEventListener('click', resetProductForm);
$('creatorProducts').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-product]');
  const toggle = event.target.closest('[data-toggle-product]');
  if (edit) beginProductEdit(edit.dataset.editProduct);
  if (toggle) {
    toggle.disabled = true;
    try {
      const { error } = await db.from('products').update({ published: toggle.dataset.published === 'true', updated_at: new Date().toISOString() }).eq('slug', toggle.dataset.toggleProduct);
      if (error) throw error;
      $('editorMessage').textContent = 'Публикация товара обновлена.';
      await loadCreatorProducts();
    } catch (error) { $('editorMessage').textContent = error.message; }
  }
});

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
applyTheme();
$('teamThemeToggle').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); });

