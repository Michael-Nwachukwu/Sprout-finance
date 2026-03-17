"use client"

import { Settings, TrendingUp, TrendingDown, Briefcase, LayoutDashboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { WalletButton } from "@/components/invoicefi/wallet-button"
const invoicefiItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: TrendingDown, label: "Borrow", href: "/borrow" },
  { icon: TrendingUp, label: "Lend", href: "/lend" },
  { icon: Briefcase, label: "Portfolio", href: "/portfolio" },
]

const generalItems = [
  { icon: Settings, label: "Settings", href: "/settings" },
]

export function Sidebar() {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 w-64 bg-card border-r border-border p-4 h-screen overflow-y-auto lg:block">
      <div className="flex items-center gap-2 mb-6 group cursor-pointer">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/sprout-logo.svg" alt="Sprout Finance" className="w-3/4 h-full" width={32} height={32} />
        </Link>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Platform</p>
          <nav className="space-y-0.5">
            {invoicefiItems.map((item) => {
              let isActive = false
              if (item.href === "/") {
                isActive = pathname === "/"
              } else if (item.href === "/portfolio") {
                isActive = pathname === "/portfolio"
              } else {
                isActive = pathname.startsWith(item.href)
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onMouseEnter={() => setHoveredItem(item.label)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    hoveredItem === item.label && !isActive && "translate-x-1",
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">General</p>
          <nav className="space-y-0.5">
            {generalItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onMouseEnter={() => setHoveredItem(item.label)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    hoveredItem === item.label && !isActive && "translate-x-1",
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4">
        <WalletButton />
      </div>
    </aside>
  )
}
