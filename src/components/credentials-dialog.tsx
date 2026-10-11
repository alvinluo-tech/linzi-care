"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  password: string;
}

/** 账号凭证一次性展示弹窗（创建账号 / 重置密码后） */
export function CredentialsDialog({
  open,
  onOpenChange,
  email,
  password,
}: CredentialsDialogProps) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    await navigator.clipboard.writeText(
      `账号：${email}\n密码：${password}`
    );
    setCopied(true);
    toast.success("已复制账号与密码");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>账号凭证（仅展示一次）</DialogTitle>
          <DialogDescription>
            系统已生成登录凭证，请立即复制保存并线下告知对方。关闭后无法再次查看密码。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>登录邮箱</Label>
            <Input readOnly value={email} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>初始密码</Label>
            <Input readOnly value={password} className="font-mono" />
          </div>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            建议对方首次登录后自行妥善保管；如遗忘可随时在此重置密码。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copyAll}>
            {copied ? <Check /> : <Copy />} 复制凭证
          </Button>
          <Button onClick={() => onOpenChange(false)}>我已保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
