// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title InvoiceNFT
/// @notice ERC-721 contract for tokenizing QuickBooks invoices. Handles tokenization request,
///         Acurast risk fulfillment, and NFT lifecycle.
contract InvoiceNFT is ERC721, Ownable {
    using ECDSA for bytes32;

    struct InvoiceData {
        uint256 tokenId;
        address borrower;
        bytes32 invoiceHash; // keccak256(full QB invoice JSON)
        uint256 faceValueUSD; // 18 decimals
        uint256 faceValueOriginal; // 8 decimals
        bytes3 originalCurrency; // ISO 4217
        uint256 dueDate; // Unix timestamp
        uint256 issuedDate; // Unix timestamp
        bytes32 debtorHash; // keccak256(debtor name + QB CustomerId)
        string qbInvoiceId;
        string qbRealmId;
        uint16 discountRateBps; // 50-1500, set by Acurast
        uint8 riskTier; // 1-5, set by Acurast
        uint16 maxLtvBps; // e.g. 8500 = 85%
        bool isCollateralized;
        bool isRepaid;
        string ipfsCID;
        bytes32 legalAssignmentHash;
        uint256 requestedAmount; // 18 decimals — user's desired financing amount in USD
    }

    address public acurastProcessor;
    address public lendingPool;

    mapping(uint256 => InvoiceData) public invoices;
    mapping(bytes32 => bool) public usedInvoiceHashes;
    mapping(string => bool) public usedQbInvoiceIds;

    uint256 private _nextTokenId = 1;

    event MintRequested(uint256 indexed tokenId, address indexed borrower, bytes32 invoiceHash);
    event InvoiceMinted(
        uint256 indexed tokenId,
        address indexed borrower,
        uint256 faceValueUSD,
        uint8 riskTier,
        uint16 discountRateBps
    );
    event InvoiceBurned(uint256 indexed tokenId, address indexed borrower);
    event ProcessorSet(address indexed processor);
    event LendingPoolSet(address indexed lendingPool);

    modifier onlyLendingPool() {
        require(msg.sender == lendingPool, "InvoiceNFT: caller is not the lending pool");
        _;
    }

    constructor(address _acurastProcessor) ERC721("Sprout Invoice NFT", "SINV") Ownable(msg.sender) {
        require(_acurastProcessor != address(0), "InvoiceNFT: zero address");
        acurastProcessor = _acurastProcessor;
    }

    /// @notice Request minting of an invoice NFT. The NFT is NOT minted yet — Acurast must fulfill risk first.
    /// @param data Invoice data including QB invoice details and IPFS CID
    /// @return pendingTokenId The token ID reserved for this invoice (not yet minted)
    function requestMint(InvoiceData calldata data) external returns (uint256 pendingTokenId) {
        require(data.borrower == msg.sender, "InvoiceNFT: borrower mismatch");
        require(!usedInvoiceHashes[data.invoiceHash], "Duplicate invoice");
        require(bytes(data.qbInvoiceId).length > 0, "InvoiceNFT: empty QB invoice ID");
        require(!usedQbInvoiceIds[data.qbInvoiceId], "Duplicate invoice");
        require(data.faceValueUSD > 0, "InvoiceNFT: zero face value");
        require(data.dueDate > block.timestamp, "InvoiceNFT: invoice already due");

        pendingTokenId = _nextTokenId++;

        usedInvoiceHashes[data.invoiceHash] = true;
        usedQbInvoiceIds[data.qbInvoiceId] = true;

        invoices[pendingTokenId] = InvoiceData({
            tokenId: pendingTokenId,
            borrower: data.borrower,
            invoiceHash: data.invoiceHash,
            faceValueUSD: data.faceValueUSD,
            faceValueOriginal: data.faceValueOriginal,
            originalCurrency: data.originalCurrency,
            dueDate: data.dueDate,
            issuedDate: data.issuedDate,
            debtorHash: data.debtorHash,
            qbInvoiceId: data.qbInvoiceId,
            qbRealmId: data.qbRealmId,
            discountRateBps: 0, // set by Acurast
            riskTier: 0, // set by Acurast
            maxLtvBps: 0, // set by Acurast
            isCollateralized: false,
            isRepaid: false,
            ipfsCID: data.ipfsCID,
            legalAssignmentHash: data.legalAssignmentHash,
            requestedAmount: data.requestedAmount
        });

        emit MintRequested(pendingTokenId, msg.sender, data.invoiceHash);
    }

    /// @notice Fulfill risk assessment from Acurast TEE. Mints the NFT upon successful verification.
    /// @param tokenId The pending token ID from requestMint
    /// @param discountRateBps Discount rate in basis points (50-1500) set by Acurast
    /// @param riskTier Risk tier 1-5 set by Acurast
    /// @param maxLtvBps Maximum loan-to-value in basis points set by Acurast
    /// @param signature Secp256k1 signature from acurastProcessor over keccak256(tokenId | discountBps | riskTier | maxLtvBps)
    function fulfillRisk(
        uint256 tokenId,
        uint16 discountRateBps,
        uint8 riskTier,
        uint16 maxLtvBps,
        bytes calldata signature
    ) external {
        InvoiceData storage invoice = invoices[tokenId];
        require(invoice.borrower != address(0), "InvoiceNFT: unknown token");
        require(invoice.riskTier == 0, "InvoiceNFT: already fulfilled");
        require(discountRateBps >= 50 && discountRateBps <= 1500, "InvoiceNFT: invalid discount rate");
        require(riskTier >= 1 && riskTier <= 5, "InvoiceNFT: invalid risk tier");
        require(maxLtvBps > 0 && maxLtvBps <= 10000, "InvoiceNFT: invalid maxLtv");

        // Verify signature: secp256k1.sign(keccak256(abi.encodePacked(tokenId, discountRateBps, riskTier, maxLtvBps)))
        // Acurast TEE signs the raw 32-byte hash with no Ethereum prefix — use ECDSA.recover directly.
        bytes32 messageHash = keccak256(abi.encodePacked(tokenId, discountRateBps, riskTier, maxLtvBps));
        address signer = ECDSA.recover(messageHash, signature);
        require(signer == acurastProcessor, "InvoiceNFT: invalid signature");

        invoice.discountRateBps = discountRateBps;
        invoice.riskTier = riskTier;
        invoice.maxLtvBps = maxLtvBps;

        _safeMint(invoice.borrower, tokenId);

        emit InvoiceMinted(tokenId, invoice.borrower, invoice.faceValueUSD, riskTier, discountRateBps);
    }

    /// @notice Burn an invoice NFT. Only callable by the lending pool (on repayment or default resolution).
    function burn(uint256 tokenId) external onlyLendingPool {
        address borrower = invoices[tokenId].borrower;
        require(borrower != address(0), "InvoiceNFT: unknown token");
        _burn(tokenId);
        emit InvoiceBurned(tokenId, borrower);
    }

    /// @notice Get full invoice data for a token
    function getInvoice(uint256 tokenId) external view returns (InvoiceData memory) {
        require(invoices[tokenId].borrower != address(0), "InvoiceNFT: unknown token");
        return invoices[tokenId];
    }

    /// @notice Set the lending pool address
    function setLendingPool(address _lendingPool) external onlyOwner {
        require(_lendingPool != address(0), "InvoiceNFT: zero address");
        lendingPool = _lendingPool;
        emit LendingPoolSet(_lendingPool);
    }

    /// @notice Set the Acurast processor address
    function setProcessor(address _processor) external onlyOwner {
        require(_processor != address(0), "InvoiceNFT: zero address");
        acurastProcessor = _processor;
        emit ProcessorSet(_processor);
    }

    /// @notice Mark invoice as collateralized (called by LendingPool on depositCollateral)
    function markCollateralized(uint256 tokenId) external onlyLendingPool {
        require(invoices[tokenId].borrower != address(0), "InvoiceNFT: unknown token");
        invoices[tokenId].isCollateralized = true;
    }

    /// @notice Mark invoice as repaid (called by LendingPool on repayment)
    function markRepaid(uint256 tokenId) external onlyLendingPool {
        require(invoices[tokenId].borrower != address(0), "InvoiceNFT: unknown token");
        invoices[tokenId].isRepaid = true;
    }
}
