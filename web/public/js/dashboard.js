(() => {
  'use strict';

  const messages = Array.from(document.querySelectorAll('.dashboard-message > span'));
  const stats = document.querySelector('.dashboard-page .stats-grid');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const timers = [];
  let messageIndex = 0;

  function changeMessage() {
    messages.forEach(message => message.classList.remove('is-leaving'));
    messages[messageIndex].classList.replace('is-current', 'is-leaving');
    messages[messageIndex].setAttribute('aria-hidden', 'true');
    messageIndex = (messageIndex + 1) % messages.length;
    messages[messageIndex].classList.add('is-current');
    messages[messageIndex].setAttribute('aria-hidden', 'false');
  }

  function cancelAnimations() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
  }

  function rotateStats() {
    const cards = Array.from(stats.children).filter(card => card.matches('.stat-card'));
    if (cards.length < 2) return;

    cancelAnimations();
    const before = new Map(cards.map(card => [card, { x: card.offsetLeft, y: card.offsetTop }]));
    stats.append(cards[0]);

    if (reducedMotion.matches || !cards[0].animate || !CSS.supports('translate', '1px')) return;

    cards.forEach((card, index) => {
      const x = before.get(card).x - card.offsetLeft;
      const y = before.get(card).y - card.offsetTop;
      // Animate translate independently so the existing floating hover still works.
      const frames = index === 0 ? [
        { translate: `${x}px ${y}px`, opacity: 1, offset: 0 },
        { translate: `${x - 8}px ${y}px`, opacity: 0, offset: .3 },
        { translate: '8px 0px', opacity: 0, offset: .31 },
        { translate: '0px 0px', opacity: 1, offset: 1 }
      ] : [
        { translate: `${x}px ${y}px` },
        { translate: '0px 0px' }
      ];
      const animation = card.animate(frames, {
        duration: 760,
        easing: 'cubic-bezier(.22, .61, .36, 1)'
      });
      animations.add(animation);
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    });
  }

  function stopTimers() {
    timers.forEach(timer => window.clearInterval(timer));
    timers.length = 0;
    cancelAnimations();
  }

  function startTimers() {
    stopTimers();
    if (document.hidden) return;
    if (messages.length > 1) timers.push(window.setInterval(changeMessage, 3000));
    if (stats) timers.push(window.setInterval(rotateStats, 2000));
  }

  document.addEventListener('visibilitychange', startTimers);
  window.addEventListener('pagehide', stopTimers);
  window.addEventListener('pageshow', startTimers);
  window.addEventListener('resize', cancelAnimations);
  reducedMotion.addEventListener('change', cancelAnimations);
  startTimers();
})();
