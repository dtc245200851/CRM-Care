(() => {
  'use strict';

  const TIME_ZONE = 'Asia/Ho_Chi_Minh';
  const numbers = new Intl.NumberFormat('vi-VN');
  const percentages = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const statuses = {
    potential: { label: 'Tiềm năng', color: '#d69bb9' },
    active: { label: 'Đang chăm sóc', color: '#b09ed0' },
    completed: { label: 'Đã chăm sóc', color: '#a9c1b2' },
    unknown: { label: 'Chưa phân loại', color: '#c0b1bd' }
  };
  const types = {
    call: { label: 'Cuộc gọi', icon: '☏', color: '#ca95b2' },
    email: { label: 'Email', icon: '✉', color: '#b09bd1' },
    meeting: { label: 'Cuộc họp', icon: '♧', color: '#9db9bc' },
    note: { label: 'Ghi chú', icon: '≡', color: '#c5ab7f' },
    other: { label: 'Khác', icon: '✧', color: '#b5a7b4' }
  };
  const byId = id => document.getElementById(id);
  const period = byId('reportPeriod');
  const tooltip = byId('reportTooltip');
  let tooltipTarget = null;
  let controller = null;
  let requestId = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgElement(tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function emptyState(title, text, tag = 'div') {
    const node = element(tag, 'report-placeholder');
    const icon = element('span', 'report-empty-icon', '♡');
    icon.setAttribute('aria-hidden', 'true');
    node.append(icon, element('strong', '', title), element('span', '', text));
    return node;
  }

  function calendarDate(date) {
    return new Date(`${date}T00:00:00+07:00`);
  }

  function addTooltip(node, text) {
    node.dataset.reportTooltip = text;
    node.setAttribute('aria-label', text);
  }

  function renderTrend(trend) {
    const host = byId('customerTrend');
    const granularity = { day: 'Theo ngày', week: 'Theo tuần · Tuần đầu/cuối có thể chưa đủ ngày', month: 'Theo tháng' }[trend.granularity];
    byId('trendCaption').textContent = `${granularity} · Chỉ tính hồ sơ có ngày tạo`;
    if (!trend.points.some(point => point.count > 0)) {
      host.replaceChildren(emptyState('Chưa có khách hàng mới', 'Các hồ sơ được tạo trong thời gian này sẽ xuất hiện tại đây.'));
      return;
    }

    const maximum = Math.max(4, Math.ceil(Math.max(...trend.points.map(point => point.count)) / 4) * 4);
    const chart = element('div', 'report-series');
    const axis = element('div', 'report-y-axis');
    axis.setAttribute('aria-hidden', 'true');
    [1, .75, .5, .25, 0].forEach(fraction => axis.append(element('span', '', numbers.format(maximum * fraction))));
    const scroll = element('div', 'report-series-scroll');
    const canvas = element('div');
    canvas.style.minWidth = `${Math.max(280, trend.points.length * 16)}px`;
    const plot = element('div', 'report-series-plot');
    const labels = element('div', 'report-series-labels');
    labels.setAttribute('aria-hidden', 'true');
    const columns = `repeat(${trend.points.length}, minmax(0, 1fr))`;
    plot.style.gridTemplateColumns = columns;
    labels.style.gridTemplateColumns = columns;
    const shortDate = new Intl.DateTimeFormat('vi-VN', {
      timeZone: TIME_ZONE,
      ...(trend.granularity === 'month' ? { month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit' })
    });
    const labelStep = Math.max(1, Math.ceil(trend.points.length / 5));
    trend.points.forEach((point, index) => {
      const date = calendarDate(point.date);
      const description = `${trend.granularity === 'week' ? 'Tuần bắt đầu ' : ''}${trend.granularity === 'month' ? shortDate.format(date) : dateFormat.format(date)} · ${numbers.format(point.count)} khách hàng mới`;
      const button = element('button', 'report-bar-area');
      button.type = 'button';
      addTooltip(button, description);
      const bar = element('span', 'report-bar');
      bar.style.setProperty('--bar-height', `${point.count / maximum * 100}%`);
      button.append(bar);
      plot.append(button);
      labels.append(element('span', '', index % labelStep === 0 || index === trend.points.length - 1 ? shortDate.format(date) : ''));
    });
    canvas.append(plot, labels);
    scroll.append(canvas);
    chart.append(axis, scroll);
    host.replaceChildren(chart);
    // Show the newest dates first when the chart needs horizontal scrolling.
    scroll.scrollLeft = scroll.scrollWidth;
  }

  function renderStatuses(distribution) {
    const svg = svgElement('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': `Trạng thái của ${numbers.format(distribution.total)} khách hàng` });
    svg.append(svgElement('circle', { cx: 100, cy: 100, r: 76, fill: 'none', stroke: 'rgba(255,248,253,.4)', 'stroke-width': 22 }));
    const legend = document.createDocumentFragment();
    let offset = 0;
    distribution.items.forEach(item => {
      const definition = statuses[item.key] || statuses.unknown;
      const percent = `${percentages.format(item.percentage)}%`;
      const description = `${definition.label}: ${numbers.format(item.count)} khách hàng · ${percent}`;
      if (item.count && distribution.total) {
        const fraction = item.count / distribution.total * 100;
        const circle = svgElement('circle', {
          cx: 100, cy: 100, r: 76, fill: 'none', stroke: definition.color,
          'stroke-width': 22, pathLength: 100, 'stroke-dasharray': `${fraction} ${100 - fraction}`,
          'stroke-dashoffset': -offset, transform: 'rotate(-90 100 100)',
          class: 'report-donut-segment', tabindex: 0
        });
        addTooltip(circle, description);
        svg.append(circle);
        offset += fraction;
      }
      const row = element('li');
      const button = element('button', 'report-legend-row');
      button.type = 'button';
      addTooltip(button, description);
      const dot = element('i');
      dot.style.backgroundColor = definition.color;
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot, element('span', '', definition.label), element('strong', '', numbers.format(item.count)), element('small', '', percent));
      row.append(button);
      legend.append(row);
    });
    byId('customerDonut').replaceChildren(svg);
    byId('customerStatuses').replaceChildren(legend);
    byId('donutTotal').textContent = numbers.format(distribution.total);
    byId('statusNote').textContent = distribution.total ? 'Tỷ lệ trên toàn bộ khách hàng, độc lập với bộ lọc thời gian.' : 'Chưa có khách hàng để tính tỷ lệ.';
  }

  function renderTypes(distribution) {
    const fragment = document.createDocumentFragment();
    const maximum = Math.max(1, ...distribution.items.map(item => item.count));
    distribution.items.forEach(item => {
      const definition = types[item.key] || types.other;
      const row = element('div', 'report-type-row');
      const heading = element('div');
      const value = element('span');
      value.append(element('strong', '', numbers.format(item.count)), element('small', '', ` lượt · ${percentages.format(item.percentage)}%`));
      heading.append(element('span', '', `${definition.icon}  ${definition.label}`), value);
      const track = element('button', 'report-type-track');
      track.type = 'button';
      addTooltip(track, `${definition.label}: ${numbers.format(item.count)} lượt · ${percentages.format(item.percentage)}%`);
      const fill = element('span', 'report-type-fill');
      fill.style.width = `${item.count / maximum * 100}%`;
      fill.style.backgroundColor = definition.color;
      track.append(fill);
      row.append(heading, track);
      fragment.append(row);
    });
    byId('interactionTypes').replaceChildren(fragment);
    byId('interactionNote').textContent = distribution.total ? `${numbers.format(distribution.total)} tương tác trong thời gian đã chọn. Tỷ lệ tính trên tổng lượt tương tác.` : 'Chưa có tương tác trong khoảng thời gian này.';
  }

  function renderActivity(interactions) {
    if (!interactions.length) {
      byId('recentInteractions').replaceChildren(emptyState('Chưa có hoạt động chăm sóc', 'Các cuộc gọi, email, cuộc họp và ghi chú mới sẽ được cập nhật tại đây.', 'li'));
      return;
    }
    const fragment = document.createDocumentFragment();
    interactions.forEach(interaction => {
      const definition = types[interaction.type] || types.other;
      const item = element('li');
      const icon = element('span', 'report-activity-icon', definition.icon);
      icon.setAttribute('aria-hidden', 'true');
      icon.style.backgroundColor = `${definition.color}33`;
      const content = element('div', 'report-activity-content');
      const title = element('div', 'report-activity-title');
      title.append(element('strong', '', interaction.customerName || 'Khách hàng không còn trong danh sách'), element('small', '', definition.label));
      const time = element('time');
      if (interaction.occurredAt) {
        time.dateTime = interaction.occurredAt;
        time.textContent = `${timeFormat.format(new Date(interaction.occurredAt))} · Giờ Việt Nam`;
      } else time.textContent = 'Chưa có thời gian thực hiện';
      content.append(title, element('p', '', interaction.summary), time);
      item.append(icon, content);
      fragment.append(item);
    });
    byId('recentInteractions').replaceChildren(fragment);
  }

  function hideTooltip() {
    tooltip.hidden = true;
    tooltipTarget?.removeAttribute('aria-describedby');
    tooltipTarget = null;
  }

  function revealActiveNavigation() {
    const nav = document.querySelector('.navigation');
    const active = nav.querySelector('[aria-current="page"]');
    if (active && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = active.offsetLeft - nav.offsetLeft;
    }
  }

  function positionTooltip(x, y) {
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, x - width / 2))}px`;
    tooltip.style.top = `${Math.max(12, y - height - 14 >= 12 ? y - height - 14 : Math.min(y + 18, innerHeight - height - 12))}px`;
  }

  function showTooltip(target, event) {
    if (byId('reportData').getAttribute('aria-busy') === 'true') return;
    hideTooltip();
    tooltipTarget = target;
    tooltip.textContent = target.dataset.reportTooltip;
    tooltip.hidden = false;
    target.setAttribute('aria-describedby', 'reportTooltip');
    const rect = target.getBoundingClientRect();
    positionTooltip(event.clientX ?? rect.left + rect.width / 2, event.clientY ?? rect.top);
  }

  ['pointerover', 'focusin', 'pointerdown'].forEach(eventName => document.addEventListener(eventName, event => {
    const target = event.target.closest('[data-report-tooltip]');
    if (target) showTooltip(target, event);
    else hideTooltip();
  }));
  document.addEventListener('pointermove', event => { if (tooltipTarget) positionTooltip(event.clientX, event.clientY); });
  document.addEventListener('pointerout', event => { if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideTooltip(); });
  document.addEventListener('focusout', hideTooltip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', () => { hideTooltip(); revealActiveNavigation(); });

  function renderError() {
    ['totalCustomers', 'newCustomers', 'totalInteractions', 'activeCustomers', 'donutTotal'].forEach(id => { byId(id).textContent = '—'; });
    byId('customerTrend').replaceChildren(emptyState('Dữ liệu chưa sẵn sàng', 'Thử tải lại để xem biểu đồ.'));
    byId('customerDonut').replaceChildren();
    byId('customerStatuses').replaceChildren(element('li', 'report-placeholder', 'Dữ liệu chưa sẵn sàng.'));
    byId('interactionTypes').replaceChildren(element('p', 'report-placeholder', 'Dữ liệu chưa sẵn sàng.'));
    byId('recentInteractions').replaceChildren(element('li', 'report-placeholder', 'Dữ liệu chưa sẵn sàng.'));
    byId('interactionNote').textContent = '';
    byId('statusNote').textContent = '';
    byId('reportRange').textContent = period.selectedOptions[0].textContent;
    byId('reportStatus').textContent = 'Báo cáo chưa được cập nhật.';
    byId('reportError').hidden = false;
  }

  async function loadReport() {
    const currentId = ++requestId;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const timeout = window.setTimeout(() => request.abort(), 15000);
    byId('reportData').setAttribute('aria-busy', 'true');
    byId('reportError').hidden = true;
    byId('reportStatus').textContent = 'Đang cập nhật báo cáo…';
    hideTooltip();
    try {
      const response = await fetch(`/api/reports/overview?${new URLSearchParams({ period: period.value })}`, { signal: request.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error('Report unavailable');
      if (currentId !== requestId) return;
      Object.entries(data.kpis).forEach(([key, value]) => { byId(key).textContent = numbers.format(value); });
      renderTrend(data.customerTrend);
      renderStatuses(data.customerStatuses);
      renderTypes(data.interactionTypes);
      renderActivity(data.recentInteractions);
      byId('reportRange').textContent = data.range.fromDate ? `${dateFormat.format(calendarDate(data.range.fromDate))} – ${dateFormat.format(calendarDate(data.range.toDate))} · Giờ Việt Nam` : `Toàn bộ dữ liệu đến ${dateFormat.format(calendarDate(data.range.toDate))} · Giờ Việt Nam`;
      byId('reportStatus').textContent = `Cập nhật ${timeFormat.format(new Date(data.generatedAt))}`;
      const url = new URL(window.location.href);
      url.searchParams.set('period', data.period);
      window.history.replaceState(null, '', url);
    } catch (error) {
      if (currentId === requestId) renderError();
    } finally {
      window.clearTimeout(timeout);
      if (currentId === requestId) byId('reportData').setAttribute('aria-busy', 'false');
    }
  }

  const initialPeriod = new URLSearchParams(window.location.search).get('period');
  if (Array.from(period.options).some(option => option.value === initialPeriod)) period.value = initialPeriod;
  period.addEventListener('change', loadReport);
  byId('reportRetry').addEventListener('click', loadReport);
  revealActiveNavigation();
  loadReport();
})();
