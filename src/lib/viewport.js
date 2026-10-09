// iPhone ではキーボードが出ても画面(レイアウト)の高さが変わらず、下にくっついた入力シートの
// 送信ボタンがキーボードの裏に隠れてしまう。いま実際に見えている高さを CSS 変数に入れて、
// シートを見えている範囲の一番下に合わせる。
//   --kb  : 画面の下のうち、キーボードなどで隠れている高さ
//   --vvh : いま見えている高さ

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
    root.classList.toggle('kb-open', hidden > 80);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  update();
}
