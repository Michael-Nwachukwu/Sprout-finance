# AI Risk Analysis — Test Documents

## Valid Set (`valid/`)

Consistent documents for a legitimate B2B trade between Ghana and Nigeria:

- **Invoice**: Kwame Agritech Ltd → Dangote Industries Ltd, NGN 24,500,000 for cocoa beans + shea butter
- **Purchase Order**: Dated 2 weeks before invoice, matching quantities and prices
- **Bill of Lading**: Dated 3 days before invoice, Tema Port → Apapa Port, matching cargo

Expected AI result: **Proceed** (high authenticity, documents match, known company)

## Invalid Set (`invalid/`)

Documents with multiple fraud indicators:

1. **Company name inconsistencies**: Seller name varies across docs ("NexaTrade Global Solutions" vs "NexaTrade Solutions" vs "NexaTrade Global Corp"). Buyer varies too.
2. **PO dated AFTER invoice**: PO issued March 15 but invoice dated March 10 — PO should come first
3. **BoL dated AFTER invoice**: BoL issued March 20, shipping March 22 — goods shipped after invoicing
4. **Currency mismatch**: Invoice in USD, PO in NGN
5. **Amount mismatch**: Invoice $8M, PO ₦15M — different amounts AND currencies
6. **Line items don't match**: Invoice has "Consulting/Admin/Processing", PO has "Equipment/Maintenance"
7. **Round numbers**: All amounts perfectly round ($5M, $2M, $1M)
8. **Same port origin/destination**: BoL ships from Apapa to Apapa (same port)
9. **Vague cargo**: BoL says "assorted goods and materials" — no specifics
10. **Unusually short payment terms**: 22 days (typical B2B is 30-90)
11. **Generic email**: Buyer uses gmail.com, not a corporate domain
12. **Company registered in 2025**: Very new company with $8M invoice

Expected AI result: **Reject** (low authenticity, documents don't match, multiple fraud flags)
