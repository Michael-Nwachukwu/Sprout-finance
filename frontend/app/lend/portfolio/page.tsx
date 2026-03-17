import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { LenderPortfolio } from '@/components/invoicefi/lender-portfolio'

export default function LenderPortfolioPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Portfolio"
          description="Track your investments and earnings across all invoices."
        />

        <div className="mt-4 md:mt-5">
          <LenderPortfolio />
        </div>
      </main>
    </div>
  )
}
