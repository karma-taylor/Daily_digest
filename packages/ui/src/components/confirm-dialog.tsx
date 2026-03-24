"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { cn } from "../lib/utils";
import { createDialogOpener } from "../lib/dialog-opener";

/**
 * ConfirmDialog 的 Props
 * 所有文本通过 props 传入，不依赖 React Context（如 i18n）
 */
export interface ConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 弹窗标题 */
  title: string;
  /** 弹窗描述文案 */
  description: string;
  /** 确认按钮文案 */
  confirmText?: string;
  /** 取消按钮文案 */
  cancelText?: string;
  /** 确认回调 */
  onConfirm?: () => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 确认按钮风格 */
  variant?: "default" | "destructive";
}

/**
 * 通用确认弹窗组件（基于 AlertDialog）
 * 适合与 createDialogOpener / confirm() 搭配使用
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              variant === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// 预构建的 ConfirmDialog opener
const confirmDialogOpener = createDialogOpener(ConfirmDialog);

export interface ConfirmOptions {
  /** 弹窗标题 */
  title: string;
  /** 弹窗描述文案 */
  description: string;
  /** 确认按钮文案 */
  confirmText?: string;
  /** 取消按钮文案 */
  cancelText?: string;
  /** 确认按钮风格 */
  variant?: "default" | "destructive";
  /** Portal 挂载容器（浏览器扩展 content script 场景） */
  container?: HTMLElement;
}

/**
 * 命令式确认弹窗
 * 返回 Promise<boolean>：用户点击确认返回 true，取消/关闭返回 false
 *
 * @example
 * ```tsx
 * const confirmed = await confirm({
 *   title: '确认删除？',
 *   description: '此操作不可撤销。',
 *   confirmText: '删除',
 *   cancelText: '取消',
 *   variant: 'destructive',
 * });
 * if (confirmed) {
 *   await deleteItem(id);
 * }
 * ```
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const safeResolve = (value: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    confirmDialogOpener.open(
      {
        title: options.title,
        description: options.description,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        variant: options.variant,
        onConfirm: () => safeResolve(true),
        onCancel: () => safeResolve(false),
        onClose: () => safeResolve(false),
      },
      { container: options.container },
    );
  });
}
