import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { LoanDetail } from '@/components/invoicefi/loan-detail'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface LoanDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function LoanDetailPage({ params }: LoanDetailPageProps) {
  const { id } = await params
  const loanId = id || ''

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <div className="mb-4">
          <Link href="/borrow">
            <Button variant="ghost" size="sm" className="h-8">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
        </div>

        <Header
          title={loanId ? `Loan ${loanId}` : 'Loan Details'}
          description="View detailed information about your loan and repayment schedule."
        />

        <div className="mt-4 md:mt-5">
          <LoanDetail loanId={loanId} />
        </div>
      </main>
    </div>
  )
}
