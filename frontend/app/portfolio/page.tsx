import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { PortfolioOverview } from '@/components/invoicefi/portfolio-overview'

export default function PortfolioPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Portfolio"
          description="View your complete financial position across borrowing and lending."
        />

        <div className="mt-4 md:mt-5">
          <PortfolioOverview />
        </div>
      </main>
    </div>
  )
}
