# Sprout Finance

**Decentralized Invoice Financing on Polkadot Hub EVM**

Sprout Finance is an on-chain invoice financing protocol that enables SMEs in emerging markets to tokenize verified B2B invoices as ERC-721 NFTs and borrow USDC against them at dynamically priced discount rates. Multiple lenders can fractionally fund each invoice and earn pro-rata yield — creating a transparent, permissionless receivables marketplace.

---

## The Problem

Small and medium enterprises (SMEs) in emerging markets face a persistent cash flow crisis. They deliver goods and services to large buyers on 30–90 day payment terms, but need cash now to pay suppliers, employees, and operating costs. Traditional invoice financing (factoring) is:

- **Inaccessible** — Banks require extensive credit history, collateral, and paperwork that most SMEs cannot provide
- **Expensive** — Discount rates of 3–5% per month (36–60% APR) are common in markets like Nigeria, Kenya, and the Philippines
- **Opaque** — Pricing is negotiated behind closed doors with no market-driven rate discovery
- **Slow** — Approvals take days to weeks, defeating the purpose of bridging short-term cash flow gaps
- **Centralized** — A single intermediary (the factor) bears all the risk and captures all the margin

Meanwhile, global DeFi yield is compressed to near zero. Stablecoin holders have limited options to earn real yield backed by productive economic activity.

## The Solution

Sprout Finance connects invoice holders directly with on-chain lenders through a transparent, automated protocol:

1. **SME connects QuickBooks** — OAuth integration pulls verified, unpaid invoices directly from accounting software
2. **Invoice is tokenized** — An ERC-721 NFT is minted with the invoice data, IPFS-pinned documents, and a risk score computed by a TEE oracle
3. **Legal assignment is signed** — The borrower signs a digital legal assignment using World ID zero-knowledge proofs, providing Sybil-resistant KYC without traditional identity documents
4. **Lenders fund fractionally** — Multiple lenders can fund portions of each invoice in USDC, earning yield proportional to their share
5. **Borrower repays at maturity** — When the invoice is paid, the borrower repays principal + interest. Lenders receive pro-rata distributions automatically
6. **Defaults are handled on-chain** — After a grace period, anyone can trigger default. An insurance pool funded by protocol fees covers lender shortfall

The result: SMEs get same-day financing at market-driven rates. Lenders earn real yield backed by verifiable commercial receivables. Everything is transparent and auditable on-chain.

---

## How It Works

### For Borrowers

```
Connect Wallet → Link QuickBooks → Select Invoice → Set Financing Amount
    → Upload Supporting Docs (PO, BoL) → Sign Legal Assignment (World ID)
    → AI Risk Review → Submit On-Chain → Await Risk Scoring → Deposit as Collateral
    → Receive USDC When Fully Funded → Repay at Maturity
```

1. **Connect** a MetaMask wallet to Polkadot Hub Testnet
2. **Authenticate** with QuickBooks via OAuth to access real invoice data
3. **Select** an unpaid invoice from the QuickBooks feed
4. **Set** the desired financing amount (capped at the maximum LTV based on risk)
5. **Upload** supporting documents (purchase orders, bills of lading) to IPFS
6. **Sign** a legal assignment template with World ID — proves unique humanhood via ZK proof
7. **AI review** analyzes the invoice, documents, and terms for red flags
8. **Submit** the mint request on-chain — the Acurast TEE oracle computes risk tier, discount rate, and max LTV
9. **Deposit** the minted NFT as collateral into the Lending Pool
10. **Receive** USDC once lenders fully fund the invoice

### For Lenders

```
Browse Marketplace → Evaluate Invoice → Fund with USDC → Earn Yield → Collect Repayment
```

1. **Browse** tokenized invoices on the lending marketplace with risk tiers, discount rates, and document links
2. **Review** invoice details: debtor info, face value, currency, maturity, IPFS documents, AI analysis
3. **Fund** any amount up to the remaining capacity in USDC
4. **Track** positions in the portfolio dashboard with real-time health factors
5. **Collect** principal + interest when the borrower repays

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ QuickBooks│  │  Mint    │  │  Lender  │  │  Portfolio    │  │
│  │   OAuth   │  │  Wizard  │  │Marketplace│ │  Dashboard    │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│        │              │             │                │          │
│  ┌─────┴──────────────┴─────────────┴────────────────┴───────┐  │
│  │              wagmi v2 + viem (Contract Hooks)              │  │
│  └────────────────────────────┬───────────────────────────────┘  │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   Polkadot Hub EVM    │
                    │   (pallet_revive)     │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │   InvoiceNFT    │  │  ERC-721 invoice tokens
                    │  ├─────────────────┤  │
                    │  │   LendingPool   │  │  Fractional funding + repayment
                    │  ├─────────────────┤  │
                    │  │   FXOracle      │  │  Live FX rates (Acurast-fed)
                    │  ├─────────────────┤  │
                    │  │ InsurancePool   │  │  Protocol fee reserves
                    │  ├─────────────────┤  │
                    │  │CreditScoreReg.  │  │  On-chain repayment history
                    │  ├─────────────────┤  │
                    │  │   MockUSDC      │  │  Test stablecoin
                    │  └─────────────────┘  │
                    └───────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
     ┌────────┴────────┐ ┌─────┴──────┐  ┌───────┴───────┐
     │  Acurast TEE    │ │   IPFS     │  │   World ID    │
     │                 │ │(web3.storage)│ │  (IDKit v4)   │
     │ ┌─────────────┐ │ │            │  │               │
     │ │  FX Oracle  │ │ │ Snapshots  │  │ ZK Proofs     │
     │ │ (scheduled) │ │ │ Documents  │  │ Sybil Guard   │
     │ ├─────────────┤ │ │ Legal Docs │  │ Digital Sign  │
     │ │Risk Engine  │ │ │            │  │               │
     │ │ (on-demand) │ │ └────────────┘  └───────────────┘
     │ └─────────────┘ │
     └─────────────────┘
```

### Smart Contracts (Solidity 0.8.20, Foundry)

| Contract | Purpose |
|----------|---------|
| **InvoiceNFT** | ERC-721 that tokenizes QuickBooks invoices. Handles mint requests, Acurast risk fulfillment with secp256k1 signature verification, and NFT lifecycle (collateralization, repayment, burning). |
| **LendingPool** | Core lending engine. Manages collateral deposits, fractional lender funding, USDC disbursement, borrower repayment with interest distribution, protocol fee collection, and default triggering. |
| **FXOracle** | Stores live USD exchange rates for 8 emerging market currencies (NGN, PHP, KES, BRL, GHS, INR, EGP, EUR). Updated every 5 minutes by the Acurast FX oracle. Reverts on stale data (>15 min). |
| **InsurancePool** | Accumulates protocol fees (2% of interest). Covers lender shortfall on defaults up to available reserves. |
| **CreditScoreRegistry** | Tracks borrower repayment history on-chain. Score formula: `(onTimeRepayments * 100) / totalLoans`. Feeds into risk pricing for repeat borrowers. |
| **MockUSDC** | ERC-20 test stablecoin with public `mint()` for testnet use. |

### Acurast TEE Services

Two JavaScript bundles run inside Acurast's Trusted Execution Environment (TEE) on the Acurast Canary network:

**FX Oracle** (Scheduled, every 5 minutes)
- Fetches live USD exchange rates from ExchangeRate-API v6
- Submits rates for 8 currencies to `FXOracle.updateRates()` on Polkadot Hub
- Ensures the protocol always has fresh FX data for currency conversion

**Risk Engine** (On-demand, per invoice)
- Verifies the QuickBooks invoice via API
- Fetches current FX rate for the invoice currency
- Computes risk tier (1–5), discount rate (50–1500 bps), and max LTV (70–85%)
- Signs the result with secp256k1 inside the TEE
- Calls `InvoiceNFT.fulfillRisk()` to mint the NFT with verified risk parameters

**Risk Scoring Algorithm:**
```
baseBps      = 50 + min(daysToMaturity * 40 / 365, 400)
debtorAdj    = min((100 - debtorScore) * 3, 300)
fxAdj        = currencyVolatility / 4
histDiscount = min(borrowerScore * 2, 200)
docBonus     = hasExtraDocs ? 50 : 0

discountBps  = clamp(baseBps + debtorAdj + fxAdj - histDiscount - docBonus, 50, 1500)
```

| Discount Rate | Risk Tier | Max LTV |
|---------------|-----------|---------|
| < 200 bps     | 1 (Low)   | 85%     |
| 200–399 bps   | 2         | 80%     |
| 400–699 bps   | 3 (Medium)| 75%     |
| 700–999 bps   | 4         | 70%     |
| 1000+ bps     | 5 (High)  | 70%     |

### IPFS Document Storage (web3.storage)

All invoice-related documents are uploaded as an IPFS directory via web3.storage's w3up protocol:

- **snapshot.json** — Full QuickBooks invoice data snapshot (line items, amounts, dates, customer info)
- **Supporting documents** — Purchase orders, bills of lading, customs declarations (user-uploaded)
- **legal-assignment.json** — Digitally signed legal assignment with World ID ZK proof

A single CID stored on-chain gives access to the entire document bundle. The frontend caches documents locally and falls back to IPFS gateways (`w3s.link`) on cache miss.

### World ID Integration

Instead of traditional KYC or PDF signatures, Sprout uses World ID for legal assignment signing:

- **Sybil resistance** — Each borrower must prove unique humanhood via zero-knowledge proof
- **Non-repudiable signature** — The World ID nullifier cryptographically binds the signer to the document
- **Privacy-preserving** — No personal data is revealed; only the ZK proof is stored
- **On-chain verification** — `legalAssignmentHash = keccak256(template + proof)` is stored in the NFT

The legal assignment template is auto-generated from invoice data. The borrower reviews the document, clicks "Sign with World ID", completes the verification flow, and the proof is attached to the document before IPFS upload.

### AI Risk Analysis

Before minting, an AI model (Google Gemini) analyzes each invoice for red flags:

- Validates invoice data consistency (amounts, dates, line items)
- Checks financing terms against market norms
- Reviews supporting document presence
- Provides a PASS/FLAG/REJECT verdict with detailed reasoning
- Results are cached and displayed to lenders alongside the invoice listing

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Polkadot Hub Testnet (chain ID 420420417, pallet_revive EVM) |
| **Smart Contracts** | Solidity 0.8.20, Foundry, OpenZeppelin 5.x |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS 4, shadcn/ui, Radix UI primitives |
| **Wallet** | wagmi v2, viem (no ethers.js) |
| **Oracle** | Acurast TEE (Trusted Execution Environment) |
| **Storage** | IPFS via web3.storage (w3up-client v17) |
| **Identity** | World ID (IDKit v4, zero-knowledge proofs) |
| **Accounting** | QuickBooks Online API (OAuth 2.0, sandbox) |
| **AI** | Google Gemini (invoice risk analysis) |
| **FX Rates** | ExchangeRate-API v6 |

---

## Project Structure

```
sprout-finance/
├── contracts/                      # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── FXOracle.sol            # Exchange rate oracle
│   │   ├── InvoiceNFT.sol          # ERC-721 invoice tokenization
│   │   ├── LendingPool.sol         # Fractional lending engine
│   │   ├── InsurancePool.sol       # Protocol fee reserves
│   │   ├── CreditScoreRegistry.sol # On-chain credit scoring
│   │   └── MockUSDC.sol            # Test stablecoin
│   ├── test/                       # Foundry test suite (41+ tests)
│   ├── script/Deploy.s.sol         # Deployment script
│   └── foundry.toml
│
├── acurast/                        # TEE oracle services
│   ├── fx-oracle/                  # Scheduled FX rate updates
│   │   ├── src/index.ts
│   │   ├── acurast.json
│   │   └── webpack.config.js
│   └── risk-engine/                # On-demand risk scoring
│       ├── src/index.ts
│       ├── acurast.json
│       └── webpack.config.js
│
├── frontend/                       # Next.js application
│   ├── app/
│   │   ├── page.tsx                # Landing page
│   │   ├── borrow/                 # Borrower dashboard + invoice detail
│   │   ├── lend/                   # Lender marketplace + position detail
│   │   ├── portfolio/              # Combined portfolio view
│   │   └── api/
│   │       ├── qb/                 # QuickBooks OAuth + invoice API
│   │       ├── ipfs/               # IPFS upload + retrieval
│   │       ├── ai/                 # AI risk analysis
│   │       ├── risk-engine/        # Risk engine trigger
│   │       └── world-id/           # World ID verification
│   ├── components/
│   │   ├── invoicefi/              # Core business components
│   │   │   ├── mint-wizard.tsx     # 6-step invoice tokenization wizard
│   │   │   ├── invoice-fund.tsx    # Lender funding interface
│   │   │   ├── invoice-documents.tsx # IPFS document viewer
│   │   │   └── world-id-signer.tsx # World ID signing component
│   │   ├── wallet/                 # Wallet connection
│   │   └── ui/                     # shadcn/ui base components
│   ├── lib/
│   │   ├── contracts/              # ABIs + chain config
│   │   ├── hooks/                  # wagmi contract hooks
│   │   ├── ipfs/                   # w3up client + cache
│   │   ├── legal/                  # Legal assignment template
│   │   ├── quickbooks/             # QB API client
│   │   └── invoicefi/              # Types + utilities
│   └── providers.tsx               # App providers (wagmi, TanStack Query)
│
├── deployments/
│   └── polkadot-testnet.json       # Deployed contract addresses
│
├── CLAUDE.md                       # Project specification document
└── README.md                       # This file
```

---

## Deployed Contracts (Polkadot Hub Testnet)

| Contract | Address |
|----------|---------|
| FXOracle | `0x07d28bf3Afc1d233B1A34074a17f7eF903813B1c` |
| InvoiceNFT | `0xc3cEfDdb8dA6074bAf80ABD77FDB75e08532a08A` |
| LendingPool | `0x2fFBa4e5E4820433A085e19FaCE89Bd41894DF55` |
| InsurancePool | `0xFDeA065535FbC292029621C6935Ef5aD740D24b8` |
| CreditScoreRegistry | `0xb8aEC53444365D3B4d6626F5F355e4aBFAAf6a83` |
| MockUSDC | `0x2C0457F82B57148e8363b4589bb3294b23AE7625` |

**Network:** Polkadot Hub Testnet
**Chain ID:** 420420417
**RPC:** `https://eth-rpc-testnet.polkadot.io/`
**Currency:** PAS

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- [MetaMask](https://metamask.io/) browser extension
- PAS tokens from the [Polkadot testnet faucet](https://faucet.polkadot.io/)

### Smart Contracts

```bash
cd contracts

# Install dependencies
forge install

# Run tests
forge test

# Deploy to Polkadot Hub Testnet
USDC_ADDRESS=0x2C0457F82B57148e8363b4589bb3294b23AE7625 \
forge script script/Deploy.s.sol --rpc-url polkadot_testnet --broadcast
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file and fill in values
cp .env.example .env.local

# Run development server
npm run dev

# Build for production
npm run build
```

### Environment Variables

**Frontend (`frontend/.env.local`):**

```env
# Contract addresses (from deployments/polkadot-testnet.json)
NEXT_PUBLIC_CHAIN_ID=420420417
NEXT_PUBLIC_FX_ORACLE_ADDRESS=0x07d28bf3Afc1d233B1A34074a17f7eF903813B1c
NEXT_PUBLIC_INVOICE_NFT_ADDRESS=0xc3cEfDdb8dA6074bAf80ABD77FDB75e08532a08A
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x2fFBa4e5E4820433A085e19FaCE89Bd41894DF55
NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x2C0457F82B57148e8363b4589bb3294b23AE7625

# QuickBooks OAuth
QB_CLIENT_ID=your_client_id
QB_CLIENT_SECRET=your_client_secret
QB_REDIRECT_URI=http://localhost:3000/api/qb/callback

# IPFS (web3.storage)
WEB3_STORAGE_KEY=your_ed25519_key
WEB3_STORAGE_PROOF=your_delegation_proof

# World ID
WORLD_ID_APP_ID=app_your_app_id
WORLD_ID_ACTION=your_action_name

# AI Analysis
GEMINI_API_KEY=your_gemini_key
```

**Contracts (`contracts/.env`):**

```env
PRIVATE_KEY=your_deployer_private_key
POLKADOT_TESTNET_RPC=https://eth-rpc-testnet.polkadot.io/
```

---

## Key User Flows

### Invoice Tokenization (Mint Wizard)

The mint wizard is a 6-step process implemented in [mint-wizard.tsx](frontend/components/invoicefi/mint-wizard.tsx):

| Step | Action | On-Chain / Off-Chain |
|------|--------|---------------------|
| 1. Connect | Wallet connection + QuickBooks OAuth | Off-chain |
| 2. Select Invoice | Browse and choose an unpaid QB invoice | Off-chain |
| 3. Set Amount | Choose desired financing amount (capped by risk-based max LTV) | Off-chain |
| 4. Documents | Upload supporting docs to IPFS + sign legal assignment with World ID | IPFS + World ID |
| 5. AI Review | Gemini analyzes invoice data, terms, and documents | Off-chain |
| 6. Submit | `requestMint()` on-chain → Acurast risk scoring → `fulfillRisk()` → NFT minted → `depositCollateral()` | On-chain |

### Fractional Lending

Lenders browse the marketplace, review invoice details and documents, then call `fundInvoice(tokenId, amount)` with any USDC amount up to the remaining capacity. Once fully funded, the USDC is automatically released to the borrower.

### Repayment & Default

- **Repayment:** Borrower calls `repay(tokenId)`. Principal + accrued interest is distributed pro-rata to all lenders. Protocol fee (2% of interest) goes to the Insurance Pool. NFT is burned.
- **Default:** After `dueDate + 7 days`, anyone can call `triggerDefault(tokenId)`. The Insurance Pool covers lender shortfall up to available reserves. Borrower's credit score is penalized.

---

## Interest & Pricing

Interest is calculated as simple interest based on the Acurast-determined discount rate:

```
Interest = Principal × DiscountRateBps × ElapsedDays / (365 × 10000)
```

The discount rate (50–1500 basis points annualized) is determined by the Acurast risk engine based on:

- **Days to maturity** — Longer duration = higher rate
- **Debtor credit score** — Lower score = higher rate
- **Borrower history** — More on-time repayments = lower rate
- **Currency volatility** — Higher FX volatility = higher rate (NGN, GHS, EGP are highest)
- **Supporting documents** — Having 2+ docs = 50 bps discount

---

## Security Considerations

- **TEE-verified risk scores** — Risk parameters are computed inside Acurast's Trusted Execution Environment and signed with secp256k1. The on-chain contract verifies the signature before minting.
- **Invoice deduplication** — Both `invoiceHash` and `qbInvoiceId` are checked to prevent double-tokenization of the same receivable.
- **Reentrancy protection** — All state-changing LendingPool functions use OpenZeppelin's `ReentrancyGuard`.
- **World ID Sybil resistance** — Borrowers must prove unique humanhood via zero-knowledge proof to sign legal assignments.
- **Stale oracle protection** — `FXOracle.getRate()` reverts if data is older than 15 minutes.
- **No stored secrets** — QuickBooks access tokens are stored in httpOnly cookies only. Private keys for Acurast are encrypted in TEE environment variables.

---

## Testing

### Smart Contract Tests

```bash
cd contracts
forge test -vvv
```

The test suite includes 41+ tests covering:
- FXOracle rate updates, staleness, and access control
- InvoiceNFT minting lifecycle, deduplication, signature verification
- LendingPool collateral, funding, repayment, default, interest calculation
- Requested amount vs max LTV capping logic
- Insurance pool coverage and fee distribution

### Frontend

```bash
cd frontend
npm run build    # Type checking + build verification
npm run lint     # ESLint
```

---

## Hackathon Context

Sprout Finance was built for the **Polkadot Hackathon — Track 1: EVM** (pallet_revive REVM on Polkadot Hub).

**Why Polkadot Hub?**
- EVM compatibility via `pallet_revive` enables Solidity smart contracts on Polkadot
- Access to Polkadot's shared security and cross-chain messaging (XCM)
- Low transaction costs suitable for high-frequency invoice operations
- Growing DeFi ecosystem with stablecoin infrastructure

**Why Acurast?**
- Trusted Execution Environment guarantees that risk scores and FX rates cannot be tampered with
- Serverless compute eliminates the need for centralized backend infrastructure
- Native Polkadot integration via XCM for cross-chain contract calls

---

## License

MIT

---

## Contributing

This project was built as a hackathon prototype. Contributions, issues, and feedback are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
