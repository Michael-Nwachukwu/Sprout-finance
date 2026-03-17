import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { MintWizard } from '@/components/invoicefi/mint-wizard'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function MintPage() {
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
          title="Finance an Invoice"
          description="Follow the steps to connect QuickBooks and finance your invoices."
        />

        <div className="mt-4 md:mt-5 max-w-2xl mx-auto">
          <MintWizard />
        </div>
      </main>
    </div>
  )
}
