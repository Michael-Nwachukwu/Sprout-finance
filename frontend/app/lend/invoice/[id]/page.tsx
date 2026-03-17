import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { InvoiceFund } from '@/components/invoicefi/invoice-fund'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface InvoiceFundPageProps {
  params: Promise<{ id: string }>
}

export default async function InvoiceFundPage({ params }: InvoiceFundPageProps) {
  const { id } = await params
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <div className="mb-4">
          <Link href="/lend">
            <Button variant="ghost" size="sm" className="h-8">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
        </div>

        <Header
          title="Fund Invoice"
          description="Review invoice details and choose your investment amount."
        />

        <div className="mt-4 md:mt-5">
          <InvoiceFund invoiceId={id} />
        </div>
      </main>
    </div>
  )
}
