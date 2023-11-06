/* eslint-disable react/default-props-match-prop-types, react/no-multi-comp, react/prop-types */
import classNames from 'classnames';
import findDOMNode from 'rc-util/lib/Dom/findDOMNode';
import { fillRef, supportRef } from 'rc-util/lib/ref';
import * as React from 'react';
import { useRef } from 'react';
import { Context } from './context';
import DomWrapper from './DomWrapper';
import useStatus from './hooks/useStatus';
import { isActive } from './hooks/useStepQueue';
import type {
  MotionEndEventHandler,
  MotionEventHandler,
  MotionPrepareEventHandler,
  MotionStatus,
} from './interface';
import { STATUS_NONE, STEP_PREPARE, STEP_START } from './interface';
import { getTransitionName, supportTransition } from './util/motion';

export type CSSMotionConfig =
  | boolean
  | {
      transitionSupport?: boolean;
      /** @deprecated, no need this anymore since `rc-motion` only support latest react */
      forwardRef?: boolean;
    };

export type MotionName =
  | string
  | {
      appear?: string;
      enter?: string;
      leave?: string;
      appearActive?: string;
      enterActive?: string;
      leaveActive?: string;
    };

export interface CSSMotionProps {
  motionName?: MotionName;
  visible?: boolean;
  motionAppear?: boolean;
  motionEnter?: boolean;
  motionLeave?: boolean;
  motionLeaveImmediately?: boolean;
  motionDeadline?: number;
  /**
   * Create element in view even the element is invisible.
   * Will patch `display: none` style on it.
   */
  forceRender?: boolean;
  /**
   * Remove element when motion end. This will not work when `forceRender` is set.
   */
  removeOnLeave?: boolean;
  leavedClassName?: string;
  /** @private Used by CSSMotionList. Do not use in your production. */
  eventProps?: object;

  // Prepare groups
  /** Prepare phase is used for measure element info. It will always trigger even motion is off */
  onAppearPrepare?: MotionPrepareEventHandler;
  /** Prepare phase is used for measure element info. It will always trigger even motion is off */
  onEnterPrepare?: MotionPrepareEventHandler;
  /** Prepare phase is used for measure element info. It will always trigger even motion is off */
  onLeavePrepare?: MotionPrepareEventHandler;

  // Normal motion groups
  onAppearStart?: MotionEventHandler;
  onEnterStart?: MotionEventHandler;
  onLeaveStart?: MotionEventHandler;

  onAppearActive?: MotionEventHandler;
  onEnterActive?: MotionEventHandler;
  onLeaveActive?: MotionEventHandler;

  onAppearEnd?: MotionEndEventHandler;
  onEnterEnd?: MotionEndEventHandler;
  onLeaveEnd?: MotionEndEventHandler;

  // Special
  /** This will always trigger after final visible changed. Even if no motion configured. */
  onVisibleChanged?: (visible: boolean) => void;

  internalRef?: React.Ref<any>;

  children?: (
    props: {
      visible?: boolean;
      className?: string;
      style?: React.CSSProperties;
      [key: string]: any;
    },
    ref: (node: any) => void,
  ) => React.ReactElement;
}

export interface CSSMotionState {
  status?: MotionStatus;
  statusActive?: boolean;
  newStatus?: boolean;
  statusStyle?: React.CSSProperties;
  prevProps?: CSSMotionProps;
}

/**
 * `transitionSupport` is used for none transition test case.
 * Default we use browser transition event support check.
 */
export function genCSSMotion(
  config: CSSMotionConfig,
): React.ForwardRefExoticComponent<CSSMotionProps & { ref?: React.Ref<any> }> {
  let transitionSupport = config;

  if (typeof config === 'object') {
    ({ transitionSupport } = config);
  }

  function isSupportTransition(props: CSSMotionProps, contextMotion?: boolean) {
    return !!(props.motionName && transitionSupport && contextMotion !== false);
  }

  /**
   * CSSMotion
   *
   * A React component that applies motion effects to its children based on configuration props.
   * It supports different motion transitions, including entering, leaving, and stable states.
   * CSSMotion uses the forwardRef API to allow passing a ref to the underlying DOM element.
   *
   * 有四种状态：None, appear, enter, active
   * 有五种步骤：None, prepare, start, active, end
   *
   * 将会根据 motionName 通过组合不同的状态和步骤，生成不同的 className 在不同的阶段添加不同的 className 最终创建出 动画
   *
   * @param {object} props - The configuration props
   * @param {boolean} props.visible - Indicates whether the component is visible. Default: true.
   * @param {boolean} props.removeOnLeave - Indicates whether to remove the component from the DOM when it is leaving. Default: true.
   * @param {boolean} props.forceRender - Indicates whether to force rendering the component. Default: undefined.
   * @param {React.ReactNode} props.children - The children to apply motion to.
   * @param {string} props.motionName - The name of the motion transition. A CSS class will be dynamically applied to the children based on this name.
   * @param {string} props.leavedClassName - The CSS class name to apply to the children when they are leaving and removeOnLeave is false.
   * @param {object} props.eventProps - Additional event props to pass to the children during motion.
   *
   * @returns {React.ReactElement} - A React element representing the component with motion effects applied.
   */
  const CSSMotion = React.forwardRef<any, CSSMotionProps>((props, ref) => {
    const {
      // Default config
      visible = true,
      removeOnLeave = true,

      forceRender,
      children,
      motionName,
      leavedClassName,
      eventProps,
    } = props;

    const { motion: contextMotion } = React.useContext(Context);

    const supportMotion = isSupportTransition(props, contextMotion);

    // Ref to the react node, it may be a HTMLElement
    const nodeRef = useRef<any>();
    // Ref to the dom wrapper in case ref can not pass to HTMLElement
    const wrapperNodeRef = useRef();

    function getDomElement() {
      try {
        // Here we're avoiding call for findDOMNode since it's deprecated
        // in strict mode. We're calling it only when node ref is not
        // an instance of DOM HTMLElement. Otherwise use
        // findDOMNode as a final resort
        return nodeRef.current instanceof HTMLElement
          ? nodeRef.current
          : findDOMNode<HTMLElement>(wrapperNodeRef.current);
      } catch (e) {
        // Only happen when `motionDeadline` trigger but element removed.
        return null;
      }
    }

    const [status, statusStep, statusStyle, mergedVisible] = useStatus(
      supportMotion,
      visible,
      getDomElement,
      props,
    );

    // Record whether content has rendered
    // Will return null for un-rendered even when `removeOnLeave={false}`
    const renderedRef = React.useRef(mergedVisible);
    if (mergedVisible) {
      renderedRef.current = true;
    }

    // ====================== Refs ======================
    const setNodeRef = React.useCallback(
      (node: any) => {
        nodeRef.current = node;
        fillRef(ref, node);
      },
      [ref],
    );

    // ===================== Render =====================
    let motionChildren: React.ReactNode;
    const mergedProps = { ...eventProps, visible };

    if (!children) {
      // No children
      motionChildren = null;
    } else if (status === STATUS_NONE) {
      // * status 为 NONE
      // Stable children
      if (mergedVisible) {// 如果 mergedVisible 为 true 触发
        motionChildren = children({ ...mergedProps }, setNodeRef);
      } else if (!removeOnLeave && renderedRef.current && leavedClassName) {// 如果 leave 时删除 DOM 为 false 并且 renderRef.current 为 true 并且 leavedClassName 有值时触发
        motionChildren = children(
          { ...mergedProps, className: leavedClassName },
          setNodeRef,
        );
      } else if (forceRender || (!removeOnLeave && !leavedClassName)) {// 如果 强制渲染 为 true 或者 （leave 时删除 DOM 为 false 并且 leavedClassnName 没有值） 时触发
        motionChildren = children(
          { ...mergedProps, style: { display: 'none' } },
          setNodeRef,
        );
      } else {
        motionChildren = null;
      }
      // *status 为 NONE
    } else {
      // *如果 children 存在 并且 status 不是 NONE 时触发
      // In motion
      let statusSuffix: string;
      if (statusStep === STEP_PREPARE) {
        statusSuffix = 'prepare';
      } else if (isActive(statusStep)) {
        statusSuffix = 'active';
      } else if (statusStep === STEP_START) {
        statusSuffix = 'start';
      }

      const motionCls = getTransitionName(
        motionName,
        `${status}-${statusSuffix}`,
      );

      motionChildren = children(
        {
          ...mergedProps,
          className: classNames(getTransitionName(motionName, status), {
            [motionCls]: motionCls && statusSuffix,
            [motionName as string]: typeof motionName === 'string',
          }),
          style: statusStyle,
        },
        setNodeRef,
      );
    }

    // Auto inject ref if child node not have `ref` props
    if (React.isValidElement(motionChildren) && supportRef(motionChildren)) {
      const { ref: originNodeRef } = motionChildren as any;

      if (!originNodeRef) {
        // rc-motion 将会自动把 ref 添加到渲染的 children 中
        motionChildren = React.cloneElement<any>(motionChildren, {
          ref: setNodeRef,
        });
      }
    }

    return <DomWrapper ref={wrapperNodeRef}>{motionChildren}</DomWrapper>;
  });

  CSSMotion.displayName = 'CSSMotion';

  return CSSMotion;
}

export default genCSSMotion(supportTransition);
