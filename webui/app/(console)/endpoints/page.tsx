/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
import { WEBUI } from "@/lib/i18n";

// Preserve bookmarked URLs for the old page in the static export.
export default function LegacyEndpointsPage() {
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    router.replace("/instances");
  }, [router]);
  return (
    <Link className="p-4 text-sm" href="/instances">
      {t(WEBUI.endpoints.overview)}
    </Link>
  );
}
