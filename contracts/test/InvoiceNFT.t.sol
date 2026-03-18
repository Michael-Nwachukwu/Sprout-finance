// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/InvoiceNFT.sol";

contract InvoiceNFTTest is Test {
    // Mirror events for vm.expectEmit
    event MintRequested(uint256 indexed tokenId, address indexed borrower, bytes32 invoiceHash);
    InvoiceNFT nft;

    address owner = address(this);
    uint256 processorPrivKey = 0xA11CE;
    address processor;
    address lendingPool = address(0x3333);
    address borrower = address(0x4444);
    address stranger = address(0x5555);

    function setUp() public {
        processor = vm.addr(processorPrivKey);
        nft = new InvoiceNFT(processor);
        nft.setLendingPool(lendingPool);
    }

    // ─── requestMint ─────────────────────────────────────────────────────────

    function test_RequestMint_ReturnsTokenId1() public {
        InvoiceNFT.InvoiceData memory data = _makeInvoiceData(borrower, "INV-001");
        vm.prank(borrower);
        uint256 tokenId = nft.requestMint(data);
        assertEq(tokenId, 1);
    }

    function test_RequestMint_StartsAtOne() public {
        InvoiceNFT.InvoiceData memory d1 = _makeInvoiceData(borrower, "INV-001");
        InvoiceNFT.InvoiceData memory d2 = _makeInvoiceDataAlt(borrower, "INV-002");
        vm.prank(borrower);
        uint256 t1 = nft.requestMint(d1);
        vm.prank(borrower);
        uint256 t2 = nft.requestMint(d2);
        assertEq(t1, 1);
        assertEq(t2, 2);
    }

    function test_RequestMint_RevertsDuplicate_Hash() public {
        InvoiceNFT.InvoiceData memory data = _makeInvoiceData(borrower, "INV-001");
        vm.prank(borrower);
        nft.requestMint(data);
        vm.prank(borrower);
        vm.expectRevert("Duplicate invoice");
        nft.requestMint(data);
    }

    function test_RequestMint_RevertsDuplicate_QbId() public {
        InvoiceNFT.InvoiceData memory d1 = _makeInvoiceData(borrower, "INV-001");
        // Different hash but same qbInvoiceId
        InvoiceNFT.InvoiceData memory d2 = _makeInvoiceData(borrower, "INV-001");
        d2.invoiceHash = keccak256("different");
        vm.prank(borrower);
        nft.requestMint(d1);
        vm.prank(borrower);
        vm.expectRevert("Duplicate invoice");
        nft.requestMint(d2);
    }

    function test_RequestMint_EmitsMintRequested() public {
        InvoiceNFT.InvoiceData memory data = _makeInvoiceData(borrower, "INV-001");
        vm.prank(borrower);
        vm.expectEmit(true, true, false, false);
        emit MintRequested(1, borrower, data.invoiceHash);
        nft.requestMint(data);
    }

    function test_RequestMint_DoesNotMintNFT() public {
        InvoiceNFT.InvoiceData memory data = _makeInvoiceData(borrower, "INV-001");
        vm.prank(borrower);
        uint256 tokenId = nft.requestMint(data);
        assertEq(nft.balanceOf(borrower), 0);
        // Token exists in invoices map but not minted
        InvoiceNFT.InvoiceData memory stored = nft.getInvoice(tokenId);
        assertEq(stored.riskTier, 0);
    }

    // ─── fulfillRisk ─────────────────────────────────────────────────────────

    function test_FulfillRisk_MintsNFT() public {
        uint256 tokenId = _requestMint("INV-001");
        _fulfill(tokenId, 300, 2, 8000);
        assertEq(nft.ownerOf(tokenId), borrower);
        assertEq(nft.balanceOf(borrower), 1);
    }

    function test_FulfillRisk_SetsRiskData() public {
        uint256 tokenId = _requestMint("INV-001");
        _fulfill(tokenId, 300, 2, 8000);
        InvoiceNFT.InvoiceData memory invoice = nft.getInvoice(tokenId);
        assertEq(invoice.discountRateBps, 300);
        assertEq(invoice.riskTier, 2);
        assertEq(invoice.maxLtvBps, 8000);
    }

    function test_FulfillRisk_RevertsInvalidSignature() public {
        uint256 tokenId = _requestMint("INV-001");
        // Sign with wrong key — no eth prefix, raw hash
        bytes32 hash = keccak256(abi.encodePacked(tokenId, uint16(300), uint8(2), uint16(8000)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, hash);
        bytes memory badSig = abi.encodePacked(r, s, v);
        vm.expectRevert("InvoiceNFT: invalid signature");
        nft.fulfillRisk(tokenId, 300, 2, 8000, badSig);
    }

    function test_FulfillRisk_RevertsAlreadyFulfilled() public {
        uint256 tokenId = _requestMint("INV-001");
        _fulfill(tokenId, 300, 2, 8000);
        bytes memory sig = _signFulfill(tokenId, 300, 2, 8000);
        vm.expectRevert("InvoiceNFT: already fulfilled");
        nft.fulfillRisk(tokenId, 300, 2, 8000, sig);
    }

    function test_FulfillRisk_RevertsInvalidDiscountRate() public {
        uint256 tokenId = _requestMint("INV-001");
        bytes memory sig = _signFulfill(tokenId, 30, 2, 8000); // below 50
        vm.expectRevert("InvoiceNFT: invalid discount rate");
        nft.fulfillRisk(tokenId, 30, 2, 8000, sig);
    }

    // ─── burn ─────────────────────────────────────────────────────────────────

    function test_Burn_OnlyLendingPool() public {
        uint256 tokenId = _requestMint("INV-001");
        _fulfill(tokenId, 300, 2, 8000);
        vm.prank(stranger);
        vm.expectRevert("InvoiceNFT: caller is not the lending pool");
        nft.burn(tokenId);
    }

    function test_Burn_Success() public {
        uint256 tokenId = _requestMint("INV-001");
        _fulfill(tokenId, 300, 2, 8000);
        vm.prank(lendingPool);
        nft.burn(tokenId);
        assertEq(nft.balanceOf(borrower), 0);
    }

    // ─── setLendingPool / setProcessor ────────────────────────────────────────

    function test_SetLendingPool_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        nft.setLendingPool(stranger);
    }

    function test_SetProcessor_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        nft.setProcessor(stranger);
    }

    // ─── requestedAmount ────────────────────────────────────────────────────

    function test_RequestMint_StoresRequestedAmount() public {
        InvoiceNFT.InvoiceData memory data = _makeInvoiceData(borrower, "INV-REQ");
        data.requestedAmount = 10000 * 1e18;
        vm.prank(borrower);
        uint256 tokenId = nft.requestMint(data);
        InvoiceNFT.InvoiceData memory stored = nft.getInvoice(tokenId);
        assertEq(stored.requestedAmount, 10000 * 1e18);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _makeInvoiceData(address _borrower, string memory qbId)
        internal
        view
        returns (InvoiceNFT.InvoiceData memory)
    {
        return InvoiceNFT.InvoiceData({
            tokenId: 0,
            borrower: _borrower,
            invoiceHash: keccak256(abi.encodePacked(qbId)),
            faceValueUSD: 18000 * 1e18,
            faceValueOriginal: 1800000000000, // 18000 * 1e8
            originalCurrency: "USD",
            dueDate: block.timestamp + 90 days,
            issuedDate: block.timestamp,
            debtorHash: keccak256("Acme Corp 123"),
            qbInvoiceId: qbId,
            qbRealmId: "realm-001",
            discountRateBps: 0,
            riskTier: 0,
            maxLtvBps: 0,
            isCollateralized: false,
            isRepaid: false,
            ipfsCID: "bafybeig...",
            legalAssignmentHash: bytes32(0),
            requestedAmount: 0
        });
    }

    function _makeInvoiceDataAlt(address _borrower, string memory qbId)
        internal
        view
        returns (InvoiceNFT.InvoiceData memory)
    {
        InvoiceNFT.InvoiceData memory d = _makeInvoiceData(_borrower, qbId);
        d.invoiceHash = keccak256(abi.encodePacked("alt", qbId));
        return d;
    }

    function _requestMint(string memory qbId) internal returns (uint256) {
        InvoiceNFT.InvoiceData memory data = _makeInvoiceData(borrower, qbId);
        vm.prank(borrower);
        return nft.requestMint(data);
    }

    function _signFulfill(uint256 tokenId, uint16 discountBps, uint8 riskTier, uint16 maxLtv)
        internal
        view
        returns (bytes memory)
    {
        // Acurast TEE signs raw 32-byte hash with no Ethereum prefix
        bytes32 hash = keccak256(abi.encodePacked(tokenId, discountBps, riskTier, maxLtv));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(processorPrivKey, hash);
        return abi.encodePacked(r, s, v);
    }

    function _fulfill(uint256 tokenId, uint16 discountBps, uint8 riskTier, uint16 maxLtv) internal {
        bytes memory sig = _signFulfill(tokenId, discountBps, riskTier, maxLtv);
        nft.fulfillRisk(tokenId, discountBps, riskTier, maxLtv, sig);
    }
}
