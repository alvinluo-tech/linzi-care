"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BellRing, Share, Smartphone, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { isIOS, isStandalone, urlBase64ToUint8Array } from "@/lib/pwa";

interface PushNotificationButtonProps {
  userId?: string | null;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function PushNotificationButton({
  userId,
  className,
  variant = "outline",
  size = "default",
}: PushNotificationButtonProps) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [iosModalOpen, setIosModalOpen] = useState(false);

  // 检查浏览器环境与当前权限
  const checkState = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    setPermission(Notification.permission);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  const handleSubscribe = async () => {
    if (!supported) {
      toast.error("当前浏览器暂不支持 Web 推送通知");
      return;
    }

    // iOS 16.4+ 强限制检测：必须先添加到主屏幕并以 Standalone 模式打开，才能唤起通知授权
    if (isIOS() && !isStandalone()) {
      setIosModalOpen(true);
      return;
    }

    setLoading(true);

    try {
      // 1. 请求通知权限
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setLoading(false);
        if (perm === "denied") {
          toast.error("您已拒绝通知权限", {
            description: "请在系统或浏览器设置中允许「林梓精养馆」发送通知。",
          });
        }
        return;
      }

      // 2. 确保 Service Worker 就绪并订阅 PushManager
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY 未配置");
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      // 3. 解析端点并存入 Supabase push_subscriptions 表
      const subJson = sub.toJSON();
      const endpoint = sub.endpoint;
      const p256dh = subJson.keys?.p256dh;
      const auth = subJson.keys?.auth;

      if (!endpoint || !p256dh || !auth) {
        throw new Error("获取浏览器推送密钥失败");
      }

      const supabase = createClient();
      let targetUserId = userId;

      if (!targetUserId) {
        const { data: userRes } = await supabase.auth.getUser();
        targetUserId = userRes?.user?.id;
      }

      if (!targetUserId) {
        toast.info("已开启浏览器推送！建议登录会员账号，以便精准绑定您的个人预约。");
        setSubscribed(true);
        setLoading(false);
        return;
      }

      const { error: dbErr } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: targetUserId,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

      if (dbErr) {
        console.error("Save push subscription error:", dbErr);
        throw new Error(dbErr.message);
      }

      setSubscribed(true);
      toast.success("已成功开启手机预约通知！", {
        description: "预约开始前 2 小时您将收到系统弹窗提醒。",
      });
    } catch (err) {
      console.error("Subscribe push notification failed:", err);
      toast.error("开启通知失败", {
        description: err instanceof Error ? err.message : "请稍后再试",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const supabase = createClient();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setSubscribed(false);
      toast.success("已关闭预约通知");
    } catch (e) {
      toast.error("取消订阅失败", {
        description: e instanceof Error ? e.message : "请稍后再试",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {subscribed ? (
        <Button
          variant="outline"
          size={size}
          className={`border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 ${className || ""}`}
          onClick={handleUnsubscribe}
          disabled={loading}
          title="点击可关闭推送提醒"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4 text-emerald-600" />}
          已开启预约提醒
        </Button>
      ) : (
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : permission === "denied" ? (
            <BellOff className="size-4 text-rose-500" />
          ) : (
            <Bell className="size-4 text-bronze-600" />
          )}
          {permission === "denied" ? "通知已被禁用 (点此重试)" : "开启预约提醒"}
        </Button>
      )}

      {/* iOS 16.4+ 引导弹窗 */}
      <Dialog open={iosModalOpen} onOpenChange={setIosModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif text-lg">
              <Smartphone className="size-5 text-bronze-600" />
              苹果设备开启通知指引
            </DialogTitle>
            <DialogDescription>
              iOS 系统要求必须将网站添加到手机主屏幕，才能接收系统弹窗提醒：
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 rounded-lg bg-secondary/60 p-4 text-sm text-bark-700">
            <div className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bronze-500 text-xs text-white">
                1
              </span>
              <p className="leading-relaxed">
                点击 Safari 浏览器底部的「<strong>分享</strong>」按钮（带箭头的方框图标 <Share className="inline size-4 text-bronze-600" />）。
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bronze-500 text-xs text-white">
                2
              </span>
              <p className="leading-relaxed">
                在弹出的菜单中向下轻扫，找到并点击「<strong>添加到主屏幕</strong>」。
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bronze-500 text-xs text-white">
                3
              </span>
              <p className="leading-relaxed">
                回到手机桌面，点击刚刚添加的「<strong>梓养云</strong>」图标打开，再点击「开启预约提醒」即可允许系统通知。
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-bronze-500 text-white hover:bg-bronze-600"
              onClick={() => setIosModalOpen(false)}
            >
              <Check className="size-4" /> 我已了解
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
