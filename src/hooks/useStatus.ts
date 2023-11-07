import useState from 'rc-util/lib/hooks/useState';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import type { CSSMotionProps } from '../CSSMotion';
import type {
  MotionEvent,
  MotionEventHandler,
  MotionPrepareEventHandler,
  MotionStatus,
  StepStatus,
} from '../interface';
import {
  STATUS_APPEAR,
  STATUS_ENTER,
  STATUS_LEAVE,
  STATUS_NONE,
  STEP_ACTIVE,
  STEP_PREPARE,
  STEP_PREPARED,
  STEP_START,
} from '../interface';
import useDomMotionEvents from './useDomMotionEvents';
import useIsomorphicLayoutEffect from './useIsomorphicLayoutEffect';
import useStepQueue, { DoStep, isActive, SkipStep } from './useStepQueue';

export default function useStatus(
  supportMotion: boolean,
  visible: boolean,
  getElement: () => HTMLElement,
  {
    motionEnter = true,
    motionAppear = true,
    motionLeave = true,
    motionDeadline,
    motionLeaveImmediately,
    onAppearPrepare,
    onEnterPrepare,
    onLeavePrepare,
    onAppearStart,
    onEnterStart,
    onLeaveStart,
    onAppearActive,
    onEnterActive,
    onLeaveActive,
    onAppearEnd,
    onEnterEnd,
    onLeaveEnd,
    onVisibleChanged,
  }: CSSMotionProps,
): [MotionStatus, StepStatus, React.CSSProperties, boolean] {
  // Used for outer render usage to avoid `visible: false & status: none` to render nothing
  // 避免 visible: false & status: none 不渲染任何内容
  const [asyncVisible, setAsyncVisible] = useState<boolean>();
  const [status, setStatus] = useState<MotionStatus>(STATUS_NONE);
  const [style, setStyle] = useState<React.CSSProperties | undefined>(null);

  const mountedRef = useRef(false);
  const deadlineRef = useRef(null);

  // =========================== Dom Node ===========================
  function getDomElement() {// 约等于 children 的返回值
    return getElement();
  }

  // ========================== Motion End ==========================
  const activeRef = useRef(false);

  /**
   * Clean up status & style // 重置 status style
   */
  function updateMotionEndStatus() {
    setStatus(STATUS_NONE, true);
    setStyle(null, true);
  }

  function onInternalMotionEnd(event: MotionEvent) {
    console.log('on internal motion end');
    const element = getDomElement();
    if (event && !event.deadline && event.target !== element) {
      // event exists
      // not initiated by deadline
      // transitionEnd not fired by inner elements
      return;
    }

    const currentActive = activeRef.current;

    let canEnd: boolean | void;
    if (status === STATUS_APPEAR && currentActive) {
      canEnd = onAppearEnd?.(element, event);
    } else if (status === STATUS_ENTER && currentActive) {
      canEnd = onEnterEnd?.(element, event);
    } else if (status === STATUS_LEAVE && currentActive) {
      canEnd = onLeaveEnd?.(element, event);
    }

    // Only update status when `canEnd` and not destroyed
    if (status !== STATUS_NONE && currentActive && canEnd !== false) {
      // *当 transitionend 和 animationend 触发时重置 status 和 style
      updateMotionEndStatus();
    }
  }

  // 如果执行 patchMotionEvents 的话，相当于为 element 绑定 transitionend 与 animationend 事件，事件回调函数就是传入的 onInternalMotionEnd
  const [patchMotionEvents] = useDomMotionEvents(onInternalMotionEnd);

  // ============================= Step =============================
  const getEventHandlers = (targetStatus: MotionStatus) => {
    switch (targetStatus) {
      case STATUS_APPEAR:
        return {
          [STEP_PREPARE]: onAppearPrepare,
          [STEP_START]: onAppearStart,
          [STEP_ACTIVE]: onAppearActive,
        };

      case STATUS_ENTER:
        return {
          [STEP_PREPARE]: onEnterPrepare,
          [STEP_START]: onEnterStart,
          [STEP_ACTIVE]: onEnterActive,
        };

      case STATUS_LEAVE:
        return {
          [STEP_PREPARE]: onLeavePrepare,
          [STEP_START]: onLeaveStart,
          [STEP_ACTIVE]: onLeaveActive,
        };

      default:
        return {};
    }
  };

  const eventHandlers = React.useMemo<{
    [STEP_PREPARE]?: MotionPrepareEventHandler;
    [STEP_START]?: MotionEventHandler;
    [STEP_ACTIVE]?: MotionEventHandler;
  }>(() => getEventHandlers(status), [status]);

  const [startStep, step] = useStepQueue(status, !supportMotion, newStep => {
    // Only prepare step can be skip
    if (newStep === STEP_PREPARE) {
      const onPrepare = eventHandlers[STEP_PREPARE];
      if (!onPrepare) {
        return SkipStep;
      }

      return onPrepare(getDomElement());
    }

    // Rest step is sync update
    if (step in eventHandlers) {
      setStyle(eventHandlers[step]?.(getDomElement(), null) || null);
    }

    if (step === STEP_ACTIVE) {
      // Patch events when motion needed
      // *active 时为元素添加 transitionend animationend 事件
      patchMotionEvents(getDomElement());

      if (motionDeadline > 0) {
        clearTimeout(deadlineRef.current);
        deadlineRef.current = setTimeout(() => {
          onInternalMotionEnd({
            deadline: true,
          } as MotionEvent);
        }, motionDeadline);
      }
    }

    // 当 step 是 prepared(不是 prepare) 时说明当前是禁用 motion ，在禁用的情况下，只有 prepare 和 prepared 有效，所以下面直接重置 status 与 style
    if (step === STEP_PREPARED) {
      updateMotionEndStatus();
    }

    return DoStep;
  });

  const active = isActive(step);// active 与 end 都属于 active
  activeRef.current = active;

  // ============================ Status ============================
  // Update with new status
  useIsomorphicLayoutEffect(() => {// 这个 effect 将在 visibile 发生改变时触发
    setAsyncVisible(visible);

    const isMounted = mountedRef.current;
    console.log('ismounted', isMounted);
    mountedRef.current = true;

    // if (!supportMotion) {
    //   return;
    // }

    let nextStatus: MotionStatus;

    // Appear
    if (!isMounted && visible && motionAppear) {
      nextStatus = STATUS_APPEAR;
    }

    // Enter
    if (isMounted && visible && motionEnter) {
      nextStatus = STATUS_ENTER;
    }

    // Leave
    if (
      (isMounted && !visible && motionLeave) ||
      (!isMounted && motionLeaveImmediately && !visible && motionLeave)
    ) {
      nextStatus = STATUS_LEAVE;
    }

    const nextEventHandlers = getEventHandlers(nextStatus);

    // Update to next status
    if (nextStatus && (supportMotion || nextEventHandlers[STEP_PREPARE])) {
      setStatus(nextStatus);// 更新 status
      startStep();// 每个 status 都将对应不同的 step 所以每次更新 status 也需要更新 step 重新从 prepare 开始
    } else {
      // Set back in case no motion but prev status has `prepare` step
      setStatus(STATUS_NONE);
    }
  }, [visible]);

  // ============================ Effect ============================
  // Reset when motion changed
  useEffect(() => {
    if (
      // Cancel appear
      (status === STATUS_APPEAR && !motionAppear) ||
      // Cancel enter
      (status === STATUS_ENTER && !motionEnter) ||
      // Cancel leave
      (status === STATUS_LEAVE && !motionLeave)
    ) {
      setStatus(STATUS_NONE);
    }
  }, [motionAppear, motionEnter, motionLeave]);

  useEffect(
    () => () => {
      // 卸载
      mountedRef.current = false;
      clearTimeout(deadlineRef.current);
    },
    [],
  );

  // Trigger `onVisibleChanged`
  const firstMountChangeRef = React.useRef(false);
  useEffect(() => {
    // [visible & motion not end] => [!visible & motion end] still need trigger onVisibleChanged
    if (asyncVisible) {
      firstMountChangeRef.current = true;
    }

    if (asyncVisible !== undefined && status === STATUS_NONE) {
      // Skip first render is invisible since it's nothing changed
      if (firstMountChangeRef.current || asyncVisible) {
        onVisibleChanged?.(asyncVisible);
      }
      firstMountChangeRef.current = true;
    }
  }, [asyncVisible, status]);

  // ============================ Styles ============================
  let mergedStyle = style;
  if (eventHandlers[STEP_PREPARE] && step === STEP_START) {
    mergedStyle = {
      transition: 'none',
      ...mergedStyle,
    };
  }

  return [status, step, mergedStyle, asyncVisible ?? visible];
}
