import React from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * DialogOpener 返回的控制句柄
 */
export interface DialogHandle<P> {
  /** 销毁弹窗并移除 DOM 容器 */
  destroy: () => void;
  /** 更新弹窗的 props（浅合并） */
  update: (newProps: Partial<P>) => void;
}

/**
 * 内部包装组件，负责管理 open 状态 & 关闭动画
 */
function DialogWrapper<P extends Record<string, unknown>>({
  Component,
  componentProps,
  onClosed,
}: {
  Component: React.ComponentType<P>;
  componentProps: P;
  onClosed: () => void;
}) {
  const [open, setOpen] = React.useState(true);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setOpen(false);
    }
  }, []);

  // 监听关闭动画结束后执行真正的卸载
  const handleAnimationEnd = React.useCallback(
    (e: React.AnimationEvent) => {
      // Radix 关闭动画的 data-state 变为 closed 时触发
      if (
        !open &&
        (e.animationName.includes("exit") ||
          e.animationName.includes("fadeOut") ||
          e.animationName.includes("fade-out"))
      ) {
        onClosed();
      }
    },
    [open, onClosed],
  );

  // 如果没有捕获到动画事件，兜底使用 timer 清理
  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(onClosed, 300);
      return () => clearTimeout(timer);
    }
  }, [open, onClosed]);

  return (
    <Component
      {...componentProps}
      open={open}
      onOpenChange={handleOpenChange}
      onAnimationEnd={handleAnimationEnd}
    />
  );
}

interface OpenOptions {
  /**
   * 指定 Portal 挂载的容器元素。
   * 在浏览器扩展 content script 中，应传入 useContentUI() 返回的 container。
   * 不传则默认挂载到 document.body。
   */
  container?: HTMLElement;
}

/**
 * 将一个 Dialog 类组件（受控模式: open + onOpenChange）包装为命令式调用。
 *
 * @example
 * ```tsx
 * // 1. 创建 opener
 * const confirmOpener = createDialogOpener(ConfirmDialog);
 *
 * // 2. 命令式打开
 * const { destroy, update } = confirmOpener.open({
 *   title: '确认删除？',
 *   onConfirm: () => handleDelete(),
 * });
 *
 * // 3. 可选：更新 / 销毁
 * update({ title: '正在删除...' });
 * destroy();
 * ```
 *
 * @param Component 受控 Dialog 组件，必须支持 `open` 和 `onOpenChange` props
 */
export function createDialogOpener<
  P extends { open?: boolean; onOpenChange?: (open: boolean) => void },
>(Component: React.ComponentType<P>) {
  return {
    open(
      props: Omit<P, "open" | "onOpenChange"> & {
        /** 弹窗关闭时的回调（动画结束后触发） */
        onClose?: () => void;
      },
      options?: OpenOptions,
    ): DialogHandle<Omit<P, "open" | "onOpenChange">> {
      const mountTarget = options?.container ?? document.body;
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-dialog-opener", "");
      mountTarget.appendChild(wrapper);

      let root: Root | null = createRoot(wrapper);
      let currentProps = { ...props };
      let destroyed = false;

      const cleanup = () => {
        if (destroyed) return;
        destroyed = true;
        props.onClose?.();

        // 延迟卸载，确保关闭动画完成
        setTimeout(() => {
          root?.unmount();
          root = null;
          if (wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
          }
        }, 0);
      };

      const render = (renderProps: typeof currentProps) => {
        if (destroyed || !root) return;
        const { onClose: _onClose, ...componentProps } = renderProps;
        root.render(
          <DialogWrapper<P>
            Component={Component}
            componentProps={componentProps as unknown as P}
            onClosed={cleanup}
          />,
        );
      };

      const destroy = () => {
        if (destroyed || !root) return;
        destroyed = true;
        props.onClose?.();
        root.unmount();
        root = null;
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
      };

      const update = (newProps: Partial<Omit<P, "open" | "onOpenChange">>) => {
        currentProps = { ...currentProps, ...newProps };
        render(currentProps);
      };

      // 首次渲染
      render(currentProps);

      return { destroy, update };
    },
  };
}
