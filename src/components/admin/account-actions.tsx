"use client";

import { useState } from "react";
import { Ban, CircleCheck, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { invokeFunction } from "@/lib/functions";

interface AccountActionsProps {
  userId: string | null;
  email: string | null;
  /** 业务档案的启用状态（members.is_active / staff.is_active） */
  active: boolean;
  /** 与登录封禁一起切换业务档案状态 */
  onToggleBusiness: (active: boolean) => Promise<void>;
  onChanged: () => void;
  name: string;
}

/** 账号级操作：重置密码 / 停用（封禁）与启用 / 删除账号 */
export function AccountActions({
  userId,
  email,
  active,
  onToggleBusiness,
  onChanged,
  name,
}: AccountActionsProps) {
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  if (!userId) {
    return <span className="text-xs text-bark-400">未关联登录账号</span>;
  }

  const resetPassword = async () => {
    setBusy(true);
    try {
      const data = await invokeFunction<{ password: string }>("manage-user", {
        action: "reset_password",
        user_id: userId,
      });
      setCredentials({ email: email ?? "", password: data.password });
    } catch (e) {
      toast.error("重置失败", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    try {
      await invokeFunction("manage-user", {
        action: "set_banned",
        user_id: userId,
        banned: active,
      });
      await onToggleBusiness(!active);
      toast.success(active ? "已停用该账号" : "已启用该账号");
      onChanged();
    } catch (e) {
      toast.error("操作失败", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await invokeFunction("manage-user", {
        action: "delete_account",
        user_id: userId,
      });
      toast.success("账号已删除");
      onChanged();
    } catch (e) {
      toast.error("删除失败", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={resetPassword}
          title="生成新密码并展示一次"
        >
          <KeyRound /> 重置密码
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={toggleActive}
        >
          {active ? <Ban /> : <CircleCheck />}
          {active ? "停用" : "启用"}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-rose-700 hover:bg-rose-50"
            >
              <Trash2 /> 删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除 {name} 的账号？</AlertDialogTitle>
              <AlertDialogDescription>
                将永久删除登录账号及其全部业务数据（预约、余额记录等），该操作不可恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteAccount}
                className="bg-rose-700 text-white hover:bg-rose-800"
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {credentials && (
        <CredentialsDialog
          open
          onOpenChange={(open) => !open && setCredentials(null)}
          email={credentials.email}
          password={credentials.password}
        />
      )}
    </>
  );
}
