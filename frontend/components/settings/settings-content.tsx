"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Copy, Unlink } from "lucide-react"
import { NetworkBadge } from "@/components/invoicefi/network-badge"
import { AcurastPowered } from "@/components/invoicefi/acurast-powered"
import { useState } from "react"

export function SettingsContent() {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText("0x742d35Cc6634C0532925a3b844Bc9e7595f12345")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* WALLET SECTION */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">Wallet</h3>
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm">Connected Wallet</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-secondary rounded-lg font-mono text-sm text-foreground break-all">
                0x742d35Cc6634C0532925a3b844Bc9e7595f12345
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={copyToClipboard}
                className="flex-shrink-0 hover:bg-primary/10"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {copied && <p className="text-xs text-green-600">Copied to clipboard</p>}
          </div>

          <div className="space-y-3">
            <Label className="text-sm">Network</Label>
            <div className="flex items-center gap-3">
              <NetworkBadge network="Westend Hub" />
              <Button variant="outline" size="sm">
                Switch Network
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm">USDC Balance</Label>
            <div className="p-3 bg-primary/5 rounded-lg font-semibold text-lg text-foreground">
              3,200 USDC
            </div>
          </div>
        </div>
      </Card>

      {/* QUICKBOOKS CONNECTION */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">QuickBooks Connection</h3>
        <div className="space-y-4">
          {/* Connected State */}
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-green-900">Connected</p>
                <p className="text-sm text-green-700">Sandbox Company · Realm ID: 1234567890</p>
              </div>
              <div className="text-xs space-y-1 text-green-700">
                <p>Scopes granted: <span className="font-medium">Accounting (read)</span></p>
                <p>Connected: <span className="font-medium">March 3, 2025</span></p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="destructive" size="sm" className="flex gap-2">
                  <Unlink className="w-4 h-4" />
                  Disconnect QuickBooks
                </Button>
                <Button variant="outline" size="sm">
                  Re-authenticate
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ORACLE STATUS */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-semibold text-lg">Oracle Status</h3>
          <AcurastPowered />
        </div>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground mb-1">FX Oracle Last Updated</p>
              <p className="font-medium">2 minutes ago</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Processor Address</p>
              <p className="font-mono text-xs">0x5AC...f45b</p>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-2">Currencies Covered</p>
            <div className="flex flex-wrap gap-2">
              {["USD", "NGN", "PHP", "INR"].map((curr) => (
                <span key={curr} className="px-3 py-1 bg-secondary rounded-full text-xs font-medium">
                  {curr}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">Update Interval: <span className="font-medium text-foreground">Every 5 minutes</span></p>
          </div>
        </div>
      </Card>

      {/* NOTIFICATION PREFERENCES */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">Notification Preferences</h3>
        <div className="space-y-4">
          {[
            { 
              label: "Email alerts for repayment due", 
              description: "Get email when your repayment is due",
              enabled: false,
              comingSoon: true
            },
            { 
              label: "Browser notification when invoice fully funded", 
              description: "Notify when your invoice reaches full funding",
              enabled: true
            },
            { 
              label: "Browser notification when Acurast risk score received", 
              description: "Notify when oracle delivers risk assessment",
              enabled: true
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <div className="flex-1">
                <p className="font-medium flex items-center gap-2">
                  {item.label}
                  {item.comingSoon && <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded">Coming soon</span>}
                </p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Switch defaultChecked={item.enabled} disabled={item.comingSoon} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
