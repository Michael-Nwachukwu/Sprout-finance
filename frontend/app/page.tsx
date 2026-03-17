import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { HealthFactorRadar } from "@/components/dashboard/health-factor-radar"
import { FinancingBarChart } from "@/components/dashboard/financing-bar-chart"
import { RecentFinancings } from "@/components/dashboard/recent-financings"
import { BorrowContent } from "@/components/invoicefi/borrow-content"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Welcome to Sprout Finance"
          description="Unlock liquidity from your invoices or earn yield by funding real-world receivables."
          actions={
            <>
              <Link href="/borrow/mint" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/30 hover:scale-105">
                  + Finance Invoice
                </Button>
              </Link>
              <Link href="/lend" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto h-9 text-sm transition-all duration-300 hover:shadow-md hover:scale-105 bg-transparent"
                >
                  Browse Opportunities
                </Button>
              </Link>
            </>
          }
        />

        <div className="mt-4 md:mt-5 space-y-3 md:space-y-4">
          <StatsCards />
          <BorrowContent isHomepage={true} />
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-4">
            <div className="space-y-3 xl:col-span-2">
              <HealthFactorRadar />
              <FinancingBarChart />
            </div>
            <RecentFinancings />
          </div>
        </div>
      </main>
    </div>
  )
}
