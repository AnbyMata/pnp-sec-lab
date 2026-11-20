(() => {
  const root = document.querySelector('[data-shop]');
  if (!root) return;
  const $ = s => root.querySelector(s);
  const money = n => Number(n).toLocaleString('ko-KR') + ' CR';
  let products = [], owned = new Set(), authenticated = false, selected = null, busy = false;
  const dialog = $('#shop-dialog');
  async function api(path, data) {
    const response = await fetch('/api/store/' + path, {
      credentials: 'same-origin', cache: 'no-store',
      ...(data ? {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Nebula-Shop': '1'}, body: JSON.stringify(data)} : {})
    });
    const body = await response.json();
    if (!response.ok) { const e = new Error(typeof body.detail === 'string' ? body.detail : '요청을 처리하지 못했습니다.'); e.status = response.status; throw e; }
    return body;
  }
  function node(tag, cls, text) {
    const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el;
  }
  function message(text, error = false) { $('#shop-message').textContent = text; $('#shop-message').className = error ? 'shop-message alert' : 'shop-message'; }
  function cards() {
    $('#shop-products').replaceChildren();
    for (const p of products) {
      const card = node('article', 'planet-card');
      const visual = node('div', 'planet-visual');
      const img = node('img', 'planet-image'); img.src = p.image; img.alt = p.name; img.loading = 'lazy';
      visual.append(img, node('span', 'planet-type', p.kind));
      const info = node('div', 'planet-info'); info.append(node('h3', '', p.name), node('p', '', p.description));
      const bottom = node('div', 'planet-bottom'); const button = node('button', 'detail-button', owned.has(p.id) ? '보유 행성 보기' : '상세 · 구매');
      button.type = 'button'; button.onclick = () => open(p);
      bottom.append(node('strong', '', money(p.price)), button); info.append(bottom); card.append(visual, info); $('#shop-products').append(card);
    }
  }
  async function account() {
    try {
      const wallet = await api('wallet');
      const [inventory, history] = await Promise.all([api('inventory'), api('orders')]);
      authenticated = true; owned = new Set(inventory.orders.map(o => o.planet_id));
      $('#shop-balance').textContent = money(wallet.balance);
      $('#shop-account-note').textContent = '보유 행성 ' + owned.size + '개 · 첫 이용 시 10,000 CR 지급';
      $('#shop-inventory').replaceChildren();
      if (!inventory.orders.length) $('#shop-inventory').append(node('p', 'empty', '아직 보유한 행성이 없어요. 첫 행성을 만나보세요.'));
      for (const o of inventory.orders) {
        const item = node('article', 'shop-owned'); const img = node('img'); img.src = o.product.image; img.alt = '';
        item.append(img, node('strong', '', o.product.name)); $('#shop-inventory').append(item);
      }
      $('#shop-orders').replaceChildren();
      if (!history.orders.length) $('#shop-orders').append(node('p', 'empty', '구매 내역이 없습니다.'));
      for (const o of history.orders) {
        const row = node('div', 'shop-order'); row.append(node('span', '', '#' + o.id), node('strong', '', o.product.name), node('span', '', money(o.total)), node('span', '', o.coupon || '쿠폰 미사용'), node('time', '', o.created_at)); $('#shop-orders').append(row);
      }
    } catch (e) {
      if (e.status !== 401) throw e;
      authenticated = false; owned = new Set();
      $('#shop-balance').textContent = '로그인 후 확인';
      $('#shop-account-note').replaceChildren(document.createTextNode('로그인하면 10,000 CR로 탐험을 시작할 수 있어요. '));
      const a = node('a', '', '로그인 →'); a.href = root.dataset.login; $('#shop-account-note').append(a);
      $('#shop-inventory').textContent = '로그인 후 보유 행성을 확인하세요.';
      $('#shop-orders').textContent = '로그인 후 구매 내역을 확인하세요.';
    }
    cards();
  }
  function open(p) {
    selected = p; $('#shop-detail-name').textContent = p.name; $('#shop-detail-description').textContent = p.description;
    $('#shop-detail-image').src = p.image; $('#shop-detail-image').alt = p.name;
    $('#shop-coupon').value = ''; $('#shop-quote').textContent = '판매가 ' + money(p.price);
    $('#shop-dialog-message').textContent = '';
    $('#shop-buy').disabled = !authenticated || owned.has(p.id);
    $('#shop-buy').textContent = owned.has(p.id) ? '이미 보유한 행성' : authenticated ? '구매 확정' : '로그인 후 구매 가능';
    $('#shop-apply').disabled = !authenticated || owned.has(p.id);
    dialog.showModal();
  }
  function payload() { return {planet_id: selected.id, coupon: $('#shop-coupon').value.trim()}; }
  $('#shop-close').onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  $('#shop-apply').onclick = async () => {
    if (busy) return; busy = true; $('#shop-apply').disabled = true; $('#shop-buy').disabled = true;
    try { const q = await api('quote', payload()); $('#shop-quote').textContent = '할인 ' + money(q.discount) + ' · 결제 금액 ' + money(q.total); $('#shop-dialog-message').textContent = '구매 후 잔액 ' + money(q.balance_after); }
    catch(e) { $('#shop-dialog-message').textContent = e.message; }
    finally { busy = false; $('#shop-apply').disabled = false; $('#shop-buy').disabled = false; }
  };
  $('#shop-buy').onclick = async () => {
    if (busy) return; busy = true; $('#shop-buy').disabled = true; $('#shop-apply').disabled = true;
    try {
      const result = await api('purchase', payload()); dialog.close();
      message(selected.name + ' 구매 완료! ' + money(result.total) + ' 결제되었습니다.');
      await account();
    } catch(e) { $('#shop-dialog-message').textContent = e.message; }
    finally { busy = false; $('#shop-buy').disabled = false; $('#shop-apply').disabled = false; }
  };
  async function load() {
    try { products = (await api('catalog')).products; cards(); await account(); }
    catch(e) { message('상점을 불러오지 못했어요. ' + e.message, true); }
  }
  $('#shop-reload').onclick = load;
  load();
})();
