"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** 交错浮现延迟（毫秒） */
  delay?: number;
}

/**
 * 滚动渐入：元素进入视口时柔和浮现。克制、无弹跳，尊重系统减弱动效设置。
 * 三重保障：挂载时视口直查（首屏内容不闪隐）+ IntersectionObserver + scroll 事件兜底，
 * 任何一条命中即显示，避免内容因观察时序问题被永久隐藏。
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setVisible(true);
      io.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) finish();
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
    );

    const check = () => {
      if (done) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 48 && rect.bottom > 0) finish();
    };

    // 挂载时已在视口内的内容立即显示，不等待渲染帧
    check();
    io.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });

    return () => {
      done = true;
      io.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform",
        visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
