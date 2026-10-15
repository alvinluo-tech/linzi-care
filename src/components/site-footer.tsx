"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin, Phone } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import { STORE_NAME, STORE_TAGLINE, STORE_VISION } from "@/lib/constants";

interface StoreInfo {
  name: string;
  address: string | null;
  phone: string | null;
}

export function SiteFooter() {
  const [store, setStore] = useState<StoreInfo | null>(null);

  useEffect(() => {
    createClient()
      .from("stores")
      .select("name, address, phone")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setStore(data as StoreInfo);
      });
  }, []);

  return (
    <footer className="mt-auto bg-bark-900 text-bark-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-3 md:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-9 text-bronze-300" />
            <div>
              <p className="font-serif text-lg tracking-widest">
                {store?.name ?? STORE_NAME}
              </p>
              <p className="text-[10px] tracking-[0.3em] text-bark-200">
                LINZI WELLNESS
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-bark-200">
            {STORE_TAGLINE}。以传统技法与现代理疗相融，为您营造一方静谧的养身之所。
          </p>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-bronze-300">
            愿景 · {STORE_VISION}
          </p>
        </div>

        <div className="space-y-3 text-sm text-bark-200">
          <p className="font-serif text-base text-bronze-200">到店信息</p>
          {store?.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-bronze-300" />
              {store.address}
            </p>
          )}
          {store?.phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-bronze-300" />
              {store.phone}
            </p>
          )}
          {!store && (
            <p className="text-bark-200">门店信息加载中…</p>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-serif text-base text-bronze-200">快捷导航</p>
          <div className="flex flex-col gap-2 text-bark-200">
            <Link href="/services" className="hover:text-bronze-200">服务项目</Link>
            <Link href="/book" className="hover:text-bronze-200">预约体验</Link>
            <Link href="/shop" className="hover:text-bronze-200">颐养商城</Link>
            <Link href="/my" className="hover:text-bronze-200">个人中心</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-bark-800">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-bark-200 md:px-6">
          © 2026 {store?.name ?? STORE_NAME} · 头疗美容养生
        </p>
      </div>
    </footer>
  );
}
