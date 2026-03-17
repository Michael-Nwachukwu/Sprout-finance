import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { BorrowContent } from '@/components/invoicefi/borrow-content'
import { Button } from '@/components/ui/button'

export default function BorrowPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Borrow"
          description="Finance your invoices and improve cash flow."
          actions={
            <Button className="w-full sm:w-auto h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/30 hover:scale-105">
              + Finance Invoice
            </Button>
          }
        />

        <div className="mt-4 md:mt-5">
          <BorrowContent />
        </div>
      </main>
    </div>
  )
}
