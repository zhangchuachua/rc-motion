import raf from 'rc-util/lib/raf';
import * as React from 'react';

export default (): [
  (callback: (info: { isCanceled: () => boolean }) => void) => void,
  () => void,
] => {
  const nextFrameRef = React.useRef<number>(null);

  function cancelNextFrame() {
    raf.cancel(nextFrameRef.current);
  }

  // 根据下面当注释就可以看明白，这个 nextFrame 的含义就是下一帧将要做的事情；也就是会在下一帧进行执行
  function nextFrame(
    callback: (info: { isCanceled: () => boolean }) => void,
    delay = 2,
  ) {
    cancelNextFrame();// 如果已经有一个了，就取消上一个

    // *raf -> requestAnimationFrame 准确的来说，功能更类似于 setTimeout; raf 支持两个参数，第一个参数就是 callback 第二个参数是 times 然后在每次执行 requestAnimationFrame 时会减少 times 当 times 为 0 时才执行 callback；可以理解为 callback 就是一个延迟函数，异步函数，在屏幕刷新 times 后执行；times 默认为 1
    const nextFrameId = raf(() => {
      if (delay <= 1) {
        callback({ isCanceled: () => nextFrameId !== nextFrameRef.current });
      } else {
        nextFrame(callback, delay - 1);
      }
    });

    nextFrameRef.current = nextFrameId;
  }

  React.useEffect(
    () => () => {
      cancelNextFrame();
    },
    [],
  );

  return [nextFrame, cancelNextFrame];
};
