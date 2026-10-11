// iPhone ではキーボードが出ても画面(レイアウト)の高さが変わらない。いま実際に見えている高さを
// CSS 変数に入れて、カードやシートを見えている範囲に収めるのに使う。
//   --kb  : 画面の下のうち、キーボードなどで隠れている高さ
//   --vvh : いま見えている高さ
// 文字を打つカードは画面の上に出すので、ここの値が遅れたり間違ったりしても送るボタンは隠れない。
// この値は「はみ出したら中でスクロールさせる」「下から出るメニューを持ち上げる」ための目安。

// キーボードの出入りは少し時間がかかり、終わっても知らせが来ない端末があるので、何度か測り直す
const RECHECK_AFTER_MS = [120, 350, 700];

function isTyping() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
}

export function startViewportVars() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;

  function update() {
    frame = 0;
    const hidden = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--kb', `${hidden}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function recheck() {
    schedule();
    for (const ms of RECHECK_AFTER_MS) setTimeout(schedule, ms);
  }
  // キーボードをしまったあと、画面がずれたまま残ることがあるので元の位置に戻す
  function settle() {
    recheck();
    setTimeout(() => {
      if (!isTyping() && (window.scrollX !== 0 || window.scrollY !== 0)) window.scrollTo(0, 0);
    }, RECHECK_AFTER_MS[1]);
  }

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', recheck);
  document.addEventListener('focusin', recheck);
  document.addEventListener('focusout', settle);
  update();
}
