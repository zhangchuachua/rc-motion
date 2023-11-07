import useState from 'rc-util/lib/hooks/useState';
import * as React from 'react';
import type { MotionStatus, StepStatus } from '../interface';
import {
  STEP_ACTIVATED,
  STEP_ACTIVE,
  STEP_NONE,
  STEP_PREPARE,
  STEP_PREPARED,
  STEP_START,
} from '../interface';
import useIsomorphicLayoutEffect from './useIsomorphicLayoutEffect';
import useNextFrame from './useNextFrame';

const FULL_STEP_QUEUE: StepStatus[] = [
  STEP_PREPARE,
  STEP_START,
  STEP_ACTIVE,
  STEP_ACTIVATED,
];

const SIMPLE_STEP_QUEUE: StepStatus[] = [STEP_PREPARE, STEP_PREPARED];

/** Skip current step */
export const SkipStep = false as const;
/** Current step should be update in */
export const DoStep = true as const;

export function isActive(step: StepStatus) {
  return step === STEP_ACTIVE || step === STEP_ACTIVATED;
}

export default (
  status: MotionStatus,
  prepareOnly: boolean,
  callback: (
    step: StepStatus,
  ) => Promise<void> | void | typeof SkipStep | typeof DoStep,
): [() => void, StepStatus] => {
  // *step 有 none prepare start active end
  const [step, setStep] = useState<StepStatus>(STEP_NONE);

  // *nextFrame 可以理解为是一个延迟函数，将在下一帧异步（宏任务）调用 callback;
  const [nextFrame, cancelNextFrame] = useNextFrame();

  function startQueue() {
    setStep(STEP_PREPARE, true);
  }

  const STEP_QUEUE = prepareOnly ? SIMPLE_STEP_QUEUE : FULL_STEP_QUEUE;

  // useLayoutEffect or useEffect 当可以访问操作 DOM 时将会返回 useLayoutEffect 否则就是 useEffect
  useIsomorphicLayoutEffect(() => {
    // 当 step 不是 none 和 active 时才执行 if 里面的代码
    // 也就是 prepare start active 时执行
    if (step !== STEP_NONE && step !== STEP_ACTIVATED) {
      const index = STEP_QUEUE.indexOf(step);
      const nextStep = STEP_QUEUE[index + 1];
      console.log(`step: ${step}, nextStep: ${nextStep}, status: ${status}`);

      const result = callback(step);//  *注意这里传入的依然是 step 不是 nextStep

      setStep(nextStep, true);

      // if (result === SkipStep) {// 当 prepare 时将会返回 SkipStep
      //   // Skip when no needed
      //   setStep(nextStep, true);
      // } else if (nextStep) {
      //   // Do as frame for step update
      //   nextFrame(info => {
      //     function doNext() {
      //       console.log('donext');
      //       // Skip since current queue is ood
      //       if (info.isCanceled()) return;
      //
      //       setStep(nextStep, true);
      //     }
      //
      //     if (result === true) {
      //       doNext();
      //     } else {
      //       // Only promise should be async
      //       Promise.resolve(result).then(doNext);
      //     }
      //   });
      // }
    }
  }, [status, step]);

  React.useEffect(
    () => () => {
      cancelNextFrame();
    },
    [],
  );

  return [startQueue, step];
};
